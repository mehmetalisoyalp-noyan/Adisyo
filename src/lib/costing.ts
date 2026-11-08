// Maliyet hesaplama çekirdeği — veritabanından bağımsız, saf fonksiyonlar (birim testleri var).
//
// Temel kurallar:
//  * Tüm maliyetler KDV HARİÇ tutulur (KDV indirilebilir olduğu için maliyet değildir).
//  * Satış fiyatları KDV DAHİL girilir; kârlılık hesabında net (KDV hariç) ciroya çevrilir.
//  * Stok maliyeti şube bazında ağırlıklı ortalama yöntemiyle izlenir.

export const round = (n: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export interface RecipeLineInput {
  stockItemId: string;
  /** 1 adet ürün için temel birim cinsinden miktar */
  quantity: number;
  /** Fire oranı (%) */
  wastePct: number;
}

/** Bir stok kaleminin temel birim başına maliyetini döndürür (bulunamazsa 0). */
export type CostLookup = (stockItemId: string) => number;

export interface RecipeCostLine extends RecipeLineInput {
  unitCost: number;
  lineCost: number;
}

/** Reçeteye göre 1 adet ürünün maliyeti (KDV hariç). */
export function recipeCost(lines: RecipeLineInput[], costOf: CostLookup) {
  const detailed: RecipeCostLine[] = lines.map((l) => {
    const unitCost = costOf(l.stockItemId);
    const effectiveQty = l.quantity * (1 + l.wastePct / 100);
    return { ...l, unitCost, lineCost: effectiveQty * unitCost };
  });
  const total = detailed.reduce((s, l) => s + l.lineCost, 0);
  return { total: round(total, 4), lines: detailed };
}

/** Ağırlıklı ortalama maliyet. Mevcut stok sıfır/eksi ise yeni giriş maliyeti esas alınır. */
export function weightedAverageCost(
  currentQty: number,
  currentAvg: number,
  inQty: number,
  inUnitCost: number,
) {
  if (inQty <= 0) return currentAvg;
  if (currentQty <= 0) return inUnitCost;
  return (currentQty * currentAvg + inQty * inUnitCost) / (currentQty + inQty);
}

/** KDV dahil tutardan KDV hariç tutarı bulur. */
export function netFromGross(gross: number, vatRate: number) {
  return gross / (1 + vatRate / 100);
}

/** Alış satırındaki birim fiyatı temel birim maliyetine çevirir (örn. 1 kg = 1000 gr). */
export function baseUnitCost(purchaseUnitPrice: number, purchaseUnitFactor: number) {
  if (purchaseUnitFactor <= 0) throw new Error("Çevrim katsayısı sıfırdan büyük olmalı");
  return purchaseUnitPrice / purchaseUnitFactor;
}

export interface SoldItem {
  productId: string;
  name: string;
  quantity: number;
  /** KDV dahil birim fiyat */
  unitPrice: number;
  vatRate: number;
  /** KDV hariç birim maliyet */
  unitCost: number;
}

export interface ProductProfit {
  productId: string;
  name: string;
  quantity: number;
  grossRevenue: number;
  netRevenue: number;
  cost: number;
  profit: number;
  /** Kâr / net ciro (%) */
  marginPct: number;
  /** Maliyet / net ciro (%) — sektörde "food cost" oranı */
  costPct: number;
}

/** Ürün bazında kârlılık tablosu. */
export function productProfitability(items: SoldItem[]): ProductProfit[] {
  const map = new Map<string, ProductProfit>();
  for (const it of items) {
    const row =
      map.get(it.productId) ??
      ({
        productId: it.productId,
        name: it.name,
        quantity: 0,
        grossRevenue: 0,
        netRevenue: 0,
        cost: 0,
        profit: 0,
        marginPct: 0,
        costPct: 0,
      } satisfies ProductProfit);
    const gross = it.unitPrice * it.quantity;
    row.quantity += it.quantity;
    row.grossRevenue += gross;
    row.netRevenue += netFromGross(gross, it.vatRate);
    row.cost += it.unitCost * it.quantity;
    map.set(it.productId, row);
  }
  return [...map.values()]
    .map((r) => {
      const profit = r.netRevenue - r.cost;
      return {
        ...r,
        grossRevenue: round(r.grossRevenue),
        netRevenue: round(r.netRevenue),
        cost: round(r.cost),
        profit: round(profit),
        marginPct: r.netRevenue ? round((profit / r.netRevenue) * 100, 1) : 0,
        costPct: r.netRevenue ? round((r.cost / r.netRevenue) * 100, 1) : 0,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export function summarize(rows: ProductProfit[]) {
  const s = rows.reduce(
    (a, r) => ({
      quantity: a.quantity + r.quantity,
      grossRevenue: a.grossRevenue + r.grossRevenue,
      netRevenue: a.netRevenue + r.netRevenue,
      cost: a.cost + r.cost,
      profit: a.profit + r.profit,
    }),
    { quantity: 0, grossRevenue: 0, netRevenue: 0, cost: 0, profit: 0 },
  );
  return {
    ...s,
    grossRevenue: round(s.grossRevenue),
    netRevenue: round(s.netRevenue),
    cost: round(s.cost),
    profit: round(s.profit),
    marginPct: s.netRevenue ? round((s.profit / s.netRevenue) * 100, 1) : 0,
    costPct: s.netRevenue ? round((s.cost / s.netRevenue) * 100, 1) : 0,
  };
}

/**
 * Önerilen satış fiyatı: hedef maliyet oranına (food cost %) göre KDV dahil fiyat.
 * Örn. maliyet 60 TL, hedef %30, KDV %10 → 60 / 0.30 = 200 net → 220 TL KDV dahil.
 */
export function suggestedPrice(unitCost: number, targetCostPct: number, vatRate: number) {
  if (targetCostPct <= 0) return 0;
  return round((unitCost / (targetCostPct / 100)) * (1 + vatRate / 100));
}

/** Cari bakiye: borç − alacak. */
export function balance(entries: { debit: number; credit: number }[]) {
  return round(entries.reduce((s, e) => s + e.debit - e.credit, 0));
}
