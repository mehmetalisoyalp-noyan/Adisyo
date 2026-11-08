import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { summarize } from "@/lib/costing";
import { branchSummary, criticalStock, profitabilityReport } from "@/lib/services/reports";
import { dateInput, money, pct, qty, UNIT_LABEL } from "@/lib/format";
import { Stat } from "@/components/Stat";
import { DateFilter, parseRange } from "@/components/DateFilter";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const sp = await searchParams;
  const { from, to } = parseRange(sp);

  let rows = await branchSummary({ organizationId: s.organizationId, from, to });
  if (s.branchId) rows = rows.filter((r) => r.branch.id === s.branchId);
  const { rows: products } = await profitabilityReport({ organizationId: s.organizationId, branchId: s.branchId, from, to });
  const total = summarize(products);
  const critical = await criticalStock(s.organizationId, s.branchId);
  const balances = await prisma.ledgerEntry.groupBy({
    by: ["accountId"],
    where: { organizationId: s.organizationId },
    _sum: { debit: true, credit: true },
  });
  const receivable = balances.reduce((a, b) => a + Math.max(0, num(b._sum.debit) - num(b._sum.credit)), 0);
  const payable = balances.reduce((a, b) => a + Math.max(0, num(b._sum.credit) - num(b._sum.debit)), 0);

  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const weekAgo = new Date(Date.now() - 6 * 864e5);
  const lowMargin = [...products].sort((a, b) => a.marginPct - b.marginPct).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="h1">Patron Paneli</h1>
        <div className="flex flex-wrap items-end gap-2">
          <Link className="btn-secondary" href="/">Bugün</Link>
          <Link className="btn-secondary" href={`/?from=${dateInput(yesterday)}&to=${dateInput(yesterday)}`}>Dün</Link>
          <Link className="btn-secondary" href={`/?from=${dateInput(weekAgo)}&to=${dateInput(today)}`}>Son 7 gün</Link>
          <DateFilter from={from} to={to} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Ciro (KDV dahil)" value={money(total.grossRevenue)} />
        <Stat label="Net ciro (KDV hariç)" value={money(total.netRevenue)} />
        <Stat label="Satılan malın maliyeti" value={money(total.cost)} hint={`Maliyet oranı ${pct(total.costPct)}`} />
        <Stat label="Brüt kâr" value={money(total.profit)} tone={total.profit >= 0 ? "good" : "bad"} hint={`Marj ${pct(total.marginPct)}`} />
        <Stat label="Cari alacak" value={money(receivable)} hint="Müşteriler bize borçlu" />
        <Stat label="Cari borç" value={money(payable)} tone="bad" hint="Tedarikçilere borcumuz" />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Şubeler</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Şube</th><th className="num">Adisyon</th><th className="num">Ciro</th><th className="num">Maliyet</th>
              <th className="num">Brüt kâr</th><th className="num">Marj</th><th className="num">Nakit</th><th className="num">Kart</th>
              <th className="num">Cariye</th><th className="num">Açık masa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.branch.id}>
                <td className="font-medium">{r.branch.name}</td>
                <td className="num">{r.orderCount}</td>
                <td className="num">{money(r.summary.grossRevenue)}</td>
                <td className="num">{money(r.summary.cost)}</td>
                <td className="num font-semibold text-emerald-700">{money(r.summary.profit)}</td>
                <td className="num">{pct(r.summary.marginPct)}</td>
                <td className="num">{money(r.cash)}</td>
                <td className="num">{money(r.card)}</td>
                <td className="num">{money(r.account)}</td>
                <td className="num">{r.openCount} <span className="text-xs text-slate-400">({money(r.openTotal)})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">En çok kâr getiren ürünler</h2>
          <table className="table">
            <tbody>
              {products.slice(0, 5).map((p) => (
                <tr key={p.productId}>
                  <td>{p.name}</td><td className="num">{p.quantity} ad.</td>
                  <td className="num text-emerald-700">{money(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!products.length && <p className="text-sm text-slate-400">Bu aralıkta satış yok.</p>}
        </div>
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Marjı en düşük ürünler</h2>
          <table className="table">
            <tbody>
              {lowMargin.map((p) => (
                <tr key={p.productId}>
                  <td>{p.name}</td><td className="num">maliyet {pct(p.costPct)}</td>
                  <td className="num">{pct(p.marginPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Kritik stok</h2>
          <table className="table">
            <tbody>
              {critical.slice(0, 8).map((c) => (
                <tr key={c.id}>
                  <td>{c.stockItem.name}<div className="text-xs text-slate-400">{c.branch.name}</div></td>
                  <td className="num text-rose-600">{qty(c.quantity)} {UNIT_LABEL[c.stockItem.unit]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!critical.length && <p className="text-sm text-slate-400">Kritik seviyede stok yok.</p>}
        </div>
      </div>
    </div>
  );
}
