"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncAdisyoStep } from "../actions";

/** Adisyo eşitlemesini adım adım yürütür: her adım bir sayfa, adımlar arası Adisyo sınırı kadar bekleme */
export function SyncButton({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [total, setTotal] = useState(0);
  const stop = useRef(false);

  async function run() {
    setRunning(true);
    stop.current = false;
    let count = 0;
    setTotal(0);
    for (let i = 0; i < 500 && !stop.current; i++) {
      const r = await syncAdisyoStep(branchId);
      count += r.orders;
      setTotal(count);
      if (!r.ok) { setMsg({ text: r.message, error: true }); break; }
      if (r.done) { setMsg({ text: `${r.message} · bu turda ${count} sipariş alındı` }); break; }
      // Bekleme: geri sayımlı
      for (let left = Math.ceil(r.waitMs / 1000); left > 0 && !stop.current; left--) {
        setMsg({ text: `${r.message} · ${count} sipariş alındı · sonraki sayfa ${left} sn sonra (Adisyo sınırı)` });
        await new Promise((res) => setTimeout(res, 1000));
      }
    }
    if (stop.current) setMsg({ text: `Durduruldu · ${count} sipariş alındı. Tekrar başlatınca kaldığı yerden devam eder.` });
    setRunning(false);
    router.refresh();
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {!running ? (
        <button type="button" className="btn-secondary" onClick={run}>Şimdi eşitle</button>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => (stop.current = true)}>Durdur</button>
      )}
      {msg && <span className={`text-sm ${msg.error ? "text-rose-600" : "text-emerald-700"}`}>{msg.text}</span>}
      {running && !msg && <span className="text-sm text-slate-500">Başlatılıyor… {total ? `${total} sipariş` : ""}</span>}
    </span>
  );
}
