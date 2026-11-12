// Adisyo dış API istemcisi ve sipariş dönüştürücü.
// Doküman: https://developers.adisyo.com (CompletedOrders: GET /CompletedOrders, sayfa başına en çok 100 sipariş)

export const ADISYO_BASE = () => process.env.ADISYO_BASE_URL || "https://ext.adisyo.com/api/External/v2";

export interface AdisyoCredentials {
  apiKey: string;
  apiSecret: string;
  consumer: string;
}

/* Adisyo yanıtındaki alanlar (dokümandaki adlarla; hepsi isteğe bağlı kabul edilir) */
export interface RawProduct {
  id?: number | string;
  orderId?: number | string;
  quantity?: number;
  unitPrice?: number;
  productName?: string;
  productCode?: string | null;
  isMenu?: boolean;
  parentId?: number | string | null;
  totalAmount?: number;
  discountAmount?: number;
  cancelReason?: string | null;
  features?: { featureName?: string; additionalPrice?: number; featureProductName?: string }[] | null;
}
export interface RawOrder {
  id?: number | string;
  orderNumber?: string | number | null;
  insertDate?: string;
  updateDate?: string;
  orderTotal?: number;
  discountAmount?: number;
  orderType?: string | null;
  salesChannelName?: string | null;
  externalAppName?: string | null;
  status?: string | null;
  statusId?: number | null;
  orderCancelReason?: string | null;
  products?: RawProduct[] | null;
  payments?: { paymentName?: string; amount?: number }[] | null;
}
export interface RawPage {
  orders?: RawOrder[] | null;
  totalCount?: number;
  pageCount?: number;
  status?: boolean | number | string;
  message?: string | null;
}

/** Adisyo tarih biçimi: "yyyy-MM-dd HH:mm:ss" (UTC) */
export function toAdisyoDate(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/** Adisyo'nun döndürdüğü tarih: saat dilimi yoksa Türkiye saati kabul edilir */
export function parseAdisyoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const t = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(" ", "T")}+03:00`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const isCancelled = (o: RawOrder) =>
  // Türkçe "İ" büyük harfi yüzünden önce tr küçük harfe çevrilir ("İptal" → "iptal")
  !!(o.orderCancelReason && o.orderCancelReason.trim()) || /iptal|cancel/.test((o.status ?? "").toLocaleLowerCase("tr-TR"));

export interface MappedOrder {
  externalId: string;
  orderNumber: string | null;
  orderDate: Date;
  orderType: string | null;
  channel: string | null;
  status: string | null;
  cancelled: boolean;
  total: number;
  discount: number;
  payments: { name: string; amount: number }[];
  lines: {
    externalId: string | null;
    parentId: string | null;
    isMenu: boolean;
    productCode: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    cancelled: boolean;
    features: { name: string; price: number }[];
  }[];
}

export function mapOrder(o: RawOrder): MappedOrder | null {
  const date = parseAdisyoDate(o.insertDate) ?? parseAdisyoDate(o.updateDate);
  if (o.id == null || !date) return null;
  const str = (v: unknown) => (v == null || v === "" || v === 0 || v === "0" ? null : String(v));
  return {
    externalId: String(o.id),
    orderNumber: str(o.orderNumber),
    orderDate: date,
    orderType: o.orderType ?? null,
    channel: o.externalAppName || o.salesChannelName || null,
    status: o.status ?? null,
    cancelled: isCancelled(o),
    total: Number(o.orderTotal ?? 0),
    discount: Number(o.discountAmount ?? 0),
    payments: (o.payments ?? []).map((p) => ({ name: p.paymentName ?? "?", amount: Number(p.amount ?? 0) })),
    lines: (o.products ?? [])
      .filter((p) => (p.productName ?? "").trim())
      .map((p) => ({
        externalId: str(p.id),
        parentId: str(p.parentId),
        isMenu: !!p.isMenu,
        productCode: p.productCode || null,
        productName: p.productName!.trim(),
        quantity: Number(p.quantity ?? 0),
        unitPrice: Number(p.unitPrice ?? 0),
        amount: Number(p.totalAmount ?? Number(p.unitPrice ?? 0) * Number(p.quantity ?? 0)) - Number(p.discountAmount ?? 0),
        cancelled: !!(p.cancelReason && p.cancelReason.trim()),
        features: (p.features ?? []).map((f) => ({ name: f.featureName || f.featureProductName || "?", price: Number(f.additionalPrice ?? 0) })),
      })),
  };
}

export class AdisyoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

/**
 * HTTP başlıkları yalnızca 0–255 aralığında karakter taşıyabilir. Adisyo tüketici adının Türkçe karakterlerle
 * ("Ş", "ğ"…) yazılmasını istediği için değer UTF-8 baytları olarak gönderilir (Postman / curl ile aynı).
 */
export function headerValue(v: string) {
  return Buffer.from(v.trim(), "utf8").toString("latin1");
}

/** Tamamlanmış siparişlerden bir sayfa */
export async function fetchCompletedOrders(c: AdisyoCredentials, startDate: Date, page: number): Promise<RawPage> {
  const url = new URL(`${ADISYO_BASE()}/CompletedOrders`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("startDate", toAdisyoDate(startDate));
  url.searchParams.set("includeCancelled", "true");
  const res = await fetch(url, {
    headers: {
      "x-api-key": headerValue(c.apiKey),
      "x-api-secret": headerValue(c.apiSecret),
      "x-api-consumer": headerValue(c.consumer),
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401 || res.status === 403) throw new AdisyoError("Adisyo anahtarları reddedildi (yetkisiz). Anahtarları kontrol edin.", res.status);
  if (!res.ok) {
    // Adisyo'nun hata açıklamasını da göster (teşhis için)
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new AdisyoError(`Adisyo isteği kabul etmedi (HTTP ${res.status})${detail ? `: ${detail}` : ""}`, res.status);
  }
  const body = (await res.json()) as RawPage;
  if (body.status === false) throw new AdisyoError(`Adisyo hata döndürdü: ${body.message ?? "bilinmiyor"}`);
  return body;
}
