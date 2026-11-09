"use client";
import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { saveUser } from "../actions";

type U = { id: string; name: string; email: string; role: "OWNER" | "MANAGER" | "CASHIER"; branchId: string | null };

export function UserForm({ user, branches }: { user?: U; branches: { id: string; name: string }[] }) {
  const [role, setRole] = useState<U["role"]>(user?.role ?? "MANAGER");
  return (
    <ActionForm action={saveUser} submit={user ? "Güncelle" : "Kullanıcı ekle"} className="grid gap-3 sm:grid-cols-6">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="sm:col-span-2"><label className="label">Ad soyad</label><input name="name" defaultValue={user?.name} required className="input" /></div>
      <div className="sm:col-span-2"><label className="label">E-posta (giriş adı)</label><input name="email" type="email" defaultValue={user?.email} required className="input" /></div>
      <div>
        <label className="label">Rol</label>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value as U["role"])} className="input">
          <option value="OWNER">Patron</option>
          <option value="MANAGER">Müdür</option>
          <option value="CASHIER">Kasiyer</option>
        </select>
      </div>
      <div>
        <label className="label">Şube</label>
        <select name="branchId" defaultValue={user?.branchId ?? ""} disabled={role === "OWNER"} className="input">
          {role !== "CASHIER" && <option value="">Tüm şubeler</option>}
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">{user ? "Yeni şifre (değiştirmeyecekseniz boş bırakın)" : "Şifre (en az 8 karakter)"}</label>
        <input name="password" type="password" autoComplete="new-password" required={!user} minLength={8} className="input" />
      </div>
      <div className="sm:col-span-4 self-end text-xs text-slate-500">
        Patron: tüm şubeler ve ayarlar · Müdür: seçilen şube (veya tümü), raporlar, menü, stok, alış, cari · Kasiyer: yalnızca satış ekranı
      </div>
    </ActionForm>
  );
}
