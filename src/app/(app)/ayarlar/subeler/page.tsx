import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSampleTaxNumber } from "@/lib/services/setup";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { createCompanyWithBranch, removeBranch, removeCompany, saveBranch, saveCompany, setTables } from "../actions";
import { Tabs } from "../Tabs";

export default async function CompaniesPage() {
  const s = await requireSession(["OWNER"]);
  const companies = await prisma.company.findMany({
    where: { organizationId: s.organizationId },
    orderBy: { createdAt: "asc" },
    include: {
      branches: {
        orderBy: { createdAt: "asc" }, // ekleniş sırası: yeniden adlandırınca yer değiştirmez
        include: { tables: { select: { area: true } }, _count: { select: { orders: true, purchases: true } } },
      },
      _count: { select: { ledger: true } },
    },
  });
  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-4">
      <h1 className="h1">Ayarlar</h1>
      <Tabs active="/ayarlar/subeler" />
      <p className="text-sm text-slate-600">
        Her şirket ayrı bir tüzel kişidir (kendi ünvanı ve vergi numarası). Alışlar, cari bakiyeler ve e-faturalar şirket bazında ayrı tutulur;
        menü, stok kalemi tanımları ve tedarikçi kartları grup içinde ortaktır.
      </p>

      {companies.map((c) => (
        <div key={c.id} className="card space-y-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{c.name}</h2>
            {isSampleTaxNumber(c.taxNumber) && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">vergi numarası girilmemiş / örnek</span>}
          </div>
          <ActionForm action={saveCompany} submit="Şirketi kaydet" className="grid gap-3 sm:grid-cols-6">
            <input type="hidden" name="id" value={c.id} />
            <div className="sm:col-span-3"><label className="label">Ticari ünvan</label><input name="name" defaultValue={c.name} required className="input" /></div>
            <div><label className="label">VKN / TCKN</label><input name="taxNumber" inputMode="numeric" defaultValue={isSampleTaxNumber(c.taxNumber) ? "" : (c.taxNumber ?? "")} className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Vergi dairesi</label><input name="taxOffice" defaultValue={c.taxOffice ?? ""} className="input" /></div>
            <div className="sm:col-span-6"><label className="label">Fatura adresi</label><input name="address" defaultValue={c.address ?? ""} className="input" /></div>
          </ActionForm>

          {c.branches.map((b) => {
            const areas = Object.entries(b.tables.reduce<Record<string, number>>((a, t) => ({ ...a, [t.area]: (a[t.area] ?? 0) + 1 }), {}));
            return (
              <div key={b.id} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <ActionForm action={saveBranch} submit="Şubeyi kaydet" className="grid gap-3 sm:grid-cols-6">
                  <input type="hidden" name="id" value={b.id} />
                  <div className="sm:col-span-2"><label className="label">Şube adı</label><input name="name" defaultValue={b.name} required className="input" /></div>
                  <div className="sm:col-span-2"><label className="label">Adres</label><input name="address" defaultValue={b.address ?? ""} className="input" /></div>
                  <div>
                    <label className="label">Şirket</label>
                    <select name="companyId" defaultValue={c.id} className="input">
                      {companyOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="hasDelivery" defaultChecked={b.hasDelivery} /> Paket servis</label>
                </ActionForm>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Masalar ({b.tables.length})</h3>
                  <div className="flex flex-wrap gap-3">
                    {areas.map(([area, count]) => (
                      <ActionForm key={area} action={setTables.bind(null, b.id)} submit="Uygula" className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2">
                        <input type="hidden" name="area" value={area} />
                        <div><label className="label">{area}</label><input name="count" type="number" min={0} max={300} defaultValue={count} className="input w-24" /></div>
                      </ActionForm>
                    ))}
                    <ActionForm action={setTables.bind(null, b.id)} submit="Bölüm ekle" className="flex items-end gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-2">
                      <div><label className="label">Yeni bölüm (Bahçe, Teras…)</label><input name="area" required className="input w-40" /></div>
                      <div><label className="label">Masa</label><input name="count" type="number" min={1} max={300} defaultValue={10} className="input w-20" /></div>
                    </ActionForm>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Bir bölümü kaldırmak için masa sayısını 0 yapın.</p>
                </div>
                <div className="text-xs text-slate-500">
                  {b._count.orders} adisyon, {b._count.purchases} alış kaydı.{" "}
                  {b._count.orders + b._count.purchases === 0 && (
                    <ActionButton action={removeBranch.bind(null, b.id)} label="Şubeyi sil" confirm={`${b.name} silinsin mi?`} className="text-xs text-rose-600 underline" />
                  )}
                </div>
              </div>
            );
          })}

          <details className="text-sm">
            <summary className="cursor-pointer text-emerald-700">+ Bu şirkete şube ekle</summary>
            <ActionForm action={saveBranch} submit="Şube ekle" className="mt-2 grid gap-3 sm:grid-cols-6">
              <input type="hidden" name="companyId" value={c.id} />
              <div className="sm:col-span-2"><label className="label">Şube adı</label><input name="name" required className="input" /></div>
              <div className="sm:col-span-2"><label className="label">Adres</label><input name="address" className="input" /></div>
              <div><label className="label">Salon masa sayısı</label><input name="tables" type="number" min={0} defaultValue={10} className="input" /></div>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="hasDelivery" /> Paket servis</label>
            </ActionForm>
          </details>
          {c.branches.length === 0 && c._count.ledger === 0 && (
            <ActionButton action={removeCompany.bind(null, c.id)} label="Şirketi sil" confirm={`${c.name} silinsin mi?`} className="text-xs text-rose-600 underline" />
          )}
        </div>
      ))}

      <div className="card">
        <h2 className="mb-3 font-semibold">Yeni şirket ve şubesi</h2>
        <ActionForm action={createCompanyWithBranch} submit="Şirketi ve şubeyi ekle" className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-3"><label className="label">Ticari ünvan</label><input name="name" required className="input" /></div>
          <div><label className="label">VKN / TCKN</label><input name="taxNumber" inputMode="numeric" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Vergi dairesi</label><input name="taxOffice" className="input" /></div>
          <div className="sm:col-span-6"><label className="label">Fatura adresi</label><input name="address" className="input" /></div>
          <div className="sm:col-span-3"><label className="label">Şube (kafe) adı</label><input name="branchName" placeholder="Boş bırakılırsa ünvan kullanılır" className="input" /></div>
          <div><label className="label">Salon masa sayısı</label><input name="tables" type="number" min={0} defaultValue={10} className="input" /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="hasDelivery" /> Paket servis</label>
        </ActionForm>
      </div>
    </div>
  );
}
