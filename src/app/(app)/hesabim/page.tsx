import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { changeOwnPassword } from "../ayarlar/actions";

export default async function AccountPage() {
  const s = await requireSession();
  const u = await prisma.user.findUniqueOrThrow({ where: { id: s.userId }, include: { branch: true } });
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="h1">Hesabım</h1>
      <div className="card text-sm">
        <div><b>{u.name}</b> · {ROLE_LABEL[u.role]} · {u.branch?.name ?? "Tüm şubeler"}</div>
        <div className="text-slate-500">{u.email}</div>
      </div>
      <div className="card">
        <h2 className="mb-3 font-semibold">Şifre değiştir</h2>
        <ActionForm action={changeOwnPassword} submit="Şifreyi değiştir" className="space-y-3">
          <div><label className="label">Mevcut şifre</label><input name="current" type="password" required className="input" autoComplete="current-password" /></div>
          <div><label className="label">Yeni şifre (en az 8 karakter)</label><input name="next" type="password" required minLength={8} className="input" autoComplete="new-password" /></div>
          <div><label className="label">Yeni şifre (tekrar)</label><input name="repeat" type="password" required minLength={8} className="input" autoComplete="new-password" /></div>
        </ActionForm>
      </div>
    </div>
  );
}
