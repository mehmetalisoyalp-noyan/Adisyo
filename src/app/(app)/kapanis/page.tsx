import Link from "next/link";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { MEAL_CARD_COMMISSION, summarizeDays } from "@/lib/dailyRevenueImport";
import { day, money, pct, qty, UNIT_LABEL } from "@/lib/format";
import { periodReport } from "@/lib/services/period";
import { Stat } from "@/components/Stat";
import { ActionButton } from "@/components/ActionForm";
import { lockPeriod } from "./actions";
import { Tabs } from "./Tabs";

export default async function PeriodPage({ searchParams }: { searchParams: Promise<{ sube?: string; acilis?: string; kapanis?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const sp = await searchParams;
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { createdAt: "asc" } });
  const branch = branches.find((b) => b.id === sp.sube) ?? branches[0];
  const counts = branch
    ? await prisma.stockCount.findMany({ where: { branchId: branch.id }, orderBy: { countedAt: "desc" } })
    : [];
  // Varsayılan: en son iki sayım (kapanış = en yeni, açılış = ondan önceki)
  const closing = counts.find((c) => c.id === sp.kapanis) ?? counts[0];
  const opening = counts.find((c) => c.id === sp.acilis) ?? counts.find((c) => closing && c.countedAt < closing.countedAt);
  let report: Awaited<ReturnType<typeof periodReport>> | null = null;
  let error: string | null = null;
  if (opening && closing) {
    try {
      report = await periodReport(s.organizationId, opening.id, closing.id);
    } catch (e) {
      error = e instanceof Error ? e.message : "Rapor hesaplanamadı";
    }
  }
  const t = report?.totals;
  const ciro = report
    ? summarizeDays(
        (await prisma.dailyRevenue.findMany({
          where: { branchId: report.branch.id, date: { gt: report.opening.countedAt, lte: report.closing.countedAt } },
        })).map((d) => ({ total: num(d.total), payments: d.payments as Record<string, number> })),
      )
    : null;
  const unit = (u: keyof typeof UNIT_LABEL) => UNIT_LABEL[u];

  return (
    <div className="space-y-4">
      <h1 className="h1">Aylık Kapanış</h1>
      <Tabs active="/kapanis" />

      <form className="card flex flex-wrap items-end gap-3">
        <div><label className="label">Şube</label>
          <select name="sube" defaultValue={branch?.id} className="input">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label">Açılış sayımı (dönem başı)</label>
          <select name="acilis" defaultValue={opening?.id} className="input">{counts.map((c) => <option key={c.id} value={c.id}>{day(c.countedAt)}</option>)}</select></div>
        <div><label className="label">Kapanış sayımı (dönem sonu)</label>
          <select name="kapanis" defaultValue={closing?.id} className="input">{counts.map((c) => <option key={c.id} value={c.id}>{day(c.countedAt)}</option>)}</select></div>
        <button className="btn-secondary">Hesapla</button>
      </form>

      {counts.length < 2 && (
        <div className="card text-sm text-slate-600">
          Kapanış raporu için bu şubenin en az iki sayımı gerekir (ör. 31.12.2026 açılış ve 31.01.2027 kapanış).{" "}
          <Link href="/kapanis/sayim" className="text-emerald-700 underline">Sayım yükle</Link>
        </div>
      )}
      {error && <div className="card text-sm text-rose-700">{error}</div>}

      {report && t && (
        <>
          <p className="text-sm text-slate-600">
            <b>{report.branch.name}</b> ({report.branch.company.name}) · {day(report.opening.countedAt)} sayımından {day(report.closing.countedAt)} sayımına kadar.
            Satış verisi: {report.salesSources.adisyoOrders ? `Adisyo'dan ${report.salesSources.adisyoOrders} sipariş (otomatik)` : `${report.salesSources.imports} rapor satırı`}
            {report.salesSources.posItems ? ` + ${report.salesSources.posItems} kasa satırı` : ""}.
            {report.salesSources.importIgnored && " (Aynı dönem için yüklenen Excel raporu çift sayılmasın diye kullanılmadı.)"}
          </p>
          {report.salesSources.imports + report.salesSources.posItems + report.salesSources.adisyoOrders === 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Bu dönem için satış verisi yok; olması gereken tüketim 0 görünür. <Link href="/kapanis/satis" className="underline">Adisyo satış raporunu yükleyin.</Link>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Dönem başı stok" value={money(t.openValue)} />
            <Stat label="Dönem alışları (stok)" value={money(t.purchValue)} hint={t.nonStockPurch ? `+ stok dışı gider ${money(t.nonStockPurch)}` : undefined} />
            <Stat label="Dönem sonu stok" value={money(t.closeValue)} />
            <Stat label="Harcanan mal (gerçek)" value={money(t.cogs)} hint="Başı + alış − sonu" />
            <Stat label="Olması gereken (satış × reçete)" value={money(t.theoValue)} />
            <Stat label="Zayi / kayıp" value={money(t.wasteValue)} tone={t.wasteValue > 0 ? "bad" : "good"}
              hint={t.theoValue ? `olması gerekenin ${pct((t.wasteValue / t.theoValue) * 100)}` : undefined} />
            <Stat label="Net ciro (KDV hariç)" value={money(t.revenueNet)} hint={`KDV dahil ${money(t.revenueGross)}`} />
            <Stat label="Gıda maliyeti oranı" value={t.actualPct != null ? pct(t.actualPct) : "-"}
              hint={t.theoPct != null ? `reçeteye göre olması gereken ${pct(t.theoPct)}` : undefined} tone={t.actualPct != null && t.theoPct != null && t.actualPct > t.theoPct + 2 ? "bad" : undefined} />
          </div>

          {ciro && ciro.total > 0 && (
            <p className="text-sm text-slate-600">
              Günlük ciro raporuna göre dönem cirosu <b>{money(ciro.total)}</b>; yemek kartıyla ödenen {money(ciro.mealCard)},
              komisyonu (%{MEAL_CARD_COMMISSION * 100}) <b className="text-rose-700">{money(ciro.commission)}</b>.{" "}
              <Link href={`/kapanis/ciro`} className="text-emerald-700 underline">Ayrıntı</Link>
            </p>
          )}
          {report.missing.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <b>{report.missing.length} malzeme açılış veya kapanış sayımında yok</b>; gerçek tüketimleri bilinmediği için toplamlara katılmadı
              (olması gereken tüketimleri {money(t.missingTheoValue)}{t.missingPurchValue ? `, dönem alışları ${money(t.missingPurchValue)}` : ""}).
              Gıda maliyeti oranı bu yüzden eksik çıkar. Şubeden bu kalemlerin sayılmasını isteyin: {report.missing.join(", ")}
            </div>
          )}
          {(report.unmatched.length > 0 || report.noRecipe.length > 0) && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              {report.unmatched.length > 0 && <div><b>Menüyle eşleşmeyen satışlar</b> (tüketime katılmadı; <Link href="/kapanis/eslestirme" className="underline">ürün eşleştirme</Link>): {report.unmatched.map((u) => `${u.name} (${qty(u.qty)})`).join(", ")}</div>}
              {report.noRecipe.length > 0 && <div><b>{report.noRecipe.length} satılan ürünün reçetesi yok</b>; malzeme tüketimi hesaplanamadı.</div>}
            </div>
          )}

          <div className="card overflow-x-auto">
            <h2 className="mb-1 font-semibold">Malzeme bazında tüketim ve fark</h2>
            <p className="mb-2 text-xs text-slate-500">Fark = gerçek tüketim − olması gereken. Artı (kırmızı): fazla harcanmış (zayi, kayıp, fazla porsiyon). Eksi: sayım veya reçete hatası olabilir. Sıralama: TL farkı büyükten küçüğe.</p>
            <table className="table">
              <thead>
                <tr><th>Malzeme</th><th className="num">Dönem başı</th><th className="num">Alış</th><th className="num">Dönem sonu</th>
                  <th className="num">Gerçek tüketim</th><th className="num">Olması gereken</th><th className="num">Fark</th><th className="num">Fark %</th>
                  <th className="num">Ort. maliyet</th><th className="num">Fark (₺)</th></tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.stockItemId} className={r.incomplete ? "bg-slate-50 text-slate-400" : ""}>
                    <td className="font-medium">{r.name}{r.incomplete && <span className="ml-1 rounded bg-rose-100 px-1 text-xs text-rose-700">sayım eksik</span>}</td>
                    <td className="num">{qty(r.openQty)}</td>
                    <td className="num">{qty(r.purchQty)}</td>
                    <td className="num">{qty(r.closeQty)}</td>
                    <td className="num">{qty(r.actualQty)} <span className="text-xs text-slate-400">{unit(r.unit)}</span></td>
                    <td className="num">{qty(r.theoQty)}</td>
                    <td className={`num font-semibold ${r.diffQty > 0 ? "text-rose-600" : r.diffQty < 0 ? "text-sky-700" : ""}`}>{qty(r.diffQty)}</td>
                    <td className="num">{r.diffPct != null ? pct(r.diffPct) : "-"}</td>
                    <td className="num text-xs">{r.avgCost ? money(r.avgCost * (r.unit === "ADET" ? 1 : 1000)) + (r.unit === "ADET" ? "/ad" : r.unit === "ML" ? "/lt" : "/kg") : "-"}</td>
                    <td className={`num font-semibold ${r.diffValue > 0 ? "text-rose-600" : r.diffValue < 0 ? "text-sky-700" : ""}`}>{money(r.diffValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card space-y-2 text-sm">
            <h2 className="font-semibold">Dönemi kapat</h2>
            <p className="text-slate-600">
              Rakamları kontrol ettikten sonra dönemi kapatın: kapanış sayımındaki malzemeler bu dönemin ağırlıklı ortalama maliyetiyle sabitlenir ve
              bir sonraki ayın açılış maliyeti olur.
            </p>
            <ActionButton action={lockPeriod.bind(null, report.opening.id, report.closing.id)} label="Dönemi kapat (maliyetleri sabitle)"
              confirm="Kapanış sayımının maliyetleri sabitlensin mi?" className="btn-primary" />
          </div>
        </>
      )}
    </div>
  );
}
