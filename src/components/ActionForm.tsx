"use client";
import { startTransition, useActionState, useState, useTransition } from "react";

type Result = { error?: string; ok?: string } | null;

/** Sunucu işlemi sonucunu (başarı / hata) formun altında gösteren form */
export function ActionForm({
  action,
  children,
  submit,
  className = "",
  danger,
  confirm,
}: {
  action: (prev: Result, f: FormData) => Promise<Result>;
  children: React.ReactNode;
  submit: string;
  className?: string;
  danger?: boolean;
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form
      className={className}
      onSubmit={(e) => {
        // Formu elle gönderiyoruz: React'in gönderim sonrası alanları sıfırlamasını önler,
        // böylece hata mesajında kullanıcının yazdıkları kaybolmaz.
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={danger ? "btn-danger" : "btn-primary"} disabled={pending}>
          {pending ? "Kaydediliyor…" : submit}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
        {state?.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}

/** Tek tıklık işlem düğmesi (isteğe bağlı onay sorusu) */
export function ActionButton({
  action,
  label,
  confirm,
  className = "btn-secondary px-2 py-1 text-xs",
}: {
  action: () => Promise<Result>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setRes(await action()));
        }}
      >
        {pending ? "…" : label}
      </button>
      {res?.ok && <span className="text-xs text-emerald-700">{res.ok}</span>}
      {res?.error && <span className="text-xs text-rose-600">{res.error}</span>}
    </span>
  );
}
