// Adisyo → program sipariş eşitleme.
// Adisyo sınırı: CompletedOrders'a 40 saniyede 1 istek, her istekte en çok 100 sipariş.
// Bu yüzden eşitleme ADIM ADIM yapılır: her adım en fazla bir istek atar, kaldığı sayfayı kaydeder.
import { prisma } from "../db";
import { ADISYO_MIN_GAP_MS, AdisyoError, fetchCompletedOrders, mapOrder, type MappedOrder } from "../adisyo";
import { decrypt } from "../secret";

const OVERLAP_MS = 2 * 24 * 3600 * 1000; // geç kapanan / güncellenen siparişler için 2 gün geriden başla
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface StepResult {
  branch: string;
  ok: boolean;
  /** Bu eşitleme turu bitti mi (tüm sayfalar alındı) */
  done: boolean;
  /** Sonraki adım için beklenmesi gereken süre (ms) */
  waitMs: number;
  orders: number;
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
  if (o.lines.length) await prisma.adisyoOrderLine.createMany({ data: o.lines.map((l) => ({ ...l, orderId: saved.id })) });
}

/** Tek adım: en fazla bir Adisyo isteği. */
export async function syncStep(connectionId: string): Promise<StepResult> {
  const conn = await prisma.adisyoConnection.findUniqueOrThrow({
    where: { id: connectionId },
    include: { branch: { include: { organization: { include: { adisyoAccount: true } } } } },
  });
  const branch = conn.branch;
  const r: StepResult = { branch: branch.name, ok: true, done: false, waitMs: 0, orders: 0, message: "" };
  const status = (data: Record<string, unknown>) =>
    prisma.adisyoConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), ...data } });
  try {
    const account = branch.organization.adisyoAccount;
    if (!account) throw new AdisyoError("Önce Adisyo grup anahtarını (x-api-key) girin");
    const start =
      conn.runStart ??
      (conn.cursor ? new Date(Math.max(conn.cursor.getTime() - OVERLAP_MS, conn.startFrom.getTime())) : conn.startFrom);
    if (start.getTime() > Date.now()) {
      r.done = true;
      r.message = `Başlangıç tarihi (${start.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" })}) henüz gelmedi; eşitleme o tarihte kendiliğinden başlayacak`;
      await status({ lastStatus: r.message, lastError: null });
      return r;
    }
    // Hız sınırı: son istekten bu yana 41 sn geçmediyse bekle
    const since = conn.lastRequestAt ? Date.now() - conn.lastRequestAt.getTime() : Infinity;
    if (since < ADISYO_MIN_GAP_MS) {
      r.waitMs = ADISYO_MIN_GAP_MS - since;
      r.message = "Adisyo sınırı nedeniyle bekleniyor";
      return r;
    }
    const page = conn.nextPage ?? 1;
    await prisma.adisyoConnection.update({ where: { id: conn.id }, data: { lastRequestAt: new Date() } });
    const creds = { apiKey: decrypt(account.apiKeyEnc), apiSecret: decrypt(conn.apiSecretEnc), consumer: account.consumer };
    let body;
    try {
      body = await fetchCompletedOrders(creds, start, page);
    } catch (e) {
      if (e instanceof AdisyoError && e.rateLimited) {
        // Sınır aşıldı: hata değil, bekleyip aynı sayfadan devam
        r.waitMs = ADISYO_MIN_GAP_MS;
        r.message = `Adisyo sınırı aşıldı; ${Math.round(ADISYO_MIN_GAP_MS / 1000)} sn sonra sayfa ${page}'den devam edilecek`;
        await status({ runStart: start, nextPage: page, lastStatus: r.message, lastError: null });
        return r;
      }
      throw e;
    }
    const pageCount = Math.max(1, body.pageCount ?? Math.ceil((body.totalCount ?? 0) / 100));
    const orders = (body.orders ?? []).map(mapOrder).filter((x): x is MappedOrder => !!x);
    let maxDate = conn.runMaxDate;
    for (const o of orders) {
      await saveOrder(branch.organizationId, branch.id, o);
      if (!maxDate || o.orderDate > maxDate) maxDate = o.orderDate;
    }
    r.orders = orders.length;
    if (!orders.length || page >= pageCount) {
      r.done = true;
      r.message = `Eşitleme tamamlandı (${pageCount} sayfa)`;
      await status({
        cursor: maxDate ?? conn.cursor,
        runStart: null,
        nextPage: null,
        runMaxDate: null,
        lastStatus: r.message,
        lastError: null,
      });
    } else {
      r.waitMs = ADISYO_MIN_GAP_MS;
      r.message = `Sayfa ${page}/${pageCount} alındı (${orders.length} sipariş), devam ediyor`;
      await status({ runStart: start, nextPage: page + 1, runMaxDate: maxDate, lastStatus: r.message, lastError: null });
    }
  } catch (e) {
    r.ok = false;
    r.done = true;
    r.message = e instanceof Error ? e.message : String(e);
    await status({ lastStatus: "Hata", lastError: r.message });
  }
  return r;
}

/** Bir şubeyi süre bütçesi içinde, adımlar arasında bekleyerek eşitler (gece görevi için). */
export async function syncBranch(connectionId: string, timeBudgetMs = 50_000) {
  const t0 = Date.now();
  let total = 0;
  let last: StepResult | null = null;
  for (;;) {
    last = await syncStep(connectionId);
    total += last.orders;
    if (last.done || !last.ok) break;
    if (Date.now() - t0 + last.waitMs + 8_000 > timeBudgetMs) break; // bekleyip bir istek daha atacak süre yok
    await sleep(last.waitMs);
  }
  return { ...last!, orders: total };
}

/** Tüm etkin bağlantılar (gece görevi). Şubeler ayrı restoran olduğu için paralel çalışır. */
export async function syncAll(organizationId?: string, timeBudgetMs = 50_000) {
  const conns = await prisma.adisyoConnection.findMany({
    where: { active: true, ...(organizationId ? { branch: { organizationId } } : {}) },
    select: { id: true },
  });
  return Promise.all(conns.map((c) => syncBranch(c.id, timeBudgetMs)));
}
