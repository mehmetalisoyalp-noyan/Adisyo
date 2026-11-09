"use client";
import { useState, useTransition } from "react";
import { defaultBaseQty, UNIT_NAMES } from "@/lib/ubl";
import { processIncomingAction } from "../../../actions";

type Item = { id: string; name: string; unit: "GR" | "ML" | "ADET"; purchaseUnit: string; factor: number; lastCost: number };
type Line = {
  lineNo: string; name: string; code: string | null; quantity: number; unitCode: string;
  lineNet: number; vatRate: number; stockItemId: string | null; baseQtyPerUnit: number; source: "memory" | "guess" | "none";
};
const BASE = { GR: "gr", ML: "ml", ADET: "adet" } as const;
const tl = (v: number) => v.toLocaleString("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const SOURCE = { memory: ["hatırlandı", "bg-emerald-100 text-emerald-800"], guess: ["öneri", "bg-amber-100 text-amber-800"], none: ["", ""] } as const;

export function MappingForm({ docId, branches, defaultBranchId, stockItems, lines }: {
  docId: string; branches: { id: string; name: string }[]; defaultBranchId: string; stockItems: Item[]; lines: Line[];
}) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [rows, setRows] = useState(lines.map((l) => ({ stockItemId: l.stockItemId ?? "", base: String(l.baseQtyPerUnit) })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const itemOf = (id: string) => stockItems.find((s) => s.id === id);

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await processIncomingAction(docId, {
        branchId,
        lines: lines.map((l, i) => ({
          lineNo: l.lineNo,
          stockItemId: rows[i].stockItemId || null,
          baseQtyPerUnit: Number(rows[i].base.replace(",", ".")) || 0,
        })),
      });
      if (res?.error) setError(res.error);
    });

  return (
    <div className="card space-y-4">
      <div className="max-w-xs">
        <label className="label">Hangi şubenin alışı?</label>
        <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Faturadaki kalem</th><th className="num">Miktar</th><th className="num">Tutar (KDV hariç)</th><th>Bizim stok kalemimiz</th><th>Birim çevrimi</th><th className="num">Hesaplanan maliyet</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const r = rows[i];
              const item = itemOf(r.stockItemId);
              const base = Number(r.base.replace(",", ".")) || 0;
              const baseQty = l.quantity * base;
              const perPurchaseUnit = item && baseQty ? (l.lineNet / baseQty) * item.factor : 0;
              const last = item ? item.lastCost * item.factor : 0;
              const change = last && perPurchaseUnit ? ((perPurchaseUnit - last) / last) * 100 : 0;
              const unitName = UNIT_NAMES[l.unitCode] ?? l.unitCode;
              const [srcLabel, srcClass] = SOURCE[l.source];
              return (
                <tr key={l.lineNo} className="align-top">
                  <td className="min-w-48">
                    {l.name}
                    {l.code && <div className="text-xs text-slate-400">kod: {l.code}</div>}
                    {r.stockItemId === (l.stockItemId ?? "") && srcLabel && <span className={`rounded px-1 text-xs ${srcClass}`}>{srcLabel}</span>}
                  </td>
                  <td className="num whitespace-nowrap">{l.quantity.toLocaleString("tr-TR")} {unitName}</td>
                  <td className="num whitespace-nowrap">{tl(l.lineNet)}<div className="text-xs text-slate-400">KDV %{l.vatRate}</div></td>
                  <td className="min-w-52">
                    <select
                      className="input"
                      value={r.stockItemId}
                      onChange={(e) => {
                        const it = itemOf(e.target.value);
                        setRow(i, { stockItemId: e.target.value, base: it ? String(defaultBaseQty(l.unitCode, it.unit, it.factor)) : "1" });
                      }}
                    >
                      <option value="">— Stoğa girmez (gider: nakliye, ambalaj…) —</option>
                      {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap">
                    {item ? (
                      <span className="flex items-center gap-1 text-sm">
                        1 {unitName} =
                        <input className="input w-24 py-1" inputMode="decimal" value={r.base} onChange={(e) => setRow(i, { base: e.target.value })} />
                        {BASE[item.unit]}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="num whitespace-nowrap">
                    {item && perPurchaseUnit > 0 ? (
                      <>
                        {tl(perPurchaseUnit)} / {item.purchaseUnit.split(" ")[0]}
                        {last > 0 && Math.abs(change) >= 1 && (
                          <div className={`text-xs ${Math.abs(change) > 30 ? "font-semibold text-rose-600" : change > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                            önceki alışa göre {change > 0 ? "+" : ""}{change.toFixed(0)}%{Math.abs(change) > 30 ? " — birim çevrimini kontrol edin" : ""}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">{item ? "-" : "gider"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Birim çevrimi: faturadaki 1 birimin bizim temel birimimizde karşılığı. Örneğin "1 koli = 30 adet" ya da "1 kg = 1000 gr".
        Kaydettiğiniz eşleştirmeler bu tedarikçinin sonraki faturalarında otomatik gelir.
      </p>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary" disabled={pending || !branchId} onClick={submit}>
        {pending ? "Kaydediliyor…" : "Alış faturası olarak kaydet"}
      </button>
    </div>
  );
}
