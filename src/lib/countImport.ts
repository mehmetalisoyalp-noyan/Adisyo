// Ay sonu stok sayım formunu (Excel) okur ve temel birim miktarlarına çevirir.
// Biçim: "Ay_Sonu_Stok_Sayim_Formu.xlsx" — başlık satırı "Malzeme adı" hücresinden bulunur.
import ExcelJS from "exceljs";
import { key, number, text } from "./menuImport";

export interface CountItem {
  id: string;
  name: string;
  unit: "GR" | "ML" | "ADET";
  purchaseUnitFactor: number;
}

export interface ParsedCount {
  branchName: string | null;
  /** Formda yazılı sayım tarihi (YYYY-AA-GG) */
  date: string | null;
  lines: { stockItemId: string; name: string; quantity: number; unitCost: number | null }[];
  /** Miktarı boş bırakılan veya formda olmayan malzemeler: SAYILMADI kabul edilir (0 değil) */
  blanks: string[];
  /** Formda olup programda bulunmayan adlar */
  unknown: { row: number; name: string; quantity: string }[];
  errors: string[];
}

/** "31.12.2026", "31/12/2026", "2026-12-31" veya Excel tarihi → YYYY-AA-GG */
export function parseDate(v: ExcelJS.CellValue): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = text(v);
  let m = t.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/** Açık miktar birimini temel birime çeviren çarpan; uyumsuzsa null */
export function openFactor(unitText: string, base: CountItem["unit"]): number | null {
  const u = key(unitText);
  if (!u) return base === "ADET" ? 1 : 1000; // birim yazılmamışsa: adet ya da kg/lt kabul edilir
  if (base === "ADET") return ["adet", "ad", "tane"].includes(u) ? 1 : null;
  // Sıvı/katı karışık tutulan kalemler (ör. litreyle alınıp gramla tutulan yağ) için lt ≈ kg kabul edilir
  const big = ["kg", "kilo", "lt", "l", "litre"].includes(u);
  const small = ["gr", "g", "gram", "ml"].includes(u);
  return big ? 1000 : small ? 1 : null;
}

export async function parseCountWorkbook(data: ArrayBuffer, items: CountItem[]): Promise<ParsedCount> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedCount = { branchName: null, date: null, lines: [], blanks: [], unknown: [], errors: [] };
  const ws = wb.worksheets.find((w) => key(w.name).includes("sayım")) ?? wb.worksheets[0];
  if (!ws) {
    out.errors.push("Dosyada sayfa yok");
    return out;
  }
  // Üst bilgiler: "Şube:" ve "Sayım tarihi" etiketlerinin sağındaki ilk dolu hücre
  for (let r = 1; r <= 6; r++) {
    const row = ws.getRow(r);
    row.eachCell((cell, c) => {
      const label = key(text(cell.value));
      const right = () => {
        for (let k = c + 1; k <= c + 4; k++) {
          const v = row.getCell(k).value;
          if (text(v)) return v;
        }
        return null;
      };
      if (label.startsWith("şube")) out.branchName = text(right()) || null;
      if (label.startsWith("sayım tarihi")) out.date = parseDate(right());
    });
  }
  // Başlık satırı
  let hdr = 0;
  const col: Record<string, number> = {};
  for (let r = 1; r <= 30 && !hdr; r++) {
    ws.getRow(r).eachCell((cell) => {
      if (key(text(cell.value)) === "malzeme adı") hdr = r;
    });
  }
  if (!hdr) {
    out.errors.push("'Malzeme adı' başlığı bulunamadı. Sayım formunu kullanın.");
    return out;
  }
  ws.getRow(hdr).eachCell((cell, c) => {
    const h = key(text(cell.value));
    if (h === "malzeme adı") col.name = c;
    else if (h.startsWith("kapalı ambalaj")) col.closed = c;
    else if (h.startsWith("açık miktar birimi")) col.unit = c;
    else if (h === "açık miktar") col.open = c;
    else if (h.startsWith("birim maliyet")) col.cost = c;
  });
  for (const k of ["closed", "open"]) if (!col[k]) out.errors.push(`'${k === "closed" ? "Kapalı ambalaj adedi" : "Açık miktar"}' sütunu bulunamadı`);
  if (out.errors.length) return out;

  const byKey = new Map(items.map((i) => [key(i.name), i]));
  const seen = new Set<string>();
  for (let r = hdr + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = text(row.getCell(col.name).value);
    if (!name) continue; // bölüm başlığı veya boş satır
    const closedRaw = row.getCell(col.closed).value;
    const openRaw = row.getCell(col.open).value;
    const closed = number(closedRaw);
    const open = number(openRaw);
    const item = byKey.get(key(name));
    if (!item) {
      if (closed != null || open != null) out.unknown.push({ row: r, name, quantity: [text(closedRaw), text(openRaw)].filter(Boolean).join(" + ") });
      continue;
    }
    if (seen.has(item.id)) {
      out.errors.push(`Satır ${r}: '${name}' iki kez yazılmış`);
      continue;
    }
    seen.add(item.id);
    if ((text(closedRaw) && closed == null) || (text(openRaw) && open == null)) {
      out.errors.push(`Satır ${r} (${name}): miktar sayı değil`);
      continue;
    }
    if ((closed ?? 0) < 0 || (open ?? 0) < 0) {
      out.errors.push(`Satır ${r} (${name}): miktar eksi olamaz`);
      continue;
    }
    if (closed == null && open == null) {
      out.blanks.push(item.name); // boş = sayılmadı; gerçekten yoksa forma 0 yazılmalı
      continue;
    }
    const unitText = col.unit ? text(row.getCell(col.unit).value) : "";
    const f = openFactor(unitText, item.unit);
    if (f == null) {
      out.errors.push(`Satır ${r} (${name}): açık miktar birimi '${unitText}', malzemenin birimiyle uyumsuz`);
      continue;
    }
    const quantity = (closed ?? 0) * item.purchaseUnitFactor + (open ?? 0) * f;
    // Birim maliyet: alış birimi (ambalaj) başına, KDV hariç → temel birime çevrilir
    const costPerPack = col.cost ? number(row.getCell(col.cost).value) : null;
    out.lines.push({
      stockItemId: item.id,
      name: item.name,
      quantity: Math.round(quantity * 10000) / 10000,
      unitCost: costPerPack != null && costPerPack > 0 ? costPerPack / item.purchaseUnitFactor : null,
    });
  }
  // Formda hiç yer almayan malzemeler de sayılmamış kabul edilir
  for (const i of items) if (!seen.has(i.id)) out.blanks.push(i.name);
  return out;
}
