import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseSalesWorkbook } from "../src/lib/salesImport";

async function book(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("data");
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("Adisyo ürün satış raporu", () => {
  it("fiyat kırılımı satırlarını ikinci kez saymaz", async () => {
    const buf = await book([
      ["Ürün Kodu", "Ürün Adı", "Miktar", "Birim", "Kategori", "Birim Fiyatı", "İkram", "Maliyet", "Toplam Tutar", "Oran(%)"],
      [null, "3 PEYNİRLİ", 395, null, "HAMBURGER", null, 0, 0, 191235, 4.31],
      [null, "3 PEYNİRLİ", 285, "Adet", null, 475, null, null, 135685, "3.06"],
      [null, "3 PEYNİRLİ", 110, "Adet", null, 505, null, null, 55550, "1.25"],
      [null, "patates", 5077, "Adet", "YAN ÜRÜN", 95, 0, 0, 482315, 10.89],
      ["Toplam", null, 5472, null, null, null, 0, 0, 673550, "100%"],
    ]);
    const r = await parseSalesWorkbook(buf);
    expect(r.errors).toEqual([]);
    expect(r.lines).toEqual([
      { name: "3 PEYNİRLİ", quantity: 395, revenue: 191235 },
      { name: "patates", quantity: 5077, revenue: 482315 },
    ]);
  });
});
