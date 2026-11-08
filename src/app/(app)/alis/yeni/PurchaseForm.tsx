"use client";
import { useState, useTransition } from "react";
import { createPurchase } from "../../actions";

type Opt = { id: string; name: string };
type Item = Opt & { purchaseUnit: string; lastPrice: number };
type Line = { stockItemId: string; quantity: string; unitPrice: string; vatRate: string };

const n = (v: string) => Number(v.replace(",", ".")) || 0;
const tl = (v: number) => v.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function PurchaseForm({ branches, suppliers, items }: { branches: Opt[]; suppliers: Opt[]; items: Item[] }) {
  const [head, setHead] = useState({
    branchId: branches[0]?.id ?? "",
    supplierId: suppliers[0]?.id ?? "",
    invoiceNo: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const empty: Line = { stockItemId: "", quantity: "", unitPrice: "", vatRate: "1" };
  const [lines, setLines] = useState<Line[]>([empty]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const net = lines.reduce((s, l) => s + n(l.quantity) * n(l.unitPrice), 0);
  const vat = lines.reduce((s, l) => s + (n(l.quantity) * n(l.unitPrice) * n(l.vatRate)) / 100, 0);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createPurchase({
        ...head,
        lines: lines
          .filter((l) => l.stockItemId)
          .map((l) => ({ stockItemId: l.stockItemId, quantity: n(l.quantity), unitPrice: n(l.unitPrice), vatRate: Math.round(n(l.vatRate)) })),
      });
      if (res?.error) setError(res.error);
    });

  return (
    <div className="card space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <div><label className="label">Şube</label>
          <select className="input" value={head.branchId} onChange={(e) => setHead({ ...head, branchId: e.target.value })}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
        <div><label className="label">Tedarikçi</label>
          <select className="input" value={head.supplierId} onChange={(e) => setHead({ ...head, supplierId: e.target.value })}>
            {suppliers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
        <div><label className="label">Fatura no</label>
          <input className="input" value={head.invoiceNo} onChange={(e) => setHead({ ...head, invoiceNo: e.target.value })} /></div>
        <div><label className="label">Tarih</label>
          <input type="date" className="input" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Stok kalemi</th><th>Miktar</th><th>Birim fiyat (KDV hariç)</th><th>KDV %</th><th className="num">Tutar</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = items.find((x) => x.id === l.stockItemId);
              return (
                <tr key={i}>
                  <td className="min-w-48">
                    <select className="input" value={l.stockItemId} onChange={(e) => {
                      const sel = items.find((x) => x.id === e.target.value);
                      set(i, { stockItemId: e.target.value, unitPrice: l.unitPrice || (sel?.lastPrice ? String(Math.round(sel.lastPrice * 100) / 100) : "") });
                    }}>
                      <option value="">Seçin…</option>
                      {items.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </td>
                  <td className="min-w-28">
                    <input className="input" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                    {it && <div className="text-xs text-slate-400">{it.purchaseUnit}</div>}
                  </td>
                  <td className="min-w-28"><input className="input" inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} /></td>
                  <td className="w-20"><input className="input" inputMode="numeric" value={l.vatRate} onChange={(e) => set(i, { vatRate: e.target.value })} /></td>
                  <td className="num">{tl(n(l.quantity) * n(l.unitPrice))}</td>
                  <td><button type="button" className="text-xs text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Sil</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-secondary" onClick={() => setLines([...lines, empty])}>+ Satır ekle</button>
      <div className="space-y-1 text-right text-sm">
        <div>KDV hariç: <b>{tl(net)}</b></div>
        <div>KDV: <b>{tl(vat)}</b></div>
        <div className="text-lg">Toplam: <b>{tl(net + vat)}</b></div>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button className="btn-primary" disabled={pending || !head.invoiceNo} onClick={submit}>{pending ? "Kaydediliyor…" : "Faturayı kaydet"}</button>
    </div>
  );
}
