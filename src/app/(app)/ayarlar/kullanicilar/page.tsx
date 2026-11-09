import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/format";
import { ActionButton } from "@/components/ActionForm";
import { toggleUser } from "../actions";
import { Tabs } from "../Tabs";
import { UserForm } from "./UserForm";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ duzenle?: string }> }) {
  const s = await requireSession(["OWNER"]);
  const { duzenle } = await searchParams;
  const [users, branches] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: s.organizationId }, include: { branch: true }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] }),
    prisma.branch.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" } }),
  ]);
  const editing = users.find((u) => u.id === duzenle);
  const br = branches.map((b) => ({ id: b.id, name: b.name }));
  return (
    <div className="space-y-4">
      <h1 className="h1">Ayarlar</h1>
      <Tabs active="/ayarlar/kullanicilar" />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Şube</th><th>Durum</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                <td className="font-medium">{u.name}{u.id === s.userId && <span className="ml-1 text-xs text-emerald-700">(siz)</span>}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.branch?.name ?? "Tüm şubeler"}</td>
                <td>{u.active ? "Aktif" : "Pasif"}</td>
                <td className="whitespace-nowrap text-right">
                  <a href={`?duzenle=${u.id}#form`} className="mr-2 text-xs text-emerald-700 underline">Düzenle</a>
                  {u.id !== s.userId && (
                    <ActionButton action={toggleUser.bind(null, u.id)} label={u.active ? "Pasif yap" : "Aktif yap"} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="form" className="card">
        <h2 className="mb-3 font-semibold">{editing ? `Düzenle: ${editing.name}` : "Yeni kullanıcı"}</h2>
        <UserForm
          key={editing?.id ?? "new"}
          branches={br}
          user={editing ? { id: editing.id, name: editing.name, email: editing.email, role: editing.role, branchId: editing.branchId } : undefined}
        />
        {editing && <a href="/ayarlar/kullanicilar" className="mt-2 inline-block text-xs text-slate-500 underline">Yeni kullanıcı formuna dön</a>}
      </div>
    </div>
  );
}
