// Boş menü & reçete şablonu (örnek satırlarla)
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s || s.role === "CASHIER") return new Response("Yetkisiz", { status: 401 });
  const wb = new ExcelJS.Workbook();
  const head = (ws: ExcelJS.Worksheet, cols: [string, number][]) => {
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F54" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const m = wb.addWorksheet("Malzemeler");
  head(m, [["Malzeme adı", 30], ["Grup", 10], ["Temel birim", 11], ["Alış birimi", 16], ["1 alış birimi = ? temel birim", 16], ["Alış fiyatı (KDV hariç, ₺ / alış birimi)", 20], ["Alış KDV %", 10], ["Kritik seviye (temel birim)", 14], ["Not", 40]]);
  m.addRow(["Örnek: Mozzarella", "Gıda", "gr", "kg", 1000, 325, 1, 3000, "Bu örnek satırı silin"]);
  m.addRow(["Örnek: Burger Ekmeği", "Gıda", "adet", "koli (30 adet)", 30, 289.5, 1, 60, "Bu örnek satırı silin"]);
  const p = wb.addWorksheet("Ürünler");
  head(p, [["Kategori", 18], ["Ürün adı", 32], ["Satış fiyatı (KDV dahil, ₺)", 16], ["KDV %", 8], ["Durum", 10], ["Not", 40]]);
  p.addRow(["Pizzalar", "Örnek: Margarita Pizza", 300, 10, "Satışta", "Durum: Satışta veya Taslak"]);
  const r = wb.addWorksheet("Reçeteler");
  head(r, [["Ürün adı", 32], ["Malzeme adı", 30], ["Miktar (1 porsiyon)", 14], ["Birim", 8], ["Fire %", 8], ["Not", 40]]);
  r.addRow(["Örnek: Margarita Pizza", "Örnek: Mozzarella", 150, "gr", 0, "Birim: gr, kg, ml, lt, adet"]);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="menu-recete-sablonu.xlsx"',
    },
  });
}
