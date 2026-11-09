import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseMenuWorkbook, parseNumberText, previewCosts, toBase } from "@/lib/menuImport";

async function book(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const standard = (wb: ExcelJS.Workbook) => {
  const m = wb.addWorksheet("Malzemeler");
  m.addRow(["Malzeme adı", "Grup", "Temel birim", "Alış birimi", "1 alış birimi = ? temel birim", "Alış fiyatı (KDV hariç, ₺ / alış birimi)", "Alış KDV %", "Kritik seviye (temel birim)", "Temel birim maliyeti"]);
  m.addRow(["Yuvarlak Köfte 150 gr", "Gıda", "adet", "adet", 1, 119.5, 1, null, { formula: "F2/E2", result: 119.5 }]);
  m.addRow(["Baker Sos", "Gıda", "gr", "kg", 1000, 90, 1]);
  m.addRow(["Kola Şurup", "İçecek", "ml", "kutu (10 lt)", 10000, { formula: "11783.5*0.55/2", result: 3240.4625 }, 20]);
  m.addRow(["Fiyatsız Kalem", "Gıda", "gr", "kg", 1000, null, 1]);
  const p = wb.addWorksheet("Ürünler");
  p.addRow(["Kategori", "Ürün adı", "Satış fiyatı (KDV dahil, ₺)", "KDV %", "Durum"]);
  p.addRow(["Menüler", "Burger Menü", 390, 10, "Satışta"]);
  p.addRow(["Burgerler", "Taslak Burger", null, 10, "Taslak"]);
  const r = wb.addWorksheet("Reçeteler");
  r.addRow(["Ürün adı", "Malzeme adı", "Miktar (1 porsiyon)", "Birim", "Fire %"]);
  r.addRow(["Burger Menü", "Yuvarlak Köfte 150 gr", 1, "adet", 0]);
  r.addRow(["Burger Menü", "baker sos", 0.02, "kg", 0]); // küçük harf ad + kg → 20 gr
  r.addRow(["Burger Menü", "Kola Şurup", 119, "ml", 0]);
  r.addRow(["Taslak Burger", "Fiyatsız Kalem", 100, "gr", 0]);
};

describe("parseMenuWorkbook", () => {
  it("şablonu okur, formül sonuçlarını ve birim çevrimini uygular", async () => {
    const p = await parseMenuWorkbook(await book(standard));
    expect(p.errors).toEqual([]);
    expect(p.stockItems).toHaveLength(4);
    expect(p.stockItems.find((s) => s.name === "Kola Şurup")).toMatchObject({ unit: "ML", factor: 10000, price: 3240.4625 });
    expect(p.products.find((x) => x.name === "Taslak Burger")).toMatchObject({ active: false, price: null });
    expect(p.recipe.find((l) => l.item === "baker sos")?.quantity).toBe(20);
  });

  it("dosya fiyatlarıyla maliyeti kaynak tabloyla aynı hesaplar", async () => {
    const p = await parseMenuWorkbook(await book(standard));
    const burger = previewCosts(p).find((x) => x.name === "Burger Menü")!;
    // 119,5 köfte + 20 gr × 0,09 sos + 119 ml × 0,32404625 şurup
    expect(burger.cost).toBeCloseTo(119.5 + 1.8 + 119 * 0.32404625, 6);
    expect(burger.costPct).toBeCloseTo((burger.cost / (390 / 1.1)) * 100, 6);
    expect(previewCosts(p).find((x) => x.name === "Taslak Burger")!.missingPrices).toEqual(["Fiyatsız Kalem"]);
  });

  it("hataları satır numarasıyla bildirir", async () => {
    const p = await parseMenuWorkbook(
      await book((wb) => {
        standard(wb);
        wb.getWorksheet("Malzemeler")!.addRow(["Bozuk Birim", "Gıda", "kilo", "kg", 1000, 10]);
        wb.getWorksheet("Reçeteler")!.addRow(["Burger Menü", "Olmayan Malzeme", 1, "adet"]);
        wb.getWorksheet("Reçeteler")!.addRow(["Olmayan Ürün", "Baker Sos", 1, "gr"]);
        wb.getWorksheet("Reçeteler")!.addRow(["Burger Menü", "Kola Şurup", 1, "gr"]);
      }),
    );
    expect(p.errors.join("\n")).toMatch(/Malzemeler satır 6.*temel birim 'kilo'/);
    expect(p.errors.join("\n")).toMatch(/'Olmayan Malzeme' Malzemeler sayfasında yok/);
    expect(p.errors.join("\n")).toMatch(/'Olmayan Ürün' Ürünler sayfasında yok/);
    expect(p.errors.join("\n")).toMatch(/birim 'gr'.*uyumsuz/);
  });

  it("eksik sayfaları bildirir", async () => {
    const p = await parseMenuWorkbook(await book((wb) => void wb.addWorksheet("Başka")));
    expect(p.errors).toHaveLength(3);
  });
});

describe("yardımcılar", () => {
  it("metin sayıları doğru okur (0.03 asla 3 olmaz)", () => {
    expect(parseNumberText("0.03")).toBe(0.03);
    expect(parseNumberText("0,03")).toBe(0.03);
    expect(parseNumberText("1.250,50 ₺")).toBe(1250.5);
    expect(parseNumberText("1250")).toBe(1250);
  });
  it("kg/lt çevirir, uyumsuz birimi reddeder", () => {
    expect(toBase(0.275, "kg", "GR")).toBe(275);
    expect(toBase(0.5, "lt", "ML")).toBe(500);
    expect(toBase(2, "adet", "ADET")).toBe(2);
    expect(toBase(1, "kg", "ADET")).toBeNull();
    expect(toBase(5, "", "GR")).toBe(5);
  });
});
