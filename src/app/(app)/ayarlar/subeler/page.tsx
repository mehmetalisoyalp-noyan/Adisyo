import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { removeBranch, saveBranch, setTables } from "../actions";
import { Tabs } from "../Tabs";

export default async function BranchesPage() {
  const s = await requireSession(["OWNER"]);
  const branches = await prisma.branch.findMany({
    where: { organizationId: s.organizationId },
    orderBy: { createdAt: "asc" }, // ekleniş sırası: yeniden adlandırınca yer değiştirmez
    include: { tables: { select: { area: true } }, _count: { select: { orders: true, purchases: true } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">Ayarlar</h1>
      <Tabs active="/ayarlar/subeler" />
      {branches.map((b) => {
        const areas = Object.entries(
          b.tables.reduce<Record<string, number>>((a, t) => ({ ...a, [t.area]: (a[t.area] ?? 0) + 1 }), {}),
        );
        return (
          <div key={b.id} className="card space-y-4">
            <ActionForm action={saveBranch} submit="Şubeyi kaydet" className="grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="id" value={b.id} />
              <div className="sm:col-span-2">
                <label className="label">Şube adı</label>
                <input name="name" defaultValue={b.name} required className="input" />
              </div>
              <div className="sm:col-span-3">
                <label className="label">Adres</label>
                <input name="address" defaultValue={b.address ?? ""} className="input" />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" name="hasDelivery" defaultChecked={b.hasDelivery} /> Paket servis
              </label>
            </ActionForm>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Masalar ({b.tables.length})</h3>
              <div className="flex flex-wrap gap-3">
                {areas.map(([area, count]) => (
                  <ActionForm key={area} action={setTables.bind(null, b.id)} submit="Uygula" className="flex items-end gap-2 rounded-lg border border-slate-200 p-2">
                    <input type="hidden" name="area" value={area} />
                    <div>
                      <label className="label">{area}</label>
                      <input name="count" type="number" min={0} max={300} defaultValue={count} className="input w-24" />
                    </div>
                  </ActionForm>
                ))}
                <ActionForm action={setTables.bind(null, b.id)} submit="Bölüm ekle" className="flex items-end gap-2 rounded-lg border border-dashed border-slate-300 p-2">
                  <div>
                    <label className="label">Yeni bölüm (Bahçe, Teras…)</label>
                    <input name="area" required className="input w-40" />
                  </div>
                  <div>
                    <label className="label">Masa</label>
                    <input name="count" type="number" min={1} max={300} defaultValue={10} className="input w-20" />
                  </div>
                </ActionForm>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Bir bölümü kaldırmak için masa sayısını 0 yapın. Masalar "Bölüm 1, Bölüm 2…" diye adlandırılır.
              </p>
            </div>

            <div className="border-t pt-3 text-xs text-slate-500">
              {b._count.orders} adisyon, {b._count.purchases} alış kaydı.{" "}
              {b._count.orders + b._count.purchases === 0 && (
                <ActionButton action={removeBranch.bind(null, b.id)} label="Şubeyi sil" confirm={`${b.name} silinsin mi?`} className="text-xs text-rose-600 underline" />
              )}
            </div>
          </div>
        );
      })}

      <div className="card">
        <h2 className="mb-3 font-semibold">Yeni şube</h2>
        <ActionForm action={saveBranch} submit="Şube ekle" className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2"><label className="label">Şube adı</label><input name="name" required className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Adres</label><input name="address" className="input" /></div>
          <div><label className="label">Salon masa sayısı</label><input name="tables" type="number" min={0} defaultValue={10} className="input" /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="hasDelivery" /> Paket servis</label>
        </ActionForm>
      </div>
    </div>
  );
}
