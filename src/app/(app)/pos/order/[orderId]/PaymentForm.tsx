"use client";
import { useActionState, useState } from "react";
import { payOrder } from "../../../actions";

export function PaymentForm({
  orderId,
  total,
  customers,
}: {
  orderId: string;
  total: number;
  customers: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(payOrder.bind(null, orderId), null);
  const [v, setV] = useState({ CASH: "", CARD: "", ACCOUNT: "" });
  const paid = Object.values(v).reduce((s, x) => s + (Number(x.replace(",", ".")) || 0), 0);
  const remaining = Math.round((total - paid) * 100) / 100;
  const all = (k: keyof typeof v) => setV({ CASH: "", CARD: "", ACCOUNT: "", [k]: String(total) });

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary" onClick={() => all("CASH")}>Tamamı nakit</button>
        <button type="button" className="btn-secondary" onClick={() => all("CARD")}>Tamamı kart</button>
        <button type="button" className="btn-secondary" onClick={() => all("ACCOUNT")}>Cariye yaz</button>
      </div>
      {(["CASH", "CARD", "ACCOUNT"] as const).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <label className="w-24 text-sm">{k === "CASH" ? "Nakit" : k === "CARD" ? "Kredi kartı" : "Cariye"}</label>
          <input
            name={k}
            inputMode="decimal"
            className="input"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
            placeholder="0"
          />
        </div>
      ))}
      {Number(v.ACCOUNT) > 0 && (
        <select name="customerId" required className="input" defaultValue="">
          <option value="" disabled>Müşteri carisi seçin</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className={`text-sm ${remaining === 0 ? "text-emerald-700" : "text-amber-700"}`}>
        Kalan: {remaining.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
      </div>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <button className="btn-primary w-full py-3 text-base" disabled={pending || remaining !== 0 || total <= 0}>
        {pending ? "Kaydediliyor…" : "Ödemeyi al ve kapat"}
      </button>
    </form>
  );
}
