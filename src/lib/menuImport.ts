// Menü & reçete Excel şablonunu okur (Malzemeler / Ürünler / Reçeteler sayfaları).
// Sütunlar başlık adına göre bulunur; sıraları değişebilir. Veritabanından bağımsızdır (birim testli).
import ExcelJS from "exceljs";

export type Unit = "GR" | "ML" | "ADET";

export interface ImportStockItem {
  row: number;
  name: string;
  unit: Unit;
  purchaseUnit: string;
  factor: number;
  /** Alış birimi başına KDV hariç fiyat (boşsa null) */
  price: number | null;
  minLevel: number | null;
}
export interface ImportProduct {
  row: number;
  category: string;
  name: string;
  price: number | null;
  vatRate: number;
  active: boolean;
}
export interface ImportRecipeLine {
  row: number;
  product: string;
  item: string;
  /** Temel birime çevrilmiş miktar */
  quantity: number;
  wastePct: number;
}
export interface ParsedMenu {
  stockItems: ImportStockItem[];
  products: ImportProduct[];
  recipe: ImportRecipeLine[];
  errors: string[];
  warnings: string[];
}

/** Ad karşılaştırması: büyük/küçük harf ve fazla boşluk farkı yok sayılır */
export const key = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue); // formül: hesaplanmış değer
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return null;
}
export const text = (v: ExcelJS.CellValue) => {
  const x = cellValue(v);
  return x == null ? "" : String(x).trim();
};
export const number = (v: ExcelJS.CellValue): number | null => {
  const x = cellValue(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : parseNumberText(String(x));
  return Number.isFinite(n) ? n : null;
};

/** Metin olarak yazılmış sayı: "1.250,50" (Türkçe), "0,03", "0.03", "1250" */
export function parseNumberText(s: string) {
  const t = s.replace(/\s|₺|TL/gi, "");
  if (!t) return NaN;
  if (t.includes(",") && t.includes(".")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (t.includes(",")) return Number(t.replace(",", "."));
  return Number(t);
}

export function parseUnit(s: string): Unit | null {
  const u = key(s);
  if (["gr", "g", "gram"].includes(u)) return "GR";
  if (["ml", "mililitre"].includes(u)) return "ML";
  if (["adet", "ad", "ad.", "tane"].includes(u)) return "ADET";
  return null;
}

/** Reçete miktarını stok kaleminin temel birimine çevirir (kg→gr, lt→ml). Uyumsuzsa null. */
export function toBase(qty: number, unitText: string, base: Unit): number | null {
  const u = key(unitText);
  if (!u) return qty; // birim yazılmamışsa temel birim kabul edilir
  if (base === "GR") return ["gr", "g", "gram"].includes(u) ? qty : ["kg", "kilogram"].includes(u) ? qty * 1000 : null;
  if (base === "ML") return u === "ml" ? qty : ["lt", "l", "litre"].includes(u) ? qty * 1000 : null;
  return ["adet", "ad", "ad.", "tane"].includes(u) ? qty : null;
}

type Matcher = (h: string) => boolean;
const is = (s: string): Matcher => (h) => h === s;
const starts = (s: string): Matcher => (h) => h.startsWith(s);

/** Başlık satırından sütun numaralarını bulur */
function columns(ws: ExcelJS.Worksheet, spec: Record<string, Matcher>, required: string[], errors: string[]) {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => (headers[i] = key(text(c.value))));
  const cols: Record<string, number> = {};
  for (const [field, match] of Object.entries(spec)) {
    const i = headers.findIndex((h) => h != null && match(h));
    if (i > 0) cols[field] = i;
  }
  for (const r of required) if (!cols[r]) errors.push(`'${ws.name}' sayfasında '${r}' sütunu bulunamadı`);
  return cols;
}

function sheet(wb: ExcelJS.Workbook, name: string) {
  return wb.worksheets.find((w) => key(w.name) === key(name));
}

export async function parseMenuWorkbook(data: ArrayBuffer): Promise<ParsedMenu> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const errors: string[] = [];
  const warnings: string[] = [];
  const out: ParsedMenu = { stockItems: [], products: [], recipe: [], errors, warnings };

  // ---- Malzemeler
  const ms = sheet(wb, "Malzemeler");
  const unitOf = new Map<string, Unit>();
  if (!ms) errors.push("'Malzemeler' sayfası yok");
  else {
    const c = columns(
      ms,
      {
        name: is("malzeme adı"),
        unit: is("temel birim"),
        purchaseUnit: is("alış birimi"),
        factor: starts("1 alış birimi"),
        price: starts("alış fiyatı"),
        minLevel: starts("kritik seviye"),
      },
      ["name", "unit"],
      errors,
    );
    if (c.name && c.unit) {
      ms.eachRow((row, r) => {
        if (r === 1) return;
        const name = text(row.getCell(c.name).value);
        if (!name) return;
        const unitText = text(row.getCell(c.unit).value);
        // Yalnızca ad sütunu dolu satır (dipnot, açıklama) atlanır
        const blank = (i?: number) => !i || text(row.getCell(i).value) === "";
        if (!unitText && blank(c.purchaseUnit) && blank(c.factor) && blank(c.price)) return;
        const unit = parseUnit(unitText);
        if (!unit) return void errors.push(`Malzemeler satır ${r} (${name}): temel birim '${unitText}' geçersiz (gr, ml veya adet olmalı)`);
        const factor = c.factor ? number(row.getCell(c.factor).value) : 1;
        if (!factor || factor <= 0) return void errors.push(`Malzemeler satır ${r} (${name}): '1 alış birimi = ? temel birim' sıfırdan büyük olmalı`);
        if (unitOf.has(key(name))) return void errors.push(`Malzemeler satır ${r}: '${name}' iki kez yazılmış`);
        unitOf.set(key(name), unit);
        out.stockItems.push({
          row: r,
          name,
          unit,
          purchaseUnit: (c.purchaseUnit && text(row.getCell(c.purchaseUnit).value)) || unitText,
          factor,
          price: c.price ? number(row.getCell(c.price).value) : null,
          minLevel: c.minLevel ? number(row.getCell(c.minLevel).value) : null,
        });
      });
    }
  }

  // ---- Ürünler
  const ps = sheet(wb, "Ürünler");
  if (!ps) errors.push("'Ürünler' sayfası yok");
  else {
    const c = columns(
      ps,
      { category: is("kategori"), name: is("ürün adı"), price: starts("satış fiyatı"), vat: is("kdv %"), status: is("durum") },
      ["category", "name"],
      errors,
    );
    const seen = new Set<string>();
    if (c.category && c.name) {
      ps.eachRow((row, r) => {
        if (r === 1) return;
        const name = text(row.getCell(c.name).value);
        const category = text(row.getCell(c.category).value);
        if (!name) return;
        if (!category) return void errors.push(`Ürünler satır ${r} (${name}): kategori boş`);
        if (seen.has(key(name))) return void errors.push(`Ürünler satır ${r}: '${name}' iki kez yazılmış`);
        seen.add(key(name));
        const status = c.status ? key(text(row.getCell(c.status).value)) : "satışta";
        const price = c.price ? number(row.getCell(c.price).value) : null;
        const active = status !== "taslak";
        if (active && price == null)
          warnings.push(`Ürünler satır ${r} (${name}): satış fiyatı boş. Ürün satışta görünecek ama fiyat girilene kadar adisyona eklenemez.`);
        out.products.push({
          row: r,
          category,
          name,
          price,
          vatRate: Math.round((c.vat ? number(row.getCell(c.vat).value) : null) ?? 10),
          active,
        });
      });
    }
  }

  // ---- Reçeteler
  const rs = sheet(wb, "Reçeteler");
  if (!rs) errors.push("'Reçeteler' sayfası yok");
  else {
    const c = columns(
      rs,
      { product: is("ürün adı"), item: is("malzeme adı"), qty: starts("miktar"), unit: is("birim"), waste: starts("fire") },
      ["product", "item", "qty"],
      errors,
    );
    const productNames = new Set(out.products.map((p) => key(p.name)));
    const byPair = new Map<string, ImportRecipeLine>();
    if (c.product && c.item && c.qty) {
      rs.eachRow((row, r) => {
        if (r === 1) return;
        const product = text(row.getCell(c.product).value);
        const item = text(row.getCell(c.item).value);
        if (!product && !item) return;
        const qty = number(row.getCell(c.qty).value);
        if (!product || !item) return void errors.push(`Reçeteler satır ${r}: ürün ve malzeme adı dolu olmalı`);
        if (!productNames.has(key(product))) return void errors.push(`Reçeteler satır ${r}: '${product}' Ürünler sayfasında yok`);
        const base = unitOf.get(key(item));
        if (!base) return void errors.push(`Reçeteler satır ${r}: '${item}' Malzemeler sayfasında yok`);
        if (qty == null || qty < 0) return void errors.push(`Reçeteler satır ${r} (${product} / ${item}): miktar geçersiz`);
        if (qty === 0) return void warnings.push(`Reçeteler satır ${r} (${product} / ${item}): miktar 0, atlandı`);
        const unitText = c.unit ? text(row.getCell(c.unit).value) : "";
        const quantity = toBase(qty, unitText, base);
        if (quantity == null) return void errors.push(`Reçeteler satır ${r} (${item}): birim '${unitText}', malzemenin temel birimiyle (${base.toLowerCase()}) uyumsuz`);
        const wastePct = (c.waste ? number(row.getCell(c.waste).value) : 0) ?? 0;
        const pair = `${key(product)}|${key(item)}`;
        const prev = byPair.get(pair);
        if (prev) {
          prev.quantity += quantity; // aynı malzeme iki satırda: toplanır
          warnings.push(`Reçeteler satır ${r}: '${product}' içinde '${item}' iki kez yazılmış, miktarlar toplandı`);
        } else {
          const line = { row: r, product, item, quantity, wastePct };
          byPair.set(pair, line);
          out.recipe.push(line);
        }
      });
    }
  }
  return out;
}

/** Dosyadaki fiyatlarla ürün başına reçete maliyeti (önizleme ve kontrol için) */
export function previewCosts(p: ParsedMenu) {
  const unitCost = new Map(p.stockItems.map((s) => [key(s.name), s.price != null ? s.price / s.factor : 0]));
  const missing = new Map<string, string[]>();
  const costs = new Map<string, number>();
  for (const l of p.recipe) {
    const uc = unitCost.get(key(l.item)) ?? 0;
    if (!uc) missing.set(l.product, [...(missing.get(l.product) ?? []), l.item]);
    costs.set(key(l.product), (costs.get(key(l.product)) ?? 0) + l.quantity * (1 + l.wastePct / 100) * uc);
  }
  return p.products.map((pr) => {
    const cost = costs.get(key(pr.name)) ?? 0;
    const net = pr.price != null ? pr.price / (1 + pr.vatRate / 100) : 0;
    return {
      name: pr.name,
      category: pr.category,
      active: pr.active,
      price: pr.price,
      cost,
      costPct: net ? (cost / net) * 100 : null,
      lines: p.recipe.filter((l) => key(l.product) === key(pr.name)).length,
      missingPrices: missing.get(pr.name) ?? [],
    };
  });
}
