"use client";
import { useState, useTransition } from "react";
import { setProductAlias } from "../actions";

export function AliasSelect({ name, value, products }: { name: string; value: string; products: { id: string; name: string }[] }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <select className="input py-1" value={v} disabled={pending}
        onChange={(e) => { const nv = e.target.value; setV(nv); setSaved(false); start(async () => { await setProductAlias(name, nv || null); setSaved(true); }); }}>
        <option value="">— Eşleştirme yok (reçeteye katılmaz) —</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {pending ? <span className="text-xs text-slate-400">…</span> : saved && <span className="text-xs text-emerald-700">kaydedildi</span>}
    </span>
  );
}
