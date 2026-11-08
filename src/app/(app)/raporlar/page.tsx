import { branchScope, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { profitabilityReport } from "@/lib/services/reports";
import { money, pct } from "@/lib/format";
import { Stat } from "@/components/Stat";
import { DateFilter, parseRange } from "@/components/DateFilter";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; branch?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const sp = await searchParams;
  const { from, to } = parseRange(sp, 7);
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { name: "asc" } });
  const branchId = s.branchId ?? (branches.some((b) => b.id === sp.branch) ? sp.branch! : null);
  const { rows, summary } = await profitabilityReport({ organizationId: s.organizationId, branchId, from, to });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Maliyet & Kârlılık Analizi</h1>
          <p className="text-sm text-slate-500">Her satış kapanırken reçete maliyeti o günkü ortalama alış fiyatıyla sabitlenir.</p>
        </div>
        <DateFilter from={from} to={to} branches={branches} branchId={branchId} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Satılan adet" value={String(summary.quantity)} />
        <Stat label="Net ciro (KDV hariç)" value={money(summary.netRevenue)} hint={`KDV dahil ${money(summary.grossRevenue)}`} />
        <Stat label="Maliyet" value={money(summary.cost)} />
        <Stat label="Maliyet oranı" value={pct(summary.costPct)} tone={summary.costPct > 35 ? "bad" : "good"} />
        <Stat label="Brüt kâr" value={money(summary.profit)} tone="good" hint={`Marj ${pct(summary.marginPct)}`} />
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Ürün</th><th className="num">Adet</th><th className="num">Net ciro</th><th className="num">Maliyet</th><th className="num">Birim maliyet</th><th className="num">Brüt kâr</th><th className="num">Maliyet %</th><th className="num">Marj %</th><th className="num">Kâr payı</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId}>
                <td className="font-medium">{r.name}</td>
                <td className="num">{r.quantity}</td>
                <td className="num">{money(r.netRevenue)}</td>
                <td className="num">{money(r.cost)}</td>
                <td className="num">{money(r.cost / r.quantity)}</td>
                <td className="num font-semibold text-emerald-700">{money(r.profit)}</td>
                <td className={`num ${r.costPct > 35 ? "text-rose-600" : ""}`}>{pct(r.costPct)}</td>
                <td className="num">{pct(r.marginPct)}</td>
                <td className="num">
                  <div className="ml-auto h-2 w-24 rounded bg-slate-100">
                    <div className="h-2 rounded bg-emerald-500" style={{ width: `${summary.profit ? Math.max(0, (r.profit / summary.profit) * 100) : 0}%` }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-slate-400">Bu aralıkta kapanmış satış yok.</p>}
      </div>
    </div>
  );
}
