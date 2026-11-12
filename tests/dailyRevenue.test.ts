import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseDailyRevenueWorkbook, summarizeDays } from "../src/lib/dailyRevenueImport";

async function book(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("data");
  rows.forEach((r) => ws.addRow(r));
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
const HEAD = ["Günlük Ciro", "Nakit(₺)", "Kredi Kartı(₺)", "Multinet(₺)", "Edenred(₺)", "Toplam Satış (₺)", "Açık Hesap Borçinfo"];

describe("Adisyo günlük ciro raporu", () => {
  it("AA/GG tarihleri ve yemek kartı komisyonunu okur", async () => {
    const r = await parseDailyRevenueWorkbook(await book([
      HEAD,
      ["- 10/01/2026", 100, 800, 50, 50, 1000, 0],
      ["- 10/02/2026", 0, 500, 0, 0, 500, 0],
      ["- 10/13/2026", 10, 10, 0, 0, 20, 0],
      ["Toplam:", "₺110,00", "₺1.310,00", "₺50,00", "₺50,00", "Sipariş Ödemeleri ₺1.520,00", "Açık Hesap Borç ₺0,00"],
    ]));
    expect(r.errors).toEqual([]);
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-13"]);
    expect(r.days[0].payments).toEqual({ Nakit: 100, "Kredi Kartı": 800, Multinet: 50, Edenred: 50 });
    const s = summarizeDays(r.days);
    expect(s.total).toBe(1520);
    expect(s.mealCard).toBe(100);
    expect(s.commission).toBeCloseTo(6);
  });
});
