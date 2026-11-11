// Adisyo → program sipariş eşitleme.
import { prisma } from "../db";
import { AdisyoError, fetchCompletedOrders, mapOrder, type MappedOrder } from "../adisyo";
import { decrypt } from "../secret";

const OVERLAP_MS = 2 * 24 * 3600 * 1000; // geç kapanan / güncellenen siparişler için 2 gün geriden başla

export interface SyncResult {
  branch: string;
  ok: boolean;
  orders: number;
  pages: number;
  done: boolean;
  message: string;
}

async function saveOrder(organizationId: string, branchId: string, o: MappedOrder) {
  const data = {
    orderNumber: o.orderNumber,
    orderDate: o.orderDate,
    orderType: o.orderType,
    channel: o.channel,
    status: o.status,
    cancelled: o.cancelled,
    total: o.total,
    discount: o.discount,
    payments: o.payments,
  };
  const saved = await prisma.adisyoOrder.upsert({
    where: { branchId_externalId: { branchId, externalId: o.externalId } },
    create: { organizationId, branchId, externalId: o.externalId, ...data },
    update: data,
  });
  await prisma.adisyoOrderLine.deleteMany({ where: { orderId: saved.id } });
  if (o.lines.length) {
    await prisma.adisyoOrderLine.createMany({ data: o.lines.map((l) => ({ ...l, orderId: saved.id })) });
  }
}

/** Bir şubenin siparişlerini çeker. timeBudgetMs aşılırsa kaldığı yerden sonraki çalıştırmada devam eder. */
export async function syncBranch(connectionId: string, timeBudgetMs = 45000): Promise<SyncResult> {
  const conn = await prisma.adisyoConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { branch: { include: { organization: { include: { adisyoAccount: true } } } } },
  });
  const branch = conn.branch;
  const account = branch.organization.adisyoAccount;
  const t0 = Date.now();
  const result: SyncResult = { branch: branch.name, ok: false, orders: 0, pages: 0, done: false, message: "" };
  try {
    if (!account) throw new AdisyoError("Önce Adisyo entegratör anahtarını (x-api-key) girin");
    const creds = { apiKey: decrypt(account.apiKeyEnc), apiSecret: decrypt(conn.apiSecretEnc), consumer: account.consumer };
    const start = conn.cursor ? new Date(Math.max(conn.cursor.getTime() - OVERLAP_MS, conn.startFrom.getTime())) : conn.startFrom;
    let page = 1;
    let pageCount = 1;
    let maxDate: Date | null = null;
    let firstDate: Date | null = null;
    let lastDate: Date | null = null;
    let exhausted = false; // tüm sayfalar okundu mu
    do {
      const body = await fetchCompletedOrders(creds, start, page);
      pageCount = Math.max(1, body.pageCount ?? Math.ceil((body.totalCount ?? 0) / 100));
      const orders = (body.orders ?? []).map(mapOrder).filter((x): x is MappedOrder => !!x);
      for (const o of orders) {
        await saveOrder(branch.organizationId, branch.id, o);
        if (!maxDate || o.orderDate > maxDate) maxDate = o.orderDate;
        firstDate ??= o.orderDate;
        lastDate = o.orderDate;
      }
      result.orders += orders.length;
      result.pages = page;
      page++;
      if (!orders.length || page > pageCount) exhausted = true;
    } while (!exhausted && Date.now() - t0 < timeBudgetMs);
    result.done = exhausted;
    // İmleç: tamamlandıysa en son sipariş; yarıda kaldıysa yalnızca sıralama eskiden yeniye ise ilerletilir
    let cursor = conn.cursor;
    if (result.done) cursor = maxDate ?? conn.cursor ?? null;
    else if (firstDate && lastDate && firstDate <= lastDate) cursor = maxDate;
    result.ok = true;
    result.message = result.done ? `${result.orders} sipariş alındı` : `${result.orders} sipariş alındı, devam ediyor (sonraki eşitlemede sürecek)`;
    await prisma.adisyoConnection.update({
      where: { id: conn.id },
      data: { cursor, lastSyncAt: new Date(), lastStatus: result.message, lastError: null },
    });
  } catch (e) {
    result.message = e instanceof Error ? e.message : String(e);
    await prisma.adisyoConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastStatus: "Hata", lastError: result.message } });
  }
  return result;
}

/** Tüm etkin bağlantılar (gece görevi) veya bir grubun bağlantıları */
export async function syncAll(organizationId?: string, timeBudgetMs = 50000) {
  const conns = await prisma.adisyoConnection.findMany({
    where: { active: true, ...(organizationId ? { branch: { organizationId } } : {}) },
    select: { id: true },
  });
  const per = Math.max(10000, Math.floor(timeBudgetMs / Math.max(1, conns.length)));
  const out: SyncResult[] = [];
  for (const c of conns) out.push(await syncBranch(c.id, per));
  return out;
}
