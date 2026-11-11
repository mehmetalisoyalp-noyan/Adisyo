import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { openFactor, parseCountWorkbook, parseDate } from "@/lib/countImport";
import { parseSalesWorkbook } from "@/lib/salesImport";

const ITEMS = [
  { id: "ched", name: "Cheddar", unit: "GR" as const, purchaseUnitFactor: 6000 },
  { id: "kofte", name: "Köfte 150 gr", unit: "ADET" as const, purchaseUnitFactor: 1 },
  { id: "yag", name: "Kızartma Yağı", unit: "GR" as const, purchaseUnitFactor: 18000 },
  { id: "domates", name: "Domates", unit: "GR" as const, purchaseUnitFactor: 1000 },
  { id: "yok", name: "Formda Olmayan", unit: "GR" as const, purchaseUnitFactor: 1000 },
];

/** Sayım formunun düzenini taklit eder (başlık 6. satırda, bölüm başlıkları arada) */
async function form(rows: (string | number | null)[][], extra?: (ws: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sayım Formu");
  ws.getCell("A2").value = "Şube:";
  ws.getCell("C2").value = "Kafe Moda";
  ws.getCell("F2").value = "Sayım tarihi / saati:";
  ws.getCell("H2").value = "31.12.2026 23:30";
  ws.getRow(6).values = ["Sıra", "Öncelik", "Malzeme adı", "Bölüm", "Nasıl sayılır", "Ambalaj", "1 ambalaj = ? temel birim",
    "Kapalı ambalaj adedi", "Açık miktar", "Açık miktar birimi", "TOPLAM (temel birim)", "Temel birim", "Ürün sayısı",
    "Kullanıldığı ürünler", "Birim maliyet (KDV hariç, ₺ / ambalaj)"];
  ws.getRow(7).values = ["1. Et ve tavuk"];
  rows.forEach((r, i) => (ws.getRow(8 + i).values = r));
  extra?.(ws);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
// [sıra, öncelik, ad, bölüm, nasıl, ambalaj, katsayı, kapalı, açık, birim, toplam, temel, sayı, ürünler, maliyet]
const row = (name: string, closed: number | null, open: number | null, unit: string, cost: number | null = null) =>
  [1, "A", name, "", "", "", null, closed, open, unit, null, "", null, "", cost];

describe("parseCountWorkbook", () => {
  it("kapalı ambalaj × içerik + açık miktarı temel birime çevirir", async () => {
    const p = await parseCountWorkbook(await form([
      row("Cheddar", 3, 2.35, "kg", 330),
      row("köfte 150 GR", null, 48, "adet"),
      row("Kızartma Yağı", 2, 7.5, "lt"),
      row("Domates", null, null, "kg"),
    ]), ITEMS);
    expect(p.errors).toEqual([]);
    expect(p.branchName).toBe("Kafe Moda");
    expect(p.date).toBe("2026-12-31");
    const q = Object.fromEntries(p.lines.map((l) => [l.stockItemId, l]));
    expect(q.ched.quantity).toBe(3 * 6000 + 2350);
    expect(q.ched.unitCost).toBeCloseTo(330 / 6000);
    expect(q.kofte.quantity).toBe(48);
    expect(q.yag.quantity).toBe(2 * 18000 + 7500);
    expect(q.domates).toBeUndefined(); // boş = sayılmadı (0 değil)
    expect(p.blanks).toEqual(["Domates", "Formda Olmayan"]);
  });

  it("programda olmayan dolu satırları ve birim uyumsuzluğunu bildirir", async () => {
    const p = await parseCountWorkbook(await form([
      row("Ayran 300 ml", 4, null, "adet"),
      row("Köfte 150 gr", null, 2.5, "kg"),
      row("Domates", 0, null, "kg"),
      row("Cheddar", null, -1, "kg"),
    ]), ITEMS);
    expect(p.unknown).toEqual([{ row: 8, name: "Ayran 300 ml", quantity: "4" }]);
    expect(p.errors.join()).toMatch(/Köfte 150 gr.*'kg'.*uyumsuz/);
    expect(p.errors.join()).toMatch(/eksi olamaz/);
    expect(p.lines.find((l) => l.stockItemId === "domates")?.quantity).toBe(0); // açıkça 0 yazılan sayılmış sayılır
  });

  it("form dışı dosyayı reddeder", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").getCell("A1").value = "başka bir şey";
    const p = await parseCountWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer, ITEMS);
    expect(p.errors[0]).toMatch(/Malzeme adı/);
  });

  it("yardımcılar", () => {
    expect(parseDate("31.12.2026")).toBe("2026-12-31");
    expect(parseDate("1/2/2027")).toBe("2027-02-01");
    expect(openFactor("kg", "GR")).toBe(1000);
    expect(openFactor("", "ADET")).toBe(1);
    expect(openFactor("adet", "GR")).toBeNull();
    expect(openFactor("lt", "GR")).toBe(1000); // yağ: litreyle alınır, gramla tutulur
  });
});

describe("parseSalesWorkbook", () => {
  it("başlık satırını bulur, toplam satırını atlar, aynı ürünü birleştirir", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Ürün Satış Raporu");
    ws.getCell("A1").value = "Ürün Bazlı Satış Raporu 01.01.2027 - 31.01.2027";
    ws.getRow(3).values = ["Kategori", "Ürün Adı", "Satış Adedi", "Birim Fiyat", "Toplam Tutar"];
    ws.getRow(4).values = ["Burger", "Klasik Burger", 120, 355, 42600];
    ws.getRow(5).values = ["Burger", "Cheese Burger", 80, 365, 29200];
    ws.getRow(6).values = ["Burger", "Klasik Burger", 5, 355, 1775];
    ws.getRow(7).values = ["", "Genel Toplam", 205, null, 73575];
    const p = await parseSalesWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(p.errors).toEqual([]);
    expect(p.lines).toEqual([
      { name: "Klasik Burger", quantity: 125, revenue: 44375 },
      { name: "Cheese Burger", quantity: 80, revenue: 29200 },
    ]);
  });

  it("tanınmayan biçimde başlıkları göstererek hata verir", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").getRow(1).values = ["Kod", "Açıklama"];
    const p = await parseSalesWorkbook((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(p.errors[0]).toMatch(/Kod, Açıklama/);
  });
});
