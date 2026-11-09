const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const n2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export const money = (v: unknown) => tl.format(Number(v ?? 0));
export const qty = (v: unknown) => n2.format(Number(v ?? 0));
export const pct = (v: number) => `%${n2.format(v)}`;
/** Sunucu nerede çalışırsa çalışsın (yayında UTC) tüm tarihler Türkiye saatine göre hesaplanır. */
export const TZ = "Europe/Istanbul";
/** Türkiye'de 2016'dan beri yaz saati uygulaması yok: sabit UTC+3 */
export const TZ_OFFSET = "+03:00";
export const dt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }) : "-";
export const day = (d: Date | string) => new Date(d).toLocaleDateString("tr-TR", { timeZone: TZ });
/** Tarihi Türkiye saatine göre YYYY-AA-GG biçiminde verir */
export const dateInput = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
/** YYYY-AA-GG günün Türkiye saatiyle 00:00 anı */
export const startOfDay = (ymd: string) => new Date(`${ymd}T00:00:00${TZ_OFFSET}`);
export const UNIT_LABEL = { GR: "gr", ML: "ml", ADET: "adet" } as const;
export const METHOD_LABEL = { CASH: "Nakit", CARD: "Kredi Kartı", ACCOUNT: "Cariye" } as const;
export const CHANNEL_LABEL = { POS: "Kasa", YEMEKSEPETI: "Yemeksepeti", GETIR: "Getir", TRENDYOL: "Trendyol Yemek" } as const;
export const TYPE_LABEL = { DINE_IN: "Masa", TAKEAWAY: "Gel-Al", DELIVERY: "Paket" } as const;
export const ROLE_LABEL = { OWNER: "Patron", MANAGER: "Müdür", CASHIER: "Kasiyer" } as const;
