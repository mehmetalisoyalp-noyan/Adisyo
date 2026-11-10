// UBL-TR (GİB e-Fatura / e-Arşiv) XML okuyucu.
// Tüm entegratörler (Mikrogrup e-Portal dahil) bu standart biçimi kullanır.
import { XMLParser } from "fast-xml-parser";

export interface UblParty {
  name: string;
  /** VKN (10 hane) veya TCKN (11 hane) */
  taxNumber: string | null;
  taxOffice: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

export interface UblLine {
  lineNo: string;
  name: string;
  /** Tedarikçinin ürün kodu (varsa) */
  code: string | null;
  quantity: number;
  /** UN/ECE birim kodu: KGM, GRM, LTR, MLT, C62 (adet), BX (kutu)… */
  unitCode: string;
  /** İskonto sonrası KDV hariç satır tutarı */
  lineNet: number;
  vatRate: number;
  vatAmount: number;
  /** Faturadaki birim fiyat (iskonto öncesi, KDV hariç) */
  unitPrice?: number;
  /** Satır iskontosu (tutar ve oran %) */
  discount?: number;
  discountPct?: number;
  /** Kalem açıklaması, marka/model ve satır notu — faturada ürün adı kısa/kodlu ise içerik buradadır */
  description?: string | null;
  note?: string | null;
}

export interface UblInvoice {
  uuid: string;
  number: string;
  issueDate: string;
  profile: string;
  /** SATIS, IADE, TEVKIFAT, ISTISNA… */
  typeCode: string;
  currency: string;
  supplier: UblParty;
  customer: UblParty;
  lines: UblLine[];
  totalNet: number;
  totalVat: number;
  payable: number;
  /** Fatura genel notları (cbc:Note) */
  notes?: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  // Tek elemanlı listeler de dizi olsun
  isArray: (name) =>
    ["InvoiceLine", "PartyIdentification", "TaxSubtotal", "AllowanceCharge", "Note", "Contact", "AdditionalDocumentReference", "AdditionalItemIdentification"].includes(name),
});

type Node = Record<string, unknown> | undefined;

/** Etiket değeri: düz metin veya {#text, @attr} biçiminde olabilir */
const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "").trim();
  return String(v).trim();
};
const n = (v: unknown) => {
  const t = text(v).replace(",", ".");
  return t ? Number(t) : 0;
};
const get = (o: Node, ...path: string[]): unknown =>
  path.reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined), o);

function party(p: Node): UblParty {
  const ids = (get(p, "PartyIdentification") as Node[] | undefined) ?? [];
  let taxNumber: string | null = null;
  for (const id of ids) {
    const v = get(id, "ID") as Record<string, unknown> | string | undefined;
    const scheme = typeof v === "object" ? String(v?.["@schemeID"] ?? "") : "";
    if (scheme === "VKN" || scheme === "TCKN") {
      taxNumber = text(v);
      break;
    }
  }
  const person = get(p, "Person") as Node;
  const name =
    text(get(p, "PartyName", "Name")) ||
    [text(get(person, "FirstName")), text(get(person, "FamilyName"))].filter(Boolean).join(" ");
  const addr = get(p, "PostalAddress") as Node;
  const address = [
    text(get(addr, "StreetName")),
    text(get(addr, "BuildingNumber")),
    text(get(addr, "CitySubdivisionName")),
    text(get(addr, "CityName")),
  ]
    .filter(Boolean)
    .join(" ");
  const contact = ((get(p, "Contact") as Node[] | undefined) ?? [])[0];
  return {
    name: name || "Bilinmeyen",
    taxNumber,
    taxOffice: text(get(p, "PartyTaxScheme", "TaxScheme", "Name")) || null,
    address: address || null,
    email: text(get(contact, "ElectronicMail")) || null,
    phone: text(get(contact, "Telephone")) || null,
  };
}

function lineVat(line: Node): { rate: number; amount: number } {
  const subs = (get(line, "TaxTotal", "TaxSubtotal") as Node[] | undefined) ?? [];
  // KDV'nin vergi kodu 0015
  const kdv =
    subs.find((s) => text(get(s, "TaxCategory", "TaxScheme", "TaxTypeCode")) === "0015") ?? subs[0];
  return { rate: n(get(kdv, "Percent")), amount: n(get(kdv, "TaxAmount")) };
}

export function parseUbl(xml: string): UblInvoice {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const inv = doc.Invoice as Node;
  if (!inv) throw new Error("Bu dosya bir UBL e-fatura (Invoice) değil");

  const lines: UblLine[] = ((get(inv, "InvoiceLine") as Node[] | undefined) ?? []).map((l) => {
    const qtyNode = get(l, "InvoicedQuantity") as Record<string, unknown> | string | undefined;
    const vat = lineVat(l);
    const item = get(l, "Item") as Node;
    const allowances = ((get(l, "AllowanceCharge") as Node[] | undefined) ?? []).filter(
      (a) => text(get(a, "ChargeIndicator")) !== "true",
    );
    const discount = allowances.reduce((s, a) => s + n(get(a, "Amount")), 0);
    const factor = allowances.reduce((s, a) => s + n(get(a, "MultiplierFactorNumeric")), 0);
    const extra = [
      text(get(item, "Description")),
      text(get(item, "BrandName")),
      text(get(item, "ModelName")),
      text(get(((get(item, "AdditionalItemIdentification") as Node[] | undefined) ?? [])[0], "ID")),
    ]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    const lineNotes = (get(l, "Note") as unknown[] | undefined) ?? [];
    return {
      lineNo: text(get(l, "ID")),
      name: text(get(item, "Name")) || text(get(item, "Description")) || "Kalem",
      code:
        text(get(item, "SellersItemIdentification", "ID")) ||
        text(get(item, "ManufacturersItemIdentification", "ID")) ||
        null,
      quantity: n(qtyNode),
      unitCode: (typeof qtyNode === "object" ? String(qtyNode?.["@unitCode"] ?? "") : "") || "C62",
      lineNet: n(get(l, "LineExtensionAmount")),
      vatRate: vat.rate,
      vatAmount: vat.amount,
      unitPrice: n(get(l, "Price", "PriceAmount")),
      discount,
      discountPct: factor ? Math.round(factor * 10000) / 100 : discount ? undefined : 0,
      description: extra.filter((v) => v !== text(get(item, "Name"))).join(" · ") || null,
      note: lineNotes.map((x) => text(x)).filter(Boolean).join(" · ") || null,
    };
  });

  const totals = get(inv, "LegalMonetaryTotal") as Node;
  const totalNet = n(get(totals, "TaxExclusiveAmount")) || lines.reduce((s, l) => s + l.lineNet, 0);
  return {
    uuid: text(get(inv, "UUID")),
    number: text(get(inv, "ID")),
    issueDate: text(get(inv, "IssueDate")),
    profile: text(get(inv, "ProfileID")),
    typeCode: text(get(inv, "InvoiceTypeCode")),
    currency: text(get(inv, "DocumentCurrencyCode")) || "TRY",
    supplier: party(get(inv, "AccountingSupplierParty", "Party") as Node),
    customer: party(get(inv, "AccountingCustomerParty", "Party") as Node),
    lines,
    totalNet,
    totalVat: n(get(inv, "TaxTotal", "TaxAmount")) || lines.reduce((s, l) => s + l.vatAmount, 0),
    payable: n(get(totals, "PayableAmount")),
    notes: ((get(inv, "Note") as unknown[] | undefined) ?? []).map((x) => text(x)).filter(Boolean),
  };
}

/** Eşleştirme hafızası anahtarı: ürün kodu, yoksa sadeleştirilmiş ad */
export function itemKey(line: Pick<UblLine, "code" | "name">) {
  if (line.code) return `kod:${line.code.trim().toLocaleUpperCase("tr-TR")}`;
  return `ad:${line.name.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim()}`;
}

/** Birim kodunun okunur karşılığı */
export const UNIT_NAMES: Record<string, string> = {
  KGM: "kg",
  GRM: "gr",
  LTR: "lt",
  MLT: "ml",
  C62: "adet",
  NIU: "adet",
  H87: "adet",
  BX: "kutu",
  PA: "paket",
  CS: "koli",
  CR: "kasa",
  PR: "çift",
  SET: "set",
  MTR: "m",
  TNE: "ton",
};

/**
 * Faturadaki 1 birimin, stok kaleminin temel birimi cinsinden varsayılan karşılığı.
 * Kesin bilinemeyen durumlarda (kutu, koli…) stok kaleminin alış birimi katsayısı önerilir.
 */
export function defaultBaseQty(unitCode: string, baseUnit: "GR" | "ML" | "ADET", purchaseUnitFactor: number) {
  const u = unitCode.toUpperCase();
  if (baseUnit === "GR") {
    if (u === "KGM") return 1000;
    if (u === "GRM") return 1;
    if (u === "TNE") return 1_000_000;
  }
  if (baseUnit === "ML") {
    if (u === "LTR") return 1000;
    if (u === "MLT") return 1;
  }
  if (baseUnit === "ADET" && ["C62", "NIU", "H87"].includes(u)) return 1;
  return purchaseUnitFactor || 1;
}
