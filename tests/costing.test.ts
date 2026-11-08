import { describe, expect, it } from "vitest";
import {
  balance,
  baseUnitCost,
  netFromGross,
  productProfitability,
  recipeCost,
  suggestedPrice,
  summarize,
  weightedAverageCost,
} from "@/lib/costing";

describe("recipeCost", () => {
  it("reçete satırlarını fire dahil toplar", () => {
    const costs: Record<string, number> = { kofte: 0.5, ekmek: 8, patates: 0.04 };
    const r = recipeCost(
      [
        { stockItemId: "kofte", quantity: 120, wastePct: 0 }, // 60 TL
        { stockItemId: "ekmek", quantity: 1, wastePct: 0 }, // 8 TL
        { stockItemId: "patates", quantity: 200, wastePct: 25 }, // 250 gr * 0.04 = 10 TL
      ],
      (id) => costs[id] ?? 0,
    );
    expect(r.total).toBe(78);
    expect(r.lines[2].lineCost).toBeCloseTo(10);
  });

  it("maliyeti bilinmeyen kalemi 0 sayar", () => {
    expect(recipeCost([{ stockItemId: "x", quantity: 5, wastePct: 0 }], () => 0).total).toBe(0);
  });
});

describe("weightedAverageCost", () => {
  it("mevcut stokla yeni girişi ağırlıklandırır", () => {
    // 1000 gr @ 0.40 + 1000 gr @ 0.60 => 0.50
    expect(weightedAverageCost(1000, 0.4, 1000, 0.6)).toBeCloseTo(0.5);
  });
  it("stok sıfır veya eksiyse yeni maliyeti alır", () => {
    expect(weightedAverageCost(0, 0.4, 500, 0.7)).toBe(0.7);
    expect(weightedAverageCost(-50, 0.4, 500, 0.7)).toBe(0.7);
  });
});

describe("yardımcılar", () => {
  it("KDV dahil tutardan net bulur", () => {
    expect(netFromGross(110, 10)).toBeCloseTo(100);
  });
  it("kg fiyatını grama çevirir", () => {
    expect(baseUnitCost(500, 1000)).toBe(0.5);
    expect(() => baseUnitCost(1, 0)).toThrow();
  });
  it("hedef maliyet oranına göre fiyat önerir", () => {
    expect(suggestedPrice(60, 30, 10)).toBe(220);
  });
  it("cari bakiye", () => {
    expect(balance([{ debit: 0, credit: 1000 }, { debit: 400, credit: 0 }])).toBe(-600);
  });
});

describe("productProfitability", () => {
  it("ürün bazında net ciro, maliyet ve marjı hesaplar", () => {
    const rows = productProfitability([
      { productId: "b", name: "Burger", quantity: 2, unitPrice: 220, vatRate: 10, unitCost: 60 },
      { productId: "b", name: "Burger", quantity: 1, unitPrice: 220, vatRate: 10, unitCost: 60 },
      { productId: "k", name: "Kola", quantity: 4, unitPrice: 55, vatRate: 10, unitCost: 25 },
    ]);
    const burger = rows.find((r) => r.productId === "b")!;
    expect(burger.quantity).toBe(3);
    expect(burger.netRevenue).toBe(600);
    expect(burger.cost).toBe(180);
    expect(burger.profit).toBe(420);
    expect(burger.marginPct).toBe(70);
    expect(burger.costPct).toBe(30);
    const s = summarize(rows);
    expect(s.netRevenue).toBe(800);
    expect(s.cost).toBe(280);
    expect(s.profit).toBe(520);
  });
});
