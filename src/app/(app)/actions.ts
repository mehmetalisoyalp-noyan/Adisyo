"use server";
// Tüm sunucu işlemleri. Her işlem oturumu ve kiracı (organizationId) sahipliğini doğrular.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { closeOrder, nextOrderNumber, recalcTotal } from "@/lib/services/orders";
import { adjustStock, recordPurchase } from "@/lib/services/stock";
import { issueForOrder } from "@/lib/services/edocument";
import { importXml, processIncoming, type ProcessInput } from "@/lib/services/incoming";
import { key as menuKey, parseMenuWorkbook, previewCosts } from "@/lib/menuImport";
import { applyMenuImport } from "@/lib/services/menuImport";

const decimal = (v: FormDataEntryValue | null) => Number(String(v ?? "0").replace(",", ".")) || 0;

async function ownOrder(orderId: string) {
  const s = await requireSession();
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId: s.organizationId } });
  if (!canAccessBranch(s, order.branchId)) throw new Error("Bu şubeye erişiminiz yok");
  return { s, order };
}

// ---------------------------------------------------------------- Satış ekranı

export async function openOrder(branchId: string, tableId: string | null, type: "DINE_IN" | "TAKEAWAY" | "DELIVERY") {
  const s = await requireSession();
  if (!canAccessBranch(s, branchId)) throw new Error("Bu şubeye erişiminiz yok");
  await prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: s.organizationId } });
  if (tableId) {
    const existing = await prisma.order.findFirst({ where: { tableId, status: "OPEN" } });
    if (existing) redirect(`/pos/order/${existing.id}`);
  }
  const order = await prisma.$transaction(async (tx) =>
    tx.order.create({
      data: {
        organizationId: s.organizationId,
        branchId,
        tableId,
        type,
        userId: s.userId,
        number: await nextOrderNumber(tx, branchId),
      },
    }),
  );
  redirect(`/pos/order/${order.id}`);
}

export async function addItem(orderId: string, productId: string) {
  const { s, order } = await ownOrder(orderId);
  if (order.status !== "OPEN") throw new Error("Adisyon kapalı");
  const product = await prisma.product.findFirstOrThrow({ where: { id: productId, organizationId: s.organizationId } });
  // Fiyatı girilmemiş ürün 0 ₺'ye satılmasın
  if (Number(product.price) <= 0) throw new Error(`${product.name}: satış fiyatı girilmemiş`);
  await prisma.$transaction(async (tx) => {
    const same = await tx.orderItem.findFirst({ where: { orderId, productId, status: "ACTIVE", note: null } });
    if (same) await tx.orderItem.update({ where: { id: same.id }, data: { quantity: { increment: 1 } } });
    else
      await tx.orderItem.create({
        data: { orderId, productId, name: product.name, quantity: 1, unitPrice: product.price, vatRate: product.vatRate },
      });
    await recalcTotal(tx, orderId);
  });
  revalidatePath(`/pos/order/${orderId}`);
}

export async function changeQty(orderId: string, itemId: string, delta: number) {
  const { order } = await ownOrder(orderId);
  if (order.status !== "OPEN") throw new Error("Adisyon kapalı");
  await prisma.$transaction(async (tx) => {
    const item = await tx.orderItem.findFirstOrThrow({ where: { id: itemId, orderId } });
    const q = item.quantity + delta;
    if (q <= 0) await tx.orderItem.update({ where: { id: itemId }, data: { status: "CANCELLED" } });
    else await tx.orderItem.update({ where: { id: itemId }, data: { quantity: q } });
    await recalcTotal(tx, orderId);
  });
  revalidatePath(`/pos/order/${orderId}`);
}

export async function setDiscount(orderId: string, form: FormData) {
  const { s, order } = await ownOrder(orderId);
  if (s.role === "CASHIER") throw new Error("İndirim yetkisi yok");
  if (order.status !== "OPEN") throw new Error("Adisyon kapalı");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { discount: Math.max(0, decimal(form.get("discount"))) } });
    await recalcTotal(tx, orderId);
  });
  revalidatePath(`/pos/order/${orderId}`);
}

export async function payOrder(orderId: string, _: unknown, form: FormData) {
  const { order } = await ownOrder(orderId);
  const payments = (["CASH", "CARD", "ACCOUNT"] as const)
    .map((method) => ({ method, amount: decimal(form.get(method)) }))
    .filter((p) => p.amount > 0);
  const customerId = String(form.get("customerId") ?? "") || null;
  try {
    await prisma.$transaction((tx) => closeOrder(tx, orderId, payments, customerId), { timeout: 20000 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Ödeme alınamadı" };
  }
  revalidatePath("/pos");
  redirect(`/pos/${order.branchId}`);
}

export async function cancelOrder(orderId: string) {
  const { s, order } = await ownOrder(orderId);
  if (s.role === "CASHIER") throw new Error("İptal yetkisi yok");
  if (order.status !== "OPEN") throw new Error("Adisyon kapalı");
  await prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", closedAt: new Date() } });
  redirect(`/pos/${order.branchId}`);
}

// ---------------------------------------------------------------- Menü & reçete

export async function saveProduct(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const data = z
    .object({
      id: z.string().optional(),
      name: z.string().min(1),
      categoryId: z.string().min(1),
      price: z.number().nonnegative(),
      vatRate: z.number().int().min(0).max(20),
      active: z.boolean(),
    })
    .parse({
      id: String(form.get("id") ?? "") || undefined,
      name: String(form.get("name") ?? "").trim(),
      categoryId: String(form.get("categoryId") ?? ""),
      price: decimal(form.get("price")),
      vatRate: Math.round(decimal(form.get("vatRate"))),
      active: form.get("active") === "on",
    });
  await prisma.category.findFirstOrThrow({ where: { id: data.categoryId, organizationId: s.organizationId } });
  const { id, ...rest } = data;
  if (id) {
    await prisma.product.updateMany({ where: { id, organizationId: s.organizationId }, data: rest });
    revalidatePath(`/menu/${id}`);
  } else {
    const p = await prisma.product.create({ data: { ...rest, organizationId: s.organizationId } });
    redirect(`/menu/${p.id}`);
  }
  revalidatePath("/menu");
}

export async function createCategory(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const count = await prisma.category.count({ where: { organizationId: s.organizationId } });
  await prisma.category.create({ data: { organizationId: s.organizationId, name, sort: count } });
  revalidatePath("/menu");
}

export async function saveRecipeLine(productId: string, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  await prisma.product.findFirstOrThrow({ where: { id: productId, organizationId: s.organizationId } });
  const stockItemId = String(form.get("stockItemId") ?? "");
  await prisma.stockItem.findFirstOrThrow({ where: { id: stockItemId, organizationId: s.organizationId } });
  const quantity = decimal(form.get("quantity"));
  const wastePct = decimal(form.get("wastePct"));
  if (quantity <= 0) throw new Error("Miktar sıfırdan büyük olmalı");
  await prisma.recipeLine.upsert({
    where: { productId_stockItemId: { productId, stockItemId } },
    create: { productId, stockItemId, quantity, wastePct },
    update: { quantity, wastePct },
  });
  revalidatePath(`/menu/${productId}`);
}

export async function removeRecipeLine(productId: string, lineId: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  await prisma.recipeLine.deleteMany({
    where: { id: lineId, productId, product: { organizationId: s.organizationId } },
  });
  revalidatePath(`/menu/${productId}`);
}

// ---------------------------------------------------------------- Stok

export async function createStockItem(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const data = z
    .object({
      name: z.string().min(1),
      unit: z.enum(["GR", "ML", "ADET"]),
      purchaseUnit: z.string().min(1),
      purchaseUnitFactor: z.number().positive(),
      minLevel: z.number().nonnegative(),
    })
    .parse({
      name: String(form.get("name") ?? "").trim(),
      unit: form.get("unit"),
      purchaseUnit: String(form.get("purchaseUnit") ?? "").trim(),
      purchaseUnitFactor: decimal(form.get("purchaseUnitFactor")),
      minLevel: decimal(form.get("minLevel")),
    });
  await prisma.stockItem.create({ data: { ...data, organizationId: s.organizationId } });
  revalidatePath("/stok");
}

export async function countStock(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const branchId = String(form.get("branchId"));
  const stockItemId = String(form.get("stockItemId"));
  if (!canAccessBranch(s, branchId)) throw new Error("Bu şubeye erişiminiz yok");
  await prisma.stockItem.findFirstOrThrow({ where: { id: stockItemId, organizationId: s.organizationId } });
  const type = form.get("type") === "WASTE" ? "WASTE" : "ADJUSTMENT";
  await prisma.$transaction((tx) =>
    adjustStock(tx, s.organizationId, branchId, stockItemId, decimal(form.get("counted")), type),
  );
  revalidatePath("/stok");
}

// ---------------------------------------------------------------- Alış

const purchaseSchema = z.object({
  branchId: z.string().min(1),
  supplierId: z.string().min(1),
  invoiceNo: z.string().min(1),
  date: z.string().min(1),
  lines: z
    .array(
      z.object({
        stockItemId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        vatRate: z.number().int().min(0).max(20),
      }),
    )
    .min(1),
});

export async function createPurchase(input: z.infer<typeof purchaseSchema>) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const data = purchaseSchema.safeParse(input);
  if (!data.success) return { error: "Formu kontrol edin: tüm satırlarda kalem, miktar ve fiyat olmalı" };
  const d = data.data;
  if (!canAccessBranch(s, d.branchId)) return { error: "Bu şubeye erişiminiz yok" };
  await prisma.account.findFirstOrThrow({
    where: { id: d.supplierId, organizationId: s.organizationId, type: "SUPPLIER" },
  });
  try {
    await prisma.$transaction(
      (tx) => recordPurchase(tx, { ...d, organizationId: s.organizationId, date: new Date(d.date) }),
      { timeout: 20000 },
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kaydedilemedi" };
  }
  revalidatePath("/alis");
  redirect("/alis");
}

// ---------------------------------------------------------------- Cari

export async function createAccount(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const type = form.get("type") === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER";
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  const opt = (k: string) => String(form.get(k) ?? "").trim() || null;
  await prisma.account.create({
    data: {
      organizationId: s.organizationId,
      type,
      name,
      taxNumber: opt("taxNumber"),
      taxOffice: opt("taxOffice"),
      phone: opt("phone"),
      email: opt("email"),
      address: opt("address"),
    },
  });
  revalidatePath("/cari");
}

/** Tahsilat (müşteriden) veya ödeme (tedarikçiye). */
export async function addAccountPayment(accountId: string, form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const acc = await prisma.account.findFirstOrThrow({ where: { id: accountId, organizationId: s.organizationId } });
  const amount = decimal(form.get("amount"));
  if (amount <= 0) return;
  const desc = String(form.get("description") ?? "").trim();
  // Hangi şirketin ödemesi/tahsilatı? Şubeye bağlı müdür yalnızca kendi şirketi adına işlem yapar.
  const companyId = s.branchId
    ? (await prisma.branch.findUniqueOrThrow({ where: { id: s.branchId } })).companyId
    : (await prisma.company.findFirstOrThrow({
        where: { id: String(form.get("companyId") ?? ""), organizationId: s.organizationId },
      })).id;
  await prisma.ledgerEntry.create({
    data: {
      organizationId: s.organizationId,
      companyId,
      accountId,
      date: form.get("date") ? new Date(String(form.get("date"))) : new Date(),
      description: desc || (acc.type === "SUPPLIER" ? "Ödeme" : "Tahsilat"),
      ...(acc.type === "SUPPLIER" ? { debit: amount } : { credit: amount }),
      source: "PAYMENT",
    },
  });
  revalidatePath(`/cari/${accountId}`);
}

// ---------------------------------------------------------------- E-belge

export async function issueEDocument(orderId: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    await prisma.$transaction((tx) => issueForOrder(tx, s.organizationId, orderId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Belge kesilemedi" };
  }
  revalidatePath("/e-belge");
  return { ok: true };
}

// ---------------------------------------------------------------- Gelen e-fatura (XML)

export async function importIncoming(files: { name: string; xml: string }[]) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  if (files.length > 50) throw new Error("Tek seferde en fazla 50 dosya");
  const results = await importXml(s.organizationId, files);
  revalidatePath("/alis/e-fatura");
  return results;
}

export async function processIncomingAction(docId: string, input: ProcessInput) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  if (!canAccessBranch(s, input.branchId)) return { error: "Bu şubeye erişiminiz yok" };
  await prisma.branch.findFirstOrThrow({ where: { id: input.branchId, organizationId: s.organizationId } });
  try {
    await prisma.$transaction((tx) => processIncoming(tx, s.organizationId, docId, input), { timeout: 30000 });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kaydedilemedi" };
  }
  revalidatePath("/alis");
  revalidatePath("/alis/e-fatura");
  redirect("/alis/e-fatura?islendi=1");
}

export async function ignoreIncoming(docId: string) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  await prisma.eDocument.updateMany({
    where: { id: docId, organizationId: s.organizationId, direction: "INCOMING", status: "DRAFT" },
    data: { status: "IGNORED" },
  });
  revalidatePath("/alis/e-fatura");
}

// ---------------------------------------------------------------- Menü & reçete Excel içe aktarma

async function readMenuFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Excel dosyası seçin");
  if (file.size > 5_000_000) throw new Error("Dosya 5 MB'tan büyük olamaz");
  return parseMenuWorkbook(await file.arrayBuffer());
}

export async function previewMenuImport(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const parsed = await readMenuFile(form);
    const [items, products] = await Promise.all([
      prisma.stockItem.findMany({ where: { organizationId: s.organizationId }, select: { name: true, unit: true } }),
      prisma.product.findMany({ where: { organizationId: s.organizationId }, select: { name: true } }),
    ]);
    const itemUnit = new Map(items.map((i) => [menuKey(i.name), i.unit]));
    const errors = [...parsed.errors];
    for (const si of parsed.stockItems) {
      const u = itemUnit.get(menuKey(si.name));
      if (u && u !== si.unit) errors.push(`'${si.name}' programda ${u.toLowerCase()} biriminde kayıtlı, dosyada ${si.unit.toLowerCase()}`);
    }
    const prodNames = new Set(products.map((p) => menuKey(p.name)));
    return {
      errors,
      warnings: parsed.warnings,
      newItems: parsed.stockItems.filter((i) => !itemUnit.has(menuKey(i.name))).length,
      updatedItems: parsed.stockItems.filter((i) => itemUnit.has(menuKey(i.name))).length,
      newProducts: parsed.products.filter((p) => !prodNames.has(menuKey(p.name))).length,
      updatedProducts: parsed.products.filter((p) => prodNames.has(menuKey(p.name))).length,
      recipeLines: parsed.recipe.length,
      products: previewCosts(parsed).map((p) => ({ ...p, exists: prodNames.has(menuKey(p.name)) })),
    };
  } catch (e) {
    return { errors: [e instanceof Error ? e.message : "Dosya okunamadı"] };
  }
}

export async function commitMenuImport(form: FormData) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  try {
    const parsed = await readMenuFile(form);
    if (parsed.errors.length) return { error: "Dosyada hata var, önizlemedeki hataları düzeltin" };
    const counts = await prisma.$transaction((tx) => applyMenuImport(tx, s.organizationId, parsed), { timeout: 60000 });
    revalidatePath("/menu");
    revalidatePath("/stok");
    return { ok: counts };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "İçe aktarılamadı" };
  }
}
