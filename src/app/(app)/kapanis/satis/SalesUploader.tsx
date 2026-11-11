"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitSales, previewSales } from "../actions";

type Preview = Awaited<ReturnType<typeof previewSales>>;
type Line = { name: string; quantity: number; revenue: number; productId: string | null; source: string | null };
const tl = (v: number) => v.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function SalesUploader({ branches, defaultBranchId, defaultMonth }: { branches: { id: string; name: string }[]; defaultBranchId: string; defaultMonth: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [month, setMonth] = useState(defaultMonth);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const choose = (f: File | null) => {
    setPreview(null); setLines([]); setMsg(null);
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    start(async () => {
      const p = await previewSales(fd);
      setPreview(p);
      if ("lines" in p && p.lines) setLines(p.lines as Line[]);
    });
  };
  const products = preview && "products" in preview ? preview.products ?? [] : [];
  const unmatched = lines.filter((l) => !l.productId);
  const save = () => start(async () => {
    const r = await commitSales({
      branchId, month, fileName: preview && "fileName" in preview ? String(preview.fileName) : "",
      lines: lines.map(({ name, quantity, revenue, productId }) => ({ name, quantity, revenue, productId })),
    });
    if ("error" in r && r.error) setMsg({ error: r.error });
    else { setMsg({ ok: "Satış raporu kaydedildi." }); setPreview(null); setLines([]); router.refresh(); }
  });

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Adisyo satış raporu yükle</h2>
        <p className="text-sm text-slate-500">Adisyo'dan alınan ürün bazında aylık satış raporunu (Excel) seçin. Ürünler menüdeki karşılıklarıyla eşleştirilir; eşleştirmeler sonraki aylarda hatırlanır.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => input.current?.click()}>Rapor dosyası seç</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {pending && <span className="text-sm text-slate-500">İşleniyor…</span>}
      </div>
      {preview && preview.errors.length > 0 && <ul className="list-disc pl-5 text-sm text-rose-700">{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {lines.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm">
            {lines.length} ürün · toplam {lines.reduce((t, l) => t + l.quantity, 0).toLocaleString("tr-TR")} adet · {tl(lines.reduce((t, l) => t + l.revenue, 0))}
            {unmatched.length > 0 && <span className="ml-2 font-semibold text-amber-700">{unmatched.length} ürün eşleşmedi</span>}
          </p>
          <div className="max-h-96 overflow-auto rounded border border-slate-200">
            <table className="table">
              <thead><tr><th>Rapordaki ürün</th><th className="num">Adet</th><th className="num">Tutar</th><th>Menüdeki karşılığı</th></tr></thead>
              <tbody>
                {[...lines].sort((a, b) => Number(!!a.productId) - Number(!!b.productId)).map((l) => (
                  <tr key={l.name} className={l.productId ? "" : "bg-amber-50"}>
                    <td>{l.name}{l.source && <span className="ml-1 text-xs text-emerald-700">({l.source})</span>}</td>
                    <td className="num">{l.quantity.toLocaleString("tr-TR")}</td>
                    <td className="num">{tl(l.revenue)}</td>
                    <td>
                      <select className="input py-1" value={l.productId ?? ""}
                        onChange={(e) => setLines(lines.map((x) => (x.name === l.name ? { ...x, productId: e.target.value || null, source: null } : x)))}>
                        <option value="">— Eşleştirme yok (reçeteye katılmaz) —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Eşleşmeyen ürünler (ör. içecekler, reçetesi olmayanlar) ciroya katılır ama malzeme tüketimi hesabına katılmaz.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label">Şube</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Ay</label><input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <button className="btn-primary" disabled={pending || !branchId || !month} onClick={save}>Raporu kaydet</button>
          </div>
        </div>
      )}
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      {msg?.error && <p className="text-sm text-rose-700">{msg.error}</p>}
    </div>
  );
}
