const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const n2 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export const money = (v: unknown) => tl.format(Number(v ?? 0));
export const qty = (v: unknown) => n2.format(Number(v ?? 0));
export const pct = (v: number) => `%${n2.format(v)}`;
export const dt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "-";
export const dateInput = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const UNIT_LABEL = { GR: "gr", ML: "ml", ADET: "adet" } as const;
export const METHOD_LABEL = { CASH: "Nakit", CARD: "Kredi Kartı", ACCOUNT: "Cariye" } as const;
export const CHANNEL_LABEL = { POS: "Kasa", YEMEKSEPETI: "Yemeksepeti", GETIR: "Getir", TRENDYOL: "Trendyol Yemek" } as const;
export const TYPE_LABEL = { DINE_IN: "Masa", TAKEAWAY: "Gel-Al", DELIVERY: "Paket" } as const;
export const ROLE_LABEL = { OWNER: "Patron", MANAGER: "Müdür", CASHIER: "Kasiyer" } as const;
