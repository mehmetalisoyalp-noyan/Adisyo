import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isSampleTaxNumber, SAMPLE_EMAIL_DOMAIN } from "@/lib/services/setup";
import { ActionButton, ActionForm } from "@/components/ActionForm";
import { deactivateSampleUsers, resetSampleData, saveGroup } from "./actions";
import { Tabs } from "./Tabs";

export default async function SettingsPage() {
  const s = await requireSession(["OWNER"]);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: s.organizationId } });
  const [branchCount, ownOwner, sampleUsersActive, orderCount, purchaseCount, productCount, stockCount, accountCount, me] =
    await Promise.all([
      prisma.branch.count({ where: { organizationId: org.id } }),
      prisma.user.count({ where: { organizationId: org.id, role: "OWNER", active: true, NOT: { email: { endsWith: SAMPLE_EMAIL_DOMAIN } } } }),
      prisma.user.count({ where: { organizationId: org.id, active: true, email: { endsWith: SAMPLE_EMAIL_DOMAIN } } }),
      prisma.order.count({ where: { organizationId: org.id } }),
      prisma.purchaseInvoice.count({ where: { organizationId: org.id } }),
      prisma.product.count({ where: { organizationId: org.id } }),
      prisma.stockItem.count({ where: { organizationId: org.id } }),
      prisma.account.count({ where: { organizationId: org.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: s.userId } }),
    ]);
  const companies = await prisma.company.findMany({ where: { organizationId: org.id } });
  const companyDone = companies.length > 0 && companies.every((c) => !isSampleTaxNumber(c.taxNumber));
  const steps = [
    { done: companyDone, text: "Şirketlerinizin ünvanlarını ve vergi numaralarını girin (her kafe ayrı şirket)", href: "/ayarlar/subeler" },
    { done: ownOwner > 0, text: "Kendi e-postanızla bir Patron kullanıcısı oluşturun ve onunla giriş yapın", href: "/ayarlar/kullanicilar" },
    { done: branchCount > 0, text: "Şube (kafe) adlarını ve masa sayılarını düzenleyin", href: "/ayarlar/subeler" },
    { done: orderCount === 0 && purchaseCount === 0, text: "Örnek satış ve alışları temizleyin", href: "#temizle" },
    { done: sampleUsersActive === 0, text: "Örnek kullanıcıları (…@ornek.com) pasif yapın", href: "#ornek-kullanici" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="h1">Ayarlar</h1>
      <Tabs active="/ayarlar" />

      <div className="card">
        <h2 className="mb-2 font-semibold">Gerçek kullanıma geçiş adımları</h2>
        <ol className="space-y-1 text-sm">
          {steps.map((st, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${st.done ? "bg-emerald-600 text-white" : "border border-slate-300 text-slate-500"}`}>
                {st.done ? "✓" : i + 1}
              </span>
              <Link href={st.href} className={st.done ? "text-slate-400 line-through" : "text-emerald-700 hover:underline"}>{st.text}</Link>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Sonra: Menü & Reçete, Stok ve Cari Hesaplar sayfalarından kendi ürünlerinizi, hammaddelerinizi ve tedarikçilerinizi girin
          ya da gelen e-fatura XML'lerini yükleyin (tedarikçiler otomatik açılır).
        </p>
      </div>

      <div id="grup" className="card">
        <h2 className="mb-3 font-semibold">Grup adı</h2>
        <ActionForm action={saveGroup} submit="Kaydet" className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="label">Şirketlerinizi bir arada gösteren ad (örn. NATO Grubu)</label>
            <input name="name" defaultValue={org.name} required className="input" />
          </div>
        </ActionForm>
        <p className="mt-2 text-xs text-slate-500">
          Şirketlerin ünvan ve vergi numaraları <a href="/ayarlar/subeler" className="underline">Şirketler &amp; şubeler</a> sekmesindedir.
        </p>
      </div>

      <div id="temizle" className="card space-y-3 border-rose-200">
        <div>
          <h2 className="font-semibold text-rose-700">Örnek veriyi temizle</h2>
          <p className="text-sm text-slate-600">
            Şu an: {orderCount} adisyon, {purchaseCount} alış faturası, {productCount} ürün, {stockCount} stok kalemi, {accountCount} cari.
          </p>
          <p className="text-sm text-slate-600">
            <b>Her zaman silinir:</b> satışlar, ödemeler, alış faturaları, stok miktarları ve hareketleri, cari hareketleri, e-belgeler.
            <br />
            <b>Korunur:</b> şirket bilgileri, şubeler, masalar, kullanıcılar.
          </p>
        </div>
        <ActionForm
          action={resetSampleData}
          submit="Seçilenleri kalıcı olarak sil"
          danger
          confirm="Bu işlem geri alınamaz. Devam edilsin mi?"
          className="space-y-3"
        >
          <div className="space-y-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="menu" defaultChecked /> Menü, kategoriler ve reçeteleri de sil</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="stockItems" defaultChecked /> Stok kalemlerini (hammadde tanımları) de sil</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="accounts" defaultChecked /> Cari kartlarını (tedarikçi ve müşteriler) de sil</label>
            <p className="text-xs text-slate-500">
              Örnek menüyü şablon olarak kullanmak isterseniz ilk iki kutunun işaretini kaldırın. Ürünler ve reçeteler kalır, örnek alış maliyetleri sıfırlanır.
            </p>
          </div>
          <div className="max-w-xs">
            <label className="label">Onaylamak için SİL yazın</label>
            <input name="confirm" autoComplete="off" className="input" />
          </div>
        </ActionForm>
      </div>

      <div id="ornek-kullanici" className="card space-y-2">
        <h2 className="font-semibold">Örnek kullanıcılar</h2>
        <p className="text-sm text-slate-600">
          {sampleUsersActive} aktif örnek kullanıcı (…@ornek.com) var. Bunlar herkesin bildiği bir şifreyle giriş yapabilir;
          gerçek kullanımdan önce pasif yapın.
          {me.email.endsWith(SAMPLE_EMAIL_DOMAIN) && (
            <b className="text-amber-700"> Şu an örnek hesapla girdiniz: önce Kullanıcılar sekmesinden kendi patron hesabınızı açıp onunla giriş yapın.</b>
          )}
        </p>
        {sampleUsersActive > 0 && (
          <ActionButton action={deactivateSampleUsers} label="Örnek kullanıcıları pasif yap" className="btn-secondary" confirm="Tüm …@ornek.com kullanıcıları pasif yapılsın mı?" />
        )}
      </div>
    </div>
  );
}
