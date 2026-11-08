"use client";
import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="h1">Restoran Yönetim</h1>
          <p className="text-sm text-slate-500">Hesabınızla giriş yapın</p>
        </div>
        <div>
          <label className="label" htmlFor="email">E-posta</label>
          <input id="email" name="email" type="email" required className="input" defaultValue="patron@ornek.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Şifre</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Giriş yapılıyor…" : "Giriş"}</button>
        <p className="text-xs text-slate-400">Deneme: patron@ornek.com, mudur1@ornek.com, kasa1@ornek.com — şifre 123456</p>
      </form>
    </main>
  );
}
