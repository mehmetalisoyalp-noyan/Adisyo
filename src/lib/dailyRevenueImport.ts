// Adisyo "Restoran İstatistikleri — Günlük Ciro Verileri" raporunu okur:
// her satır bir gün, sütunlar ödeme türleri (Nakit, Kredi Kartı, Multinet, ...).
import ExcelJS from "exceljs";
import { key, number, text } from "./menuImport";

/** Yemek kartı komisyon oranı (tüm kartlar için sabit) */
export const MEAL_CARD_COMMISSION = 0.06;

const MEAL_CARD = /(multinet|setcard|set card|sodexo|pluxee|metropol|token|edenred|ticket|paye|yemek kart)/i;
export const isMealCard = (name: string) => MEAL_CARD.test(name);

export interface ParsedDailyRevenue {
  days: { date: string; total: number; payments: Record<string, number> }[];
  methods: string[];
  errors: string[];
}

/** "Kredi Kartı(₺)" → "Kredi Kartı" */
const clean = (h: string) => h.replace(/\(₺\)|₺/g, "").trim();

export async function parseDailyRevenueWorkbook(data: ArrayBuffer): Promise<ParsedDailyRevenue> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedDailyRevenue = { days: [], methods: [], errors: [] };
  const ws = wb.worksheets[0];
  if (!ws) return { ...out, errors: ["Dosyada sayfa yok"] };

  let headerRow = 0;
  const cols: { col: number; name: string }[] = [];
  let totalCol = 0;
  for (let r = 1; r <= Math.min(20, ws.rowCount) && !headerRow; r++) {
    const hs: string[] = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => (hs[i] = text(c.value)));
    if (!hs.some((h) => h && /toplam satış/.test(key(h)))) continue;
    headerRow = r;
    hs.forEach((h, i) => {
      if (!h || i === 1) return;
      const k = key(h);
      if (/toplam satış/.test(k)) totalCol = i;
      else if (!/(açık hesap|borç)/.test(k)) cols.push({ col: i, name: clean(h) });
    });
  }
  if (!headerRow) return { ...out, errors: ["Günlük ciro raporu tanınmadı: 'Toplam Satış' sütunu bulunamadı."] };

  // Tarihler "- 10/01/2026" biçiminde. Gün/ay sırasını, rapordaki değişen parçaya bakarak buluruz.
  const raw: { a: number; b: number; y: number; total: number; payments: Record<string, number> }[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const v = row.getCell(1).value;
    let a: number, b: number, y: number;
    if (v instanceof Date) {
      a = v.getUTCMonth() + 1; b = v.getUTCDate(); y = v.getUTCFullYear();
    } else {
      const m = text(v).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
      if (!m) continue;
      a = Number(m[1]); b = Number(m[2]); y = Number(m[3]);
    }
    const payments: Record<string, number> = {};
    for (const c of cols) {
      const n = number(row.getCell(c.col).value) ?? 0;
      if (n) payments[c.name] = n;
    }
    const total = number(row.getCell(totalCol).value) ?? Object.values(payments).reduce((t, x) => t + x, 0);
    raw.push({ a, b, y, total, payments });
  }
  if (!raw.length) return { ...out, errors: ["Raporda gün satırı bulunamadı"] };

  const distinct = (f: (x: (typeof raw)[0]) => number) => new Set(raw.map(f)).size;
  // İlk parça 12'den büyükse ya da ikinci parça sabitse biçim GG/AA; değilse AA/GG (Adisyo).
  const dayFirst = raw.some((x) => x.a > 12) || (distinct((x) => x.b) < distinct((x) => x.a));
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const x of raw) {
    const [d, m] = dayFirst ? [x.a, x.b] : [x.b, x.a];
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      out.errors.push(`Geçersiz tarih: ${x.a}/${x.b}/${x.y}`);
      continue;
    }
    out.days.push({ date: `${x.y}-${pad(m)}-${pad(d)}`, total: x.total, payments: x.payments });
  }
  out.methods = cols.map((c) => c.name).filter((n) => out.days.some((d) => d.payments[n]));
  return out;
}

/** Günlerin ödeme türü toplamları ve yemek kartı komisyonu */
export function summarizeDays(days: { total: number; payments: Record<string, number> }[]) {
  const byMethod: Record<string, number> = {};
  let total = 0;
  for (const d of days) {
    total += d.total;
    for (const [k, v] of Object.entries(d.payments)) byMethod[k] = (byMethod[k] ?? 0) + v;
  }
  const mealCard = Object.entries(byMethod).filter(([k]) => isMealCard(k)).reduce((t, [, v]) => t + v, 0);
  const commission = mealCard * MEAL_CARD_COMMISSION;
  return { total, byMethod, mealCard, commission, net: total - commission };
}
