import Link from "next/link";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { ActionButton } from "@/components/ActionForm";
import { isMealCard, MEAL_CARD_COMMISSION, summarizeDays } from "@/lib/dailyRevenueImport";
import { deleteDailyRevenueMonth } from "../actions";
import { Tabs } from "../Tabs";
import { CiroUploader } from "./CiroUploader";

const ymTR = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 7);
const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00+03:00`).toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
const pct = (a: number, b: number) => (b ? `%${((a / b) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}` : "-");

export default async function CiroPage({ searchParams }: { searchParams: Promise<{ sube?: string; ay?: string }> }) {
  const sp = await searchParams;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { createdAt: "asc" } });
  const rows = await prisma.dailyRevenue.findMany({
    where: { organizationId: s.organizationId, branchId: { in: branches.map((b) => b.id) } },
    orderBy: { date: "asc" },
  });
  const days = rows.map((r) => ({ branchId: r.branchId, date: r.date, ym: ymTR(r.date), total: num(r.total), payments: r.payments as Record<string, number> }));

  // Şube × ay özeti
  const groups = new Map<string, typeof days>();
  for (const d of days) {
    const k = `${d.branchId}|${d.ym}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const months = [...groups.entries()]
    .map(([k, ds]) => {
      const [branchId, ym] = k.split("|");
      const sum = summarizeDays(ds);
      const card = Object.entries(sum.byMethod).filter(([m]) => !isMealCard(m) && /kart/i.test(m)).reduce((t, [, v]) => t + v, 0);
      const cash = Object.entries(sum.byMethod).filter(([m]) => /nakit/i.test(m)).reduce((t, [, v]) => t + v, 0);
      return { branchId, ym, days: ds.length, ...sum, card, cash, other: sum.total - card - cash - sum.mealCard };
    })
    .sort((a, b) => b.ym.localeCompare(a.ym));
  const bName = (id: string) => branches.find((b) => b.id === id)?.name ?? "";

  const sel = sp.sube && sp.ay ? months.find((m) => m.branchId === sp.sube && m.ym === sp.ay) : undefined;
  const selDays = sel ? groups.get(`${sel.branchId}|${sel.ym}`) ?? [] : [];
  const maxDay = Math.max(1, ...selDays.map((d) => d.total));
  const rate = `%${MEAL_CARD_COMMISSION * 100}`;

  return (
    <div className="space-y-4">
      <h1 className="h1">Aylık Kapanış</h1>
      <Tabs active="/kapanis/ciro" />
      <CiroUploader branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultBranchId={branches[0]?.id ?? ""} />

      <div className="card overflow-x-auto">
        <h2 className="mb-1 font-semibold">Aylık ciro ve ödeme türleri</h2>
        <p className="mb-2 text-xs text-slate-500">Yemek kartı komisyonu {rate} olarak hesaplanır (Multinet, SetCard, Sodexo/Pluxee, Metropol, Token Flex, Edenred). Ayrıntı için satıra tıklayın.</p>
        <table className="table">
          <thead><tr><th>Ay</th><th>Şube</th><th className="num">Gün</th><th className="num">Ciro</th><th className="num">Kredi kartı</th><th className="num">Nakit</th><th className="num">Yemek kartı</th><th className="num">Komisyon ({rate})</th><th className="num">Komisyon sonrası</th><th></th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.branchId + m.ym} className={sel === m ? "bg-emerald-50" : ""}>
                <td><Link className="text-emerald-700 underline" href={`/kapanis/ciro?sube=${m.branchId}&ay=${m.ym}`}>{monthName(m.ym)}</Link></td>
                <td>{bName(m.branchId)}</td>
                <td className="num">{m.days}</td>
                <td className="num font-semibold">{money(m.total)}</td>
                <td className="num">{money(m.card)}</td>
                <td className="num">{money(m.cash)}</td>
                <td className="num">{money(m.mealCard)} <span className="text-xs text-slate-400">{pct(m.mealCard, m.total)}</span></td>
                <td className="num text-rose-700">{money(m.commission)}</td>
                <td className="num">{money(m.net)}</td>
                <td className="text-right"><ActionButton action={deleteDailyRevenueMonth.bind(null, m.branchId, m.ym)} label="Sil" confirm="Bu ayın günlük ciro kayıtları silinsin mi?" className="text-xs text-rose-600 underline" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!months.length && <p className="text-sm text-slate-400">Henüz günlük ciro raporu yüklenmedi.</p>}
      </div>

      {sel && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">{bName(sel.branchId)} · {monthName(sel.ym)} · ödeme türleri</h2>
            <table className="table">
              <thead><tr><th>Ödeme türü</th><th className="num">Tutar</th><th className="num">Pay</th><th className="num">Komisyon</th></tr></thead>
              <tbody>
                {Object.entries(sel.byMethod).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}{isMealCard(k) && <span className="ml-1 text-xs text-amber-700">yemek kartı</span>}</td>
                    <td className="num">{money(v)}</td>
                    <td className="num">{pct(v, sel.total)}</td>
                    <td className="num">{isMealCard(k) ? money(v * MEAL_CARD_COMMISSION) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">Günlük ciro</h2>
            <table className="table">
              <tbody>
                {selDays.map((d) => (
                  <tr key={d.date.toISOString()}>
                    <td className="whitespace-nowrap">{d.date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", weekday: "short", timeZone: "Europe/Istanbul" })}</td>
                    <td className="w-full"><div className="h-3 rounded bg-emerald-500" style={{ width: `${(d.total / maxDay) * 100}%` }} /></td>
                    <td className="num whitespace-nowrap">{money(d.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
