"use client";
import { useState, useTransition } from "react";
import { issueEDocument } from "../actions";

export function IssueButton({ orderId, label }: { orderId: string; label: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span>
      <button
        className="btn-secondary px-2 py-1 text-xs"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await issueEDocument(orderId);
          setErr(r && "error" in r ? (r.error ?? null) : null);
        })}
      >
        {pending ? "Gönderiliyor…" : label}
      </button>
      {err && <span className="ml-2 text-xs text-rose-600">{err}</span>}
    </span>
  );
}
