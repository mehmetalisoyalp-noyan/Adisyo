"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadDailyRevenue } from "../actions";

export function CiroUploader({ branches, defaultBranchId }: { branches: { id: string; name: string }[]; defaultBranchId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const send = (f: File | null) => {
    setMsg(null);
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("branchId", branchId);
    start(async () => {
      const r = await uploadDailyRevenue(fd);
      setMsg(r);
      if ("ok" in r) router.refresh();
    });
  };
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Günlük ciro raporu yükle</h2>
        <p className="text-sm text-slate-500">
          Adisyo → Restoran İstatistikleri → <b>Günlük Ciro Verileri</b> raporunu (Excel) yükleyin. Aynı günler tekrar yüklenirse eskisinin yerine geçer.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label">Şube</label>
          <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
        <button className="btn-primary" disabled={pending || !branchId} onClick={() => input.current?.click()}>Rapor dosyası seç ve kaydet</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { send(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {pending && <span className="text-sm text-slate-500">İşleniyor…</span>}
      </div>
      {msg?.ok && <p className="text-sm text-emerald-700">{msg.ok}</p>}
      {msg?.error && <p className="text-sm text-rose-700">{msg.error}</p>}
    </div>
  );
}
