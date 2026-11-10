import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultBaseQty, itemKey, parseUbl } from "@/lib/ubl";

const xml = readFileSync(path.join(__dirname, "fixtures/ornek-efatura.xml"), "utf8");

describe("parseUbl", () => {
  const inv = parseUbl(xml);
  it("başlık bilgilerini okur", () => {
    expect(inv.uuid).toBe("8f2c1a3e-1111-4c2b-9a77-0123456789ab");
    expect(inv.number).toBe("ETD2026000000123");
    expect(inv.issueDate).toBe("2026-11-05");
    expect(inv.typeCode).toBe("SATIS");
    expect(inv.totalNet).toBe(7305);
    expect(inv.totalVat).toBe(164.25);
    expect(inv.payable).toBe(7469.25);
  });
  it("satıcı ve alıcıyı okur (VKN, vergi dairesi, adres)", () => {
    expect(inv.supplier).toMatchObject({
      name: "Örnek Et Toptan Gıda Ltd. Şti.",
      taxNumber: "4560001122",
      taxOffice: "Alemdağ",
      email: "info@ornek-et.example",
    });
    expect(inv.supplier.address).toContain("Ümraniye");
    expect(inv.customer.taxNumber).toBe("1234567890");
  });
  it("kalemleri iskonto sonrası net tutar ve KDV oranıyla okur", () => {
    expect(inv.lines).toHaveLength(3);
    expect(inv.lines[0]).toMatchObject({ name: "DANA BURGER KÖFTE 120 GR", code: "KFT-120", quantity: 10, unitCode: "KGM", lineNet: 6225, vatRate: 1 });
    expect(inv.lines[1]).toMatchObject({ quantity: 2, unitCode: "BX", lineNet: 600, code: null });
    expect(inv.lines[2]).toMatchObject({ vatRate: 20, lineNet: 480 });
  });
  it("iskonto, birim fiyat, açıklama ve notları okur", () => {
    expect(inv.lines[0]).toMatchObject({ unitPrice: 655, discount: 325, discountPct: 5 });
    expect(inv.lines[1]).toMatchObject({ description: "Susamlı brioche, 30 adet · Örnek Fırın", note: "Soğuk zincir" });
    expect(inv.lines[2].discount).toBe(0);
    expect(inv.notes).toEqual(["Yalnız Yedibindörtyüzaltmışdokuz TL Yirmibeş Kr.", "İrsaliye no: IRS-2026-0042"]);
  });
  it("e-fatura olmayan dosyayı reddeder", () => {
    expect(() => parseUbl("<root/>")).toThrow();
  });
});

describe("yardımcılar", () => {
  it("eşleştirme anahtarı: kod varsa kod, yoksa sade ad", () => {
    expect(itemKey({ code: "kft-120", name: "x" })).toBe("kod:KFT-120");
    expect(itemKey({ code: null, name: "  Hamburger   EKMEĞİ " })).toBe("ad:hamburger ekmeği");
  });
  it("birim çevrimi önerisi", () => {
    expect(defaultBaseQty("KGM", "GR", 1000)).toBe(1000);
    expect(defaultBaseQty("LTR", "ML", 1000)).toBe(1000);
    expect(defaultBaseQty("C62", "ADET", 30)).toBe(1);
    expect(defaultBaseQty("BX", "ADET", 30)).toBe(30);
  });
});
