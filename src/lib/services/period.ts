// Aylık kapanış: iki sayım arasındaki dönem için gerçek ve teorik tüketim, zayi ve gıda maliyeti oranı.
// Maliyet yöntemi: dönem ağırlıklı ortalaması = (açılış değeri + dönem alışları) / (açılış miktarı + alış miktarı)
import { num, prisma, type Tx } from "../db";
import { round } from "../costing";
import { key } from "../menuImport";

export interface PeriodRow {
  stockItemId: string;
  name: string;
  unit: "GR" | "ML" | "ADET";
  openQty: number;
  openCost: number;
  purchQty: number;
  purchValue: number;
  closeQty: number;
  avgCost: number;
  actualQty: number;
  theoQty: number;
  diffQty: number;
  actualValue: number;
  theoValue: number;
  diffValue: number;
  /** Fark / teorik tüketim (%) */
  diffPct: number | null;
  /** Açılış veya kapanış sayımında yer almıyor: gerçek tüketim bilinmiyor, toplamlara katılmaz */
  incomplete: boolean;
}

export async function periodReport(organizationId: string, openingId: string, closingId: string) {
  const [opening, closing] = await Promise.all([
    prisma.stockCount.findFirstOrThrow({ where: { id: openingId, organizationId }, include: { lines: true, branch: { include: { company: true } } } }),
    prisma.stockCount.findFirstOrThrow({ where: { id: closingId, organizationId }, include: { lines: true } }),
  ]);
  if (opening.branchId !== closing.branchId) throw new Error("Açılış ve kapanış sayımı aynı şubeye ait olmalı");
  if (opening.countedAt >= closing.countedAt) throw new Error("Kapanış sayımı açılış sayımından sonra olmalı");
  const branchId = opening.branchId;
  const from = opening.countedAt;
  const to = closing.countedAt;

  const [items, purchLines, importLines, posItems, recipes, adisyoOrders, aliases, products] = await Promise.all([
    prisma.stockItem.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    // Dönem alışları: açılış sayımından sonra, kapanış sayımına kadar (fatura tarihi)
    prisma.purchaseLine.findMany({
      where: { invoice: { branchId, date: { gt: from, lte: to } } },
      include: { stockItem: true },
    }),
    // Dış sistemden yüklenen satışlar (dönem içine düşen raporlar)
    prisma.salesImportLine.findMany({
      where: { import: { branchId, periodStart: { gt: from }, periodEnd: { lte: to } } },
      include: { product: true },
    }),
    // Programın kendi kasasından yapılan satışlar
    prisma.orderItem.findMany({
      where: { status: "ACTIVE", order: { branchId, status: "PAID", closedAt: { gt: from, lte: to } } },
    }),
    prisma.recipeLine.findMany({ where: { product: { organizationId } } }),
    // Adisyo'dan API ile çekilen siparişler (iptaller hariç)
    prisma.adisyoOrder.findMany({
      where: { branchId, cancelled: false, orderDate: { gt: from, lte: to } },
      include: { lines: { where: { cancelled: false } } },
    }),
    prisma.productAlias.findMany({ where: { organizationId } }),
    prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, vatRate: true } }),
  ]);
  // Aynı dönem için Adisyo API verisi varsa Excel ile yüklenen rapor kullanılmaz (çift sayım olmasın)
  const saleLines = adisyoOrders.length ? [] : importLines;

  // Ürün satış adetleri ve ciro
  const soldQty = new Map<string, number>();
  let revenueGross = 0;
  let revenueNet = 0;
  let unmatchedQty = 0;
  const unmatched = new Map<string, number>();
  for (const l of saleLines) {
    const q = num(l.quantity);
    revenueGross += num(l.revenue);
    revenueNet += num(l.revenue) / (1 + (l.product?.vatRate ?? 10) / 100);
    if (!l.productId) {
      unmatchedQty += q;
      unmatched.set(l.externalName, (unmatched.get(l.externalName) ?? 0) + q);
      continue;
    }
    soldQty.set(l.productId, (soldQty.get(l.productId) ?? 0) + q);
  }
  // Adisyo siparişleri: ürün adı → menüdeki ürün (eşleştirme hafızası, yoksa birebir ad)
  const aliasOf = new Map(aliases.map((a) => [a.alias, a.productId]));
  const productByKey = new Map(products.map((p) => [key(p.name), p]));
  const vatOf = new Map(products.map((p) => [p.id, p.vatRate]));
  const hasRecipe = new Set(recipes.map((r) => r.productId));
  const resolve = (name: string) => aliasOf.get(key(name)) ?? productByKey.get(key(name))?.id ?? null;
  for (const o of adisyoOrders) {
    revenueGross += num(o.total);
    // Sipariş KDV oranı bilinmediği için kalemlerin ağırlıklı oranı; kalem yoksa %10
    const lineSum = o.lines.reduce((t, l) => t + num(l.amount), 0) || 1;
    let netShare = 0;
    for (const l of o.lines) netShare += (num(l.amount) / lineSum) / (1 + (vatOf.get(resolve(l.productName) ?? "") ?? 10) / 100);
    revenueNet += num(o.total) * (o.lines.length ? netShare : 1 / 1.1);
    const children = new Map<string, typeof o.lines>();
    for (const l of o.lines) if (l.parentId) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l]);
    for (const l of o.lines) {
      if (l.parentId) continue; // alt kalemler aşağıda, menünün durumuna göre
      const pid = resolve(l.productName);
      const subs = (l.externalId && children.get(l.externalId)) || [];
      const countLine = (name: string, q: number, id: string | null) => {
        if (id) soldQty.set(id, (soldQty.get(id) ?? 0) + q);
        else {
          unmatchedQty += q;
          unmatched.set(name, (unmatched.get(name) ?? 0) + q);
        }
      };
      if (subs.length && !(pid && hasRecipe.has(pid))) {
        // Menünün kendi reçetesi yok: içindeki ürünler sayılır
        for (const c of subs) countLine(c.productName, num(c.quantity), resolve(c.productName));
      } else {
        countLine(l.productName, num(l.quantity), pid);
      }
    }
  }
  for (const i of posItems) {
    soldQty.set(i.productId, (soldQty.get(i.productId) ?? 0) + i.quantity);
    revenueGross += num(i.unitPrice) * i.quantity;
    revenueNet += (num(i.unitPrice) * i.quantity) / (1 + i.vatRate / 100);
  }
  // Satılıp reçetesi olmayan ürünler
  const withRecipe = new Set(recipes.map((r) => r.productId));
  const noRecipe = [...soldQty.keys()].filter((p) => !withRecipe.has(p));

  // Teorik tüketim (temel birim)
  const theo = new Map<string, number>();
  for (const r of recipes) {
    const q = soldQty.get(r.productId);
    if (!q) continue;
    theo.set(r.stockItemId, (theo.get(r.stockItemId) ?? 0) + q * num(r.quantity) * (1 + num(r.wastePct) / 100));
  }

  const openLine = new Map(opening.lines.map((l) => [l.stockItemId, l]));
  const closeLine = new Map(closing.lines.map((l) => [l.stockItemId, l]));
  const purch = new Map<string, { qty: number; value: number }>();
  let nonStockPurch = 0;
  for (const l of purchLines) {
    if (!l.stockItem) {
      nonStockPurch += num(l.lineNet);
      continue;
    }
    const p = purch.get(l.stockItem.id) ?? { qty: 0, value: 0 };
    p.qty += num(l.quantity) * num(l.stockItem.purchaseUnitFactor);
    p.value += num(l.lineNet);
    purch.set(l.stockItem.id, p);
  }

  const rows: PeriodRow[] = [];
  for (const it of items) {
    const o = openLine.get(it.id);
    const incomplete = !o || !closeLine.has(it.id);
    const openQty = num(o?.quantity);
    const openCost = o?.unitCost != null ? num(o.unitCost) : num(it.lastCost);
    const p = purch.get(it.id) ?? { qty: 0, value: 0 };
    const closeQty = num(closeLine.get(it.id)?.quantity);
    const theoQty = theo.get(it.id) ?? 0;
    if (!openQty && !p.qty && !closeQty && !theoQty) continue;
    const denom = openQty + p.qty;
    const avgCost = denom > 0 ? (openQty * openCost + p.value) / denom : openCost;
    const actualQty = openQty + p.qty - closeQty;
    const diffQty = actualQty - theoQty;
    rows.push({
      stockItemId: it.id,
      name: it.name,
      unit: it.unit,
      openQty,
      openCost,
      purchQty: p.qty,
      purchValue: p.value,
      closeQty,
      avgCost,
      actualQty,
      theoQty,
      diffQty,
      actualValue: actualQty * avgCost,
      theoValue: theoQty * avgCost,
      diffValue: diffQty * avgCost,
      diffPct: theoQty > 0 ? round((diffQty / theoQty) * 100, 1) : null,
      incomplete,
    });
  }
  rows.sort((a, b) => Number(a.incomplete) - Number(b.incomplete) || b.diffValue - a.diffValue);

  // Toplamlar yalnızca hem açılışta hem kapanışta sayılmış malzemelerden
  const complete = rows.filter((r) => !r.incomplete);
  const missing = rows.filter((r) => r.incomplete);
  const sum = (f: (r: PeriodRow) => number) => round(complete.reduce((s, r) => s + f(r), 0));
  const openValue = sum((r) => r.openQty * r.openCost);
  const purchValue = sum((r) => r.purchValue);
  const closeValue = sum((r) => r.closeQty * r.avgCost);
  const cogs = round(openValue + purchValue - closeValue); // harcanan mal (SMM)
  const theoValue = sum((r) => r.theoValue);
  const net = round(revenueNet);
  return {
    opening,
    closing,
    branch: opening.branch,
    rows,
    totals: {
      openValue,
      purchValue,
      nonStockPurch: round(nonStockPurch),
      closeValue,
      cogs,
      theoValue,
      wasteValue: round(cogs - theoValue),
      revenueGross: round(revenueGross),
      revenueNet: net,
      actualPct: net ? round((cogs / net) * 100, 1) : null,
      theoPct: net ? round((theoValue / net) * 100, 1) : null,
      salesQty: [...soldQty.values()].reduce((a, b) => a + b, 0),
      unmatchedQty,
      missingTheoValue: round(missing.reduce((s, r) => s + r.theoValue, 0)),
      missingPurchValue: round(missing.reduce((s, r) => s + r.purchValue, 0)),
    },
    missing: missing.map((r) => r.name),
    unmatched: [...unmatched.entries()].map(([name, qty]) => ({ name, qty })),
    noRecipe,
    salesSources: {
      imports: saleLines.length,
      posItems: posItems.length,
      adisyoOrders: adisyoOrders.length,
      importIgnored: adisyoOrders.length > 0 && importLines.length > 0,
    },
  };
}

/** Dönemi kapat: kapanış sayımındaki birim maliyetleri dönem ortalamasıyla sabitler (bir sonraki ayın açılış maliyeti olur) */
export async function lockPeriodCosts(tx: Tx, organizationId: string, closingId: string, costs: { stockItemId: string; avgCost: number }[]) {
  const closing = await tx.stockCount.findFirstOrThrow({ where: { id: closingId, organizationId } });
  for (const c of costs) {
    await tx.stockCountLine.updateMany({ where: { countId: closing.id, stockItemId: c.stockItemId }, data: { unitCost: c.avgCost } });
  }
}

/** Sayımı kaydeder; istenirse şube stok miktarlarını sayıma eşitler */
export async function saveCount(
  tx: Tx,
  organizationId: string,
  branchId: string,
  countedAt: Date,
  lines: { stockItemId: string; quantity: number; unitCost: number | null }[],
  applyToStock: boolean,
  fileName?: string,
) {
  const existing = await tx.stockCount.findUnique({ where: { branchId_countedAt: { branchId, countedAt } } });
  if (existing) throw new Error("Bu şube için aynı tarihli bir sayım zaten var. Önce onu silin.");
  const count = await tx.stockCount.create({
    data: {
      organizationId,
      branchId,
      countedAt,
      fileName,
      lines: { create: lines.map((l) => ({ stockItemId: l.stockItemId, quantity: l.quantity, unitCost: l.unitCost })) },
    },
  });
  if (applyToStock) {
    for (const l of lines) {
      const level = await tx.stockLevel.findUnique({ where: { branchId_stockItemId: { branchId, stockItemId: l.stockItemId } } });
      const diff = l.quantity - num(level?.quantity);
      const cost = l.unitCost ?? num(level?.avgCost);
      await tx.stockLevel.upsert({
        where: { branchId_stockItemId: { branchId, stockItemId: l.stockItemId } },
        create: { branchId, stockItemId: l.stockItemId, quantity: l.quantity, avgCost: cost },
        update: { quantity: l.quantity, ...(l.unitCost != null ? { avgCost: l.unitCost } : {}) },
      });
      if (diff !== 0) {
        await tx.stockMovement.create({
          data: { organizationId, branchId, stockItemId: l.stockItemId, type: "ADJUSTMENT", quantity: diff, unitCost: cost, refId: count.id },
        });
      }
    }
  }
  return count;
}
