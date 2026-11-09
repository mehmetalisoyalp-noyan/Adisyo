import { num, prisma } from "../db";
import { productProfitability, summarize } from "../costing";

export interface ReportFilter {
  organizationId: string;
  branchId?: string | null;
  from: Date;
  to: Date;
}

/** Kapanmış adisyonlardaki kalemlerden ürün kârlılığı. */
export async function profitabilityReport(f: ReportFilter) {
  const items = await prisma.orderItem.findMany({
    where: {
      status: "ACTIVE",
      order: {
        organizationId: f.organizationId,
        status: "PAID",
        closedAt: { gte: f.from, lt: f.to },
        ...(f.branchId ? { branchId: f.branchId } : {}),
      },
    },
    select: { productId: true, name: true, quantity: true, unitPrice: true, vatRate: true, unitCost: true },
  });
  const rows = productProfitability(
    items.map((i) => ({
      productId: i.productId,
      name: i.name,
      quantity: i.quantity,
      unitPrice: num(i.unitPrice),
      vatRate: i.vatRate,
      unitCost: num(i.unitCost),
    })),
  );
  return { rows, summary: summarize(rows) };
}

/** Şube bazında özet (patron ekranı). */
export async function branchSummary(f: Omit<ReportFilter, "branchId">) {
  const branches = await prisma.branch.findMany({
    where: { organizationId: f.organizationId },
    orderBy: { name: "asc" },
  });
  const result = [];
  for (const b of branches) {
    const [{ summary }, openOrders, payments, orderCount] = await Promise.all([
      profitabilityReport({ ...f, branchId: b.id }),
      prisma.order.aggregate({
        where: { branchId: b.id, status: "OPEN" },
        _count: true,
        _sum: { total: true },
      }),
      prisma.payment.groupBy({
        by: ["method"],
        where: { order: { branchId: b.id, status: "PAID", closedAt: { gte: f.from, lt: f.to } } },
        _sum: { amount: true },
      }),
      prisma.order.count({ where: { branchId: b.id, status: "PAID", closedAt: { gte: f.from, lt: f.to } } }),
    ]);
    const pay = Object.fromEntries(payments.map((p) => [p.method, num(p._sum.amount)]));
    result.push({
      branch: b,
      summary,
      orderCount,
      openCount: openOrders._count,
      openTotal: num(openOrders._sum.total),
      cash: pay.CASH ?? 0,
      card: pay.CARD ?? 0,
      account: pay.ACCOUNT ?? 0,
    });
  }
  return result;
}

/** Kritik seviyenin altındaki stoklar. */
export async function criticalStock(organizationId: string, branchId?: string | null) {
  const levels = await prisma.stockLevel.findMany({
    where: { stockItem: { organizationId }, ...(branchId ? { branchId } : {}) },
    include: { stockItem: true, branch: true },
  });
  return levels.filter((l) => num(l.quantity) < num(l.stockItem.minLevel));
}
