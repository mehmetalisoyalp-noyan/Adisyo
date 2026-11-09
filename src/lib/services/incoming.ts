// Gelen e-fatura (UBL-TR XML) → alış faturası
//  1) importXml: dosyaları okur, gelen belge kuyruğuna ekler (mükerrer ETTN'leri ve bizim kestiğimiz faturaları ayıklar)
//  2) prepareMapping: kalemleri hafızadaki eşleştirmeler ve ad benzerliğiyle stok kalemlerine önerir
//  3) processIncoming: alış faturasını kaydeder (stok + ortalama maliyet + tedarikçi carisi) ve eşleştirmeleri hatırlar
import { num, prisma, type Tx } from "../db";
import { round } from "../costing";
import { defaultBaseQty, itemKey, parseUbl, type UblInvoice } from "../ubl";
import { recordPurchase } from "./stock";
import { stripAttachments } from "../xmlstrip";

export type ImportResult = {
  file: string;
  status: "added" | "duplicate" | "skipped" | "error";
  message: string;
};

export async function importXml(organizationId: string, files: { name: string; xml: string }[]) {
  // Gruptaki şirketlerin vergi numaraları: alıcı VKN'si hangi şirketinse fatura onun alışıdır
  const companies = await prisma.company.findMany({ where: { organizationId } });
  const byTax = new Map(companies.filter((c) => c.taxNumber).map((c) => [c.taxNumber!, c]));
  const results: ImportResult[] = [];
  for (const f of files) {
    let inv: UblInvoice;
    try {
      inv = parseUbl(stripAttachments(f.xml));
    } catch (e) {
      results.push({ file: f.name, status: "error", message: e instanceof Error ? e.message : "Okunamadı" });
      continue;
    }
    if (!inv.uuid || !inv.lines.length) {
      results.push({ file: f.name, status: "error", message: "ETTN veya fatura kalemi bulunamadı" });
      continue;
    }
    const seller = inv.supplier.taxNumber ? byTax.get(inv.supplier.taxNumber) : undefined;
    if (seller) {
      results.push({ file: f.name, status: "skipped", message: `${inv.number}: ${seller.name} tarafından kesilmiş (giden) fatura` });
      continue;
    }
    const buyer = inv.customer.taxNumber ? byTax.get(inv.customer.taxNumber) : undefined;
    const exists =
      (await prisma.eDocument.findFirst({
        where: { organizationId, direction: "INCOMING", externalId: inv.uuid },
      })) ?? (await prisma.purchaseInvoice.findFirst({ where: { organizationId, eInvoiceUuid: inv.uuid } }));
    if (exists) {
      results.push({ file: f.name, status: "duplicate", message: `${inv.number} daha önce yüklenmiş` });
      continue;
    }
    await prisma.eDocument.create({
      data: {
        organizationId,
        type: inv.profile === "EARSIVFATURA" ? "E_ARSIV" : "E_FATURA",
        direction: "INCOMING",
        status: "DRAFT",
        provider: "xml-yukleme",
        externalId: inv.uuid,
        documentNo: inv.number,
        payload: inv as unknown as object,
      },
    });
    const note = inv.typeCode && inv.typeCode !== "SATIS" ? ` (tür: ${inv.typeCode}, kontrol edin)` : "";
    const to = buyer ? ` → ${buyer.name}` : " → alıcı VKN'si şirketlerinizle eşleşmedi";
    results.push({
      file: f.name,
      status: "added",
      message: `${inv.number} · ${inv.supplier.name} · ${inv.payable.toFixed(2)} TL${to}${note}`,
    });
  }
  return results;
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-zçğıöşü\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

/** Basit ad benzerliği: ortak kelime sayısı (kelime başı eşleşmesi de sayılır) */
export function similarity(a: string, b: string) {
  const A = norm(a);
  const B = norm(b);
  let score = 0;
  for (const x of A) if (B.some((y) => y === x || y.startsWith(x) || x.startsWith(y))) score++;
  return score;
}

export async function prepareMapping(organizationId: string, docId: string) {
  const doc = await prisma.eDocument.findFirstOrThrow({
    where: { id: docId, organizationId, direction: "INCOMING" },
  });
  const inv = doc.payload as unknown as UblInvoice;
  const buyerCompany = inv.customer.taxNumber
    ? await prisma.company.findFirst({ where: { organizationId, taxNumber: inv.customer.taxNumber } })
    : null;
  const [supplier, stockItems] = await Promise.all([
    inv.supplier.taxNumber
      ? prisma.account.findFirst({ where: { organizationId, taxNumber: inv.supplier.taxNumber } })
      : null,
    prisma.stockItem.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
  ]);
  const mappings = supplier
    ? await prisma.supplierItemMapping.findMany({ where: { organizationId, supplierId: supplier.id } })
    : [];
  const byKey = new Map(mappings.map((m) => [m.itemKey, m]));
  const lines = inv.lines.map((l) => {
    const remembered = byKey.get(itemKey(l));
    let stockItemId: string | null = null;
    let source: "memory" | "guess" | "none" = "none";
    if (remembered) {
      stockItemId = remembered.stockItemId;
      source = "memory";
    } else {
      const best = stockItems
        .map((s) => ({ s, score: similarity(l.name, s.name) }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.score > 0) {
        stockItemId = best.s.id;
        source = "guess";
      }
    }
    const item = stockItems.find((s) => s.id === stockItemId);
    const baseQtyPerUnit = remembered
      ? num(remembered.baseQtyPerUnit)
      : item
        ? defaultBaseQty(l.unitCode, item.unit, num(item.purchaseUnitFactor))
        : 1;
    return { ...l, stockItemId, baseQtyPerUnit, source };
  });
  return { doc, inv, supplier, stockItems, lines, buyerCompany };
}

export interface ProcessInput {
  branchId: string;
  lines: { lineNo: string; stockItemId: string | null; baseQtyPerUnit: number }[];
}

export async function processIncoming(tx: Tx, organizationId: string, docId: string, input: ProcessInput) {
  const doc = await tx.eDocument.findFirstOrThrow({
    where: { id: docId, organizationId, direction: "INCOMING" },
  });
  if (doc.status !== "DRAFT") throw new Error("Bu belge zaten işlenmiş");
  const inv = doc.payload as unknown as UblInvoice;
  const branch = await tx.branch.findFirstOrThrow({ where: { id: input.branchId, organizationId }, include: { company: true } });
  const buyer = inv.customer.taxNumber
    ? await tx.company.findFirst({ where: { organizationId, taxNumber: inv.customer.taxNumber } })
    : null;
  if (buyer && buyer.id !== branch.companyId) {
    throw new Error(`Fatura ${buyer.name} adına kesilmiş; ${branch.company.name} şubesine kaydedilemez`);
  }

  // Tedarikçi carisi: vergi numarasıyla bul, yoksa aç
  let supplier = inv.supplier.taxNumber
    ? await tx.account.findFirst({ where: { organizationId, taxNumber: inv.supplier.taxNumber } })
    : await tx.account.findFirst({ where: { organizationId, type: "SUPPLIER", name: inv.supplier.name } });
  if (!supplier) {
    supplier = await tx.account.create({
      data: {
        organizationId,
        type: "SUPPLIER",
        name: inv.supplier.name,
        taxNumber: inv.supplier.taxNumber,
        taxOffice: inv.supplier.taxOffice,
        address: inv.supplier.address,
        email: inv.supplier.email,
        phone: inv.supplier.phone,
      },
    });
  }

  const items = await tx.stockItem.findMany({ where: { organizationId } });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const choice = new Map(input.lines.map((l) => [l.lineNo, l]));

  const purchaseLines = inv.lines
    .filter((l) => l.lineNet > 0 && l.quantity > 0)
    .map((l) => {
      const c = choice.get(l.lineNo);
      const item = c?.stockItemId ? itemById.get(c.stockItemId) : undefined;
      if (c?.stockItemId && !item) throw new Error(`Geçersiz stok kalemi (satır ${l.lineNo})`);
      if (item) {
        if (!(c!.baseQtyPerUnit > 0)) throw new Error(`Satır ${l.lineNo}: birim çevrimi sıfırdan büyük olmalı`);
        // Alış birimi cinsinden miktar (örn. 10 KGM × 1000 gr / 1000 = 10 kg)
        const qty = (l.quantity * c!.baseQtyPerUnit) / num(item.purchaseUnitFactor);
        return { stockItemId: item.id, quantity: qty, unitPrice: l.lineNet / qty, vatRate: Math.round(l.vatRate), lineNet: l.lineNet };
      }
      return {
        stockItemId: null,
        description: l.name,
        quantity: l.quantity,
        unitPrice: l.lineNet / l.quantity,
        vatRate: Math.round(l.vatRate),
        lineNet: l.lineNet,
      };
    });

  const purchase = await recordPurchase(tx, {
    organizationId,
    branchId: input.branchId,
    supplierId: supplier.id,
    invoiceNo: inv.number,
    // Fatura tarihi Türkiye saatiyle öğlen (gün kaymasını önler)
    date: new Date(`${inv.issueDate}T12:00:00+03:00`),
    eInvoiceUuid: inv.uuid,
    payable: inv.payable || undefined,
    lines: purchaseLines,
  });

  // Eşleştirmeleri hatırla
  for (const l of inv.lines) {
    const c = choice.get(l.lineNo);
    if (!c) continue;
    const key = itemKey(l);
    await tx.supplierItemMapping.upsert({
      where: { organizationId_supplierId_itemKey: { organizationId, supplierId: supplier.id, itemKey: key } },
      create: { organizationId, supplierId: supplier.id, itemKey: key, stockItemId: c.stockItemId, baseQtyPerUnit: c.baseQtyPerUnit || 1 },
      update: { stockItemId: c.stockItemId, baseQtyPerUnit: c.baseQtyPerUnit || 1 },
    });
  }

  await tx.eDocument.update({
    where: { id: doc.id },
    data: { status: "PROCESSED", purchaseInvoiceId: purchase.id },
  });
  return { purchase, totalDiff: round(num(purchase.total) - inv.payable) };
}
