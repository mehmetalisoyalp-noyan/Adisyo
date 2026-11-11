"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitCount, previewCount } from "../actions";

type Preview = Awaited<ReturnType<typeof previewCount>>;
const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });

export function CountUploader({ branches, defaultBranchId }: { branches: { id: string; name: string }[]; defaultBranchId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [date, setDate] = useState("");
  const [apply, setApply] = useState(true);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  const choose = (f: File | null) => {
    setFile(f); setPreview(null); setMsg(null);
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    start(async () => {
      const p = await previewCount(fd);
      setPreview(p);
      if ("date" in p && p.date) setDate(p.date);
      if ("branchId" in p && p.branchId && branches.some((b) => b.id === p.branchId)) setBranchId(p.branchId);
    });
  };
  const save = () => start(async () => {
    const fd = new FormData();
    fd.append("file", file!); fd.append("branchId", branchId); fd.append("date", date);
    if (apply) fd.append("apply", "on");
    const r = await commitCount(fd);
    if ("error" in r && r.error) setMsg({ error: r.error });
    else { setMsg({ ok: "Sayım kaydedildi." }); setPreview(null); setFile(null); router.refresh(); }
  });
  const ok = preview && preview.errors.length === 0 && "counted" in preview;

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Sayım formu yükle</h2>
        <p className="text-sm text-slate-500">Şubenin doldurduğu "Ay Sonu Stok Sayım Formu" Excel dosyasını seçin. Miktarlar kapalı ambalaj × içerik + açık miktar olarak hesaplanır.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => input.current?.click()}>Sayım dosyası seç</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <span className="text-sm text-slate-600">{file?.name ?? "Dosya seçilmedi"}</span>
        {pending && <span className="text-sm text-slate-500">İşleniyor…</span>}
      </div>
      {preview && preview.errors.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-rose-700">{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}
      {ok && "counted" in preview && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm">
            Formda yazan şube: <b>{preview.branchName || "-"}</b> · Tarih: <b>{preview.date || "-"}</b> · Sayılan kalem: <b>{preview.counted}</b>
            {preview.withCost > 0 && <> · Birim maliyeti girilmiş kalem: <b>{preview.withCost}</b></>}
          </p>
          {preview.blanks.length > 0 && (
            <p className="text-xs text-amber-700"><b>{preview.blanks.length} kalem boş bırakılmış — SAYILMADI kabul edilecek</b> (stokta yoksa forma 0 yazılmalı): {preview.blanks.join(", ")}</p>
          )}
          {preview.unknown.length > 0 && (
            <p className="text-xs text-amber-700"><b>Programda olmayan kalemler (alınmayacak):</b> {preview.unknown.map((u) => `${u.name} (${u.quantity})`).join(", ")}</p>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-emerald-700">Sayılan miktarları göster</summary>
            <div className="mt-2 grid gap-x-6 sm:grid-cols-3">{preview.lines.map((l) => <div key={l.name}>{l.name}: <b>{fmt(l.quantity)}</b></div>)}</div>
          </details>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label">Şube</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Sayım tarihi</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} /> Şube stok miktarlarını bu sayıma eşitle</label>
            <button className="btn-primary" disabled={pending || !date || !branchId} onClick={save}>Sayımı kaydet</button>
          </div>
        </div>
      )}
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      {msg?.error && <p className="text-sm text-rose-700">{msg.error}</p>}
    </div>
  );
}
