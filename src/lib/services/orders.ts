import { num, type Tx } from "../db";
import { round } from "../costing";
import { productCosts } from "./stock";

export async function nextOrderNumber(tx: Tx, branchId: string) {
  const last = await tx.order.findFirst({ where: { branchId }, orderBy: { number: "desc" } });
  return (last?.number ?? 0) + 1;
}

export async function recalcTotal(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { where: { status: "ACTIVE" } } },
  });
  const gross = order.items.reduce((s, i) => s + num(i.unitPrice) * i.quantity, 0);
  const total = round(Math.max(0, gross - num(order.discount)));
  await tx.order.update({ where: { id: orderId }, data: { total } });
  return total;
}

export interface PaymentInput {
  method: "CASH" | "CARD" | "ACCOUNT";
  amount: number;
}

/**
 * Adisyon kapanışı — maliyet analizinin can alıcı noktası:
 *  * Her kalemin birim maliyeti o anki reçete × şube ortalama maliyeti ile hesaplanır ve SABİTLENİR.
 *    (Sonradan hammadde fiyatı değişse bile geçmiş satışın kârı değişmez.)
 *  * Reçetedeki hammaddeler şube stoğundan düşülür.
 *  * "Cariye" ödeme varsa müşteri carisine borç yazılır.
 */
export async function closeOrder(
  tx: Tx,
  orderId: string,
  payments: PaymentInput[],
  customerAccountId?: string | null,
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { where: { status: "ACTIVE" } }, branch: true },
  });
  if (order.status !== "OPEN") throw new Error("Adisyon zaten kapalı");
  if (!order.items.length) throw new Error("Adisyonda ürün yok");

  const total = await recalcTotal(tx, orderId);
  const paid = round(payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - total) > 0.009) {
    throw new Error(`Ödeme toplamı (${paid}) adisyon tutarına (${total}) eşit olmalı`);
  }
  const accountPay = payments.filter((p) => p.method === "ACCOUNT").reduce((s, p) => s + p.amount, 0);
  const customerId = customerAccountId ?? order.customerAccountId;
  if (accountPay > 0 && !customerId) throw new Error("Cariye satış için müşteri seçilmeli");

  const productIds = [...new Set(order.items.map((i) => i.productId))];
  const { costs, lines } = await productCosts(tx, order.branchId, productIds);

  let totalCost = 0;
  for (const item of order.items) {
    const unitCost = costs.get(item.productId) ?? 0;
    totalCost += unitCost * item.quantity;
    await tx.orderItem.update({ where: { id: item.id }, data: { unitCost } });
  }

  // Stoktan düşüm (hammadde bazında birleştirilmiş)
  const usage = new Map<string, number>();
  for (const item of order.items) {
    for (const l of lines.filter((x) => x.productId === item.productId)) {
      const qty = num(l.quantity) * (1 + num(l.wastePct) / 100) * item.quantity;
      usage.set(l.stockItemId, (usage.get(l.stockItemId) ?? 0) + qty);
    }
  }
  for (const [stockItemId, qty] of usage) {
    const level = await tx.stockLevel.upsert({
      where: { branchId_stockItemId: { branchId: order.branchId, stockItemId } },
      create: { branchId: order.branchId, stockItemId, quantity: -qty },
      update: { quantity: { decrement: qty } },
    });
    await tx.stockMovement.create({
      data: {
        organizationId: order.organizationId,
        branchId: order.branchId,
        stockItemId,
        type: "SALE",
        quantity: -qty,
        unitCost: level.avgCost,
        refId: order.id,
      },
    });
  }

  await tx.payment.createMany({
    data: payments.filter((p) => p.amount > 0).map((p) => ({ orderId, method: p.method, amount: p.amount })),
  });

  if (accountPay > 0 && customerId) {
    await tx.ledgerEntry.create({
      data: {
        organizationId: order.organizationId,
        accountId: customerId,
        companyId: order.branch.companyId,
        branchId: order.branchId,
        description: `Adisyon #${order.number} (açık hesap)`,
        debit: round(accountPay),
        source: "SALE",
        sourceId: order.id,
      },
    });
  }

  return tx.order.update({
    where: { id: orderId },
    data: {
      status: "PAID",
      closedAt: new Date(),
      totalCost: round(totalCost),
      customerAccountId: customerId ?? undefined,
    },
  });
}
