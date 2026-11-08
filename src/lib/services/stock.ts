import { num, type Tx } from "../db";
import { baseUnitCost, recipeCost, round, weightedAverageCost } from "../costing";

/** Şubedeki maliyet arama fonksiyonu: şube ortalaması → yoksa son alış maliyeti. */
export async function branchCostLookup(tx: Tx, branchId: string, stockItemIds: string[]) {
  const [levels, items] = await Promise.all([
    tx.stockLevel.findMany({ where: { branchId, stockItemId: { in: stockItemIds } } }),
    tx.stockItem.findMany({ where: { id: { in: stockItemIds } } }),
  ]);
  const avg = new Map(levels.map((l) => [l.stockItemId, num(l.avgCost)]));
  const last = new Map(items.map((i) => [i.id, num(i.lastCost)]));
  return (id: string) => {
    const a = avg.get(id);
    return a && a > 0 ? a : (last.get(id) ?? 0);
  };
}

/** Ürünlerin güncel birim maliyetleri (şube bazında). */
export async function productCosts(tx: Tx, branchId: string, productIds: string[]) {
  const lines = await tx.recipeLine.findMany({ where: { productId: { in: productIds } } });
  const costOf = await branchCostLookup(
    tx,
    branchId,
    [...new Set(lines.map((l) => l.stockItemId))],
  );
  const result = new Map<string, number>();
  for (const pid of productIds) {
    const own = lines
      .filter((l) => l.productId === pid)
      .map((l) => ({ stockItemId: l.stockItemId, quantity: num(l.quantity), wastePct: num(l.wastePct) }));
    result.set(pid, recipeCost(own, costOf).total);
  }
  return { costs: result, lines };
}

export interface PurchaseInput {
  organizationId: string;
  branchId: string;
  supplierId: string;
  invoiceNo: string;
  date: Date;
  eInvoiceUuid?: string;
  lines: { stockItemId: string; quantity: number; unitPrice: number; vatRate: number }[];
}

/**
 * Alış faturası kaydı:
 *  1) Fatura + satırlar
 *  2) Şube stoğu artar, ağırlıklı ortalama maliyet güncellenir
 *  3) Stok kaleminin son alış maliyeti güncellenir
 *  4) Tedarikçi carisine KDV dahil tutar alacak olarak işlenir
 */
export async function recordPurchase(tx: Tx, input: PurchaseInput) {
  if (!input.lines.length) throw new Error("Fatura en az bir satır içermeli");
  const items = await tx.stockItem.findMany({
    where: { id: { in: input.lines.map((l) => l.stockItemId) }, organizationId: input.organizationId },
  });
  const byId = new Map(items.map((i) => [i.id, i]));

  let totalNet = 0;
  let totalVat = 0;
  const lineData = input.lines.map((l) => {
    if (!byId.has(l.stockItemId)) throw new Error("Geçersiz stok kalemi");
    if (l.quantity <= 0 || l.unitPrice < 0) throw new Error("Miktar ve fiyat pozitif olmalı");
    const lineNet = round(l.quantity * l.unitPrice);
    totalNet += lineNet;
    totalVat += round((lineNet * l.vatRate) / 100);
    return { ...l, lineNet };
  });
  const total = round(totalNet + totalVat);

  const invoice = await tx.purchaseInvoice.create({
    data: {
      organizationId: input.organizationId,
      branchId: input.branchId,
      supplierId: input.supplierId,
      invoiceNo: input.invoiceNo,
      date: input.date,
      eInvoiceUuid: input.eInvoiceUuid,
      totalNet: round(totalNet),
      totalVat: round(totalVat),
      total,
      lines: { create: lineData },
    },
  });

  for (const l of lineData) {
    const item = byId.get(l.stockItemId)!;
    const factor = num(item.purchaseUnitFactor);
    const baseQty = l.quantity * factor;
    const baseCost = baseUnitCost(l.unitPrice, factor);
    const level = await tx.stockLevel.findUnique({
      where: { branchId_stockItemId: { branchId: input.branchId, stockItemId: item.id } },
    });
    const newAvg = weightedAverageCost(num(level?.quantity), num(level?.avgCost), baseQty, baseCost);
    await tx.stockLevel.upsert({
      where: { branchId_stockItemId: { branchId: input.branchId, stockItemId: item.id } },
      create: { branchId: input.branchId, stockItemId: item.id, quantity: baseQty, avgCost: newAvg },
      update: { quantity: { increment: baseQty }, avgCost: newAvg },
    });
    await tx.stockItem.update({ where: { id: item.id }, data: { lastCost: baseCost } });
    await tx.stockMovement.create({
      data: {
        organizationId: input.organizationId,
        branchId: input.branchId,
        stockItemId: item.id,
        type: "PURCHASE",
        quantity: baseQty,
        unitCost: baseCost,
        refId: invoice.id,
      },
    });
  }

  await tx.ledgerEntry.create({
    data: {
      organizationId: input.organizationId,
      accountId: input.supplierId,
      branchId: input.branchId,
      date: input.date,
      description: `Alış faturası ${input.invoiceNo}`,
      credit: total,
      source: "PURCHASE",
      sourceId: invoice.id,
    },
  });
  return invoice;
}

/** Stok sayımı / düzeltme: sayılan miktarı esas alır, farkı hareket olarak yazar. */
export async function adjustStock(
  tx: Tx,
  organizationId: string,
  branchId: string,
  stockItemId: string,
  countedQty: number,
  type: "ADJUSTMENT" | "WASTE" = "ADJUSTMENT",
) {
  const level = await tx.stockLevel.findUnique({
    where: { branchId_stockItemId: { branchId, stockItemId } },
  });
  const diff = countedQty - num(level?.quantity);
  if (diff === 0) return;
  const costOf = await branchCostLookup(tx, branchId, [stockItemId]);
  await tx.stockLevel.upsert({
    where: { branchId_stockItemId: { branchId, stockItemId } },
    create: { branchId, stockItemId, quantity: countedQty, avgCost: costOf(stockItemId) },
    update: { quantity: countedQty },
  });
  await tx.stockMovement.create({
    data: { organizationId, branchId, stockItemId, type, quantity: diff, unitCost: costOf(stockItemId) },
  });
}
