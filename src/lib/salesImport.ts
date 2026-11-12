// Dış sistemden (Adisyo vb.) alınan ürün bazında satış raporunu okur.
// Rapor biçimi kesin bilinmediği için başlık satırı ve sütunlar adlarına göre aranır.
import ExcelJS from "exceljs";
import { key, number, text } from "./menuImport";

export interface ParsedSales {
  lines: { name: string; quantity: number; revenue: number }[];
  /** Bulunan başlıklar (biçim tanınmazsa hata mesajında gösterilir) */
  headers: string[];
  sheet: string;
  errors: string[];
}

const NAME = (h: string) => /^(ürün|urun|ürün adı|ürün ismi|ürünler|stok adı|menü|ad|adı)$/.test(h) || h.startsWith("ürün adı") || h === "ürün";
const QTY = (h: string) => /(adet|miktar|satış adedi|satılan|sayı)/.test(h) && !/(fiyat|tutar)/.test(h);
const REV = (h: string) => /(tutar|ciro|toplam|satış tutarı|net satış|brüt)/.test(h) && !/(adet|miktar|kdv oranı|indirim)/.test(h);

export async function parseSalesWorkbook(data: ArrayBuffer): Promise<ParsedSales> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedSales = { lines: [], headers: [], sheet: "", errors: [] };
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(40, ws.rowCount); r++) {
      const hs: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: true }, (c, i) => (hs[i] = key(text(c.value))));
      const nameCol = hs.findIndex((h) => h && NAME(h));
      const qtyCol = hs.findIndex((h) => h && QTY(h));
      if (nameCol < 1 || qtyCol < 1) continue;
      const revCol = hs.findIndex((h, i) => h && i !== qtyCol && REV(h));
      // Adisyo raporunda çok fiyatlı ürünler önce kategorili bir toplam satırıyla, ardından
      // kategorisi boş fiyat kırılımı satırlarıyla gelir. Kırılımlar toplamı ikinci kez saymasın.
      const catCol = hs.findIndex((h) => h && /^kategori/.test(h));
      let groupKey = "";
      out.sheet = ws.name;
      out.headers = hs.filter(Boolean);
      const agg = new Map<string, { name: string; quantity: number; revenue: number }>();
      for (let rr = r + 1; rr <= ws.rowCount; rr++) {
        const row = ws.getRow(rr);
        const name = text(row.getCell(nameCol).value);
        if (!name || /^(genel )?toplam/.test(key(name))) continue;
        const q = number(row.getCell(qtyCol).value);
        if (q == null || q === 0) continue;
        const rev = revCol > 0 ? (number(row.getCell(revCol).value) ?? 0) : 0;
        const k = key(name);
        if (catCol > 0) {
          const cat = text(row.getCell(catCol).value);
          if (cat) groupKey = k;
          else if (k === groupKey) continue;
        }
        const a = agg.get(k) ?? { name, quantity: 0, revenue: 0 };
        a.quantity += q;
        a.revenue += rev;
        agg.set(k, a);
      }
      out.lines = [...agg.values()];
      if (!out.lines.length) out.errors.push(`'${ws.name}' sayfasında başlık bulundu ama satır yok`);
      return out;
    }
  }
  const sample = wb.worksheets[0];
  const hs: string[] = [];
  sample?.getRow(1).eachCell((c) => hs.push(text(c.value)));
  out.errors.push(
    "Raporda ürün adı ve adet sütunları bulunamadı. Beklenen başlıklar: 'Ürün' / 'Ürün Adı' ve 'Adet' / 'Miktar' (isteğe bağlı 'Tutar'). " +
      (hs.length ? `İlk satırdaki başlıklar: ${hs.join(", ")}` : ""),
  );
  return out;
}
