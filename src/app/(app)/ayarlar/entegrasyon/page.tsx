import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateInput, dt } from "@/lib/format";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { removeAdisyoConnection, saveAdisyoAccount, saveAdisyoConnection, testAdisyoConnection } from "../actions";
import { SyncButton } from "./SyncButton";
import { Tabs } from "../Tabs";

export default async function IntegrationPage() {
  const s = await requireSession(["OWNER"]);
  const [account, branches] = await Promise.all([
    prisma.adisyoAccount.findUnique({ where: { organizationId: s.organizationId } }),
    prisma.branch.findMany({
      where: { organizationId: s.organizationId },
      orderBy: { createdAt: "asc" },
      include: { adisyoConnection: true, _count: { select: { adisyoOrders: true } }, company: true },
    }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Ayarlar</h1>
      <Tabs active="/ayarlar/entegrasyon" />
      <div className="card space-y-2 text-sm text-slate-600">
        <h2 className="text-base font-semibold text-slate-800">Adisyo bağlantısı</h2>
        <p>
          Bağlantı kurulduğunda program her gece (04:00) her şubenin Adisyo'daki tamamlanmış siparişlerini kendisi çeker; aylık kapanışta satış raporu yüklemeniz gerekmez.
          Anahtarlar şifreli saklanır ve bir daha ekranda gösterilmez (yalnızca son 4 karakteri).
          Adisyo her 40 saniyede yalnızca bir istek (en çok 100 sipariş) kabul ettiği için ilk eşitleme sipariş sayısına göre birkaç dakika sürebilir;
          sayfa açık kaldığı sürece kendiliğinden devam eder, kapatırsanız sonra kaldığı yerden sürer.
        </p>
        <p>
          <b>x-api-key</b>: Adisyo'nun entegrasyon için verdiği anahtar · <b>x-api-secret</b>: her şubenin Adisyo uygulamasında
          <i> Restoran Ayarları → Entegrasyon</i> sekmesinde · <b>x-api-consumer</b>: entegrasyonu yapan şirketin adı (Türkçe karakterlerle, tam).
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Grup anahtarı</h2>
        <ActionForm action={saveAdisyoAccount} submit="Kaydet" className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">x-api-key {account && <span className="text-emerald-700">(kayıtlı)</span>}</label>
            <input name="apiKey" type="password" autoComplete="off" placeholder={account ? "Değiştirmek için yeni anahtarı yazın" : ""} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">x-api-consumer (şirket adı)</label>
            <input name="consumer" defaultValue={account?.consumer ?? ""} required className="input" />
          </div>
        </ActionForm>
      </div>

      {branches.map((b) => {
        const c = b.adisyoConnection;
        return (
          <div key={b.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{b.name} <span className="text-sm font-normal text-slate-500">({b.company.name})</span></h2>
              {c && (
                <span className={`text-xs ${c.lastError ? "text-rose-600" : "text-slate-500"}`}>
                  Son eşitleme: {c.lastSyncAt ? dt(c.lastSyncAt) : "henüz yok"} {c.lastError ? `— HATA: ${c.lastError}` : c.lastStatus ? `— ${c.lastStatus}` : ""}
                  {" · "}alınmış sipariş: {b._count.adisyoOrders}
                </span>
              )}
            </div>
            <ActionForm action={saveAdisyoConnection.bind(null, b.id)} submit={c ? "Güncelle" : "Bağla"} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <label className="label">x-api-secret {c && <span className="text-emerald-700">(kayıtlı: {c.secretHint})</span>}</label>
                <input name="secret" type="password" autoComplete="off" placeholder={c ? "Değiştirmek için yeni anahtarı yazın" : ""} className="input" />
              </div>
              <div>
                <label className="label">Bu tarihten itibaren çek</label>
                <input name="startFrom" type="date" defaultValue={dateInput(c?.startFrom ?? new Date("2027-01-01T00:00:00+03:00"))} className="input" />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Otomatik eşitleme açık</label>
            </ActionForm>
            {c && (
              <div className="flex flex-wrap gap-3">
                <ActionButton action={testAdisyoConnection.bind(null, b.id)} label="Bağlantıyı test et" className="btn-secondary" />
                <SyncButton branchId={b.id} />
                <ActionButton action={removeAdisyoConnection.bind(null, b.id)} label="Bağlantıyı kaldır" confirm="Bağlantı kaldırılsın mı?" className="text-sm text-rose-600 underline" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
