import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { visibleCompanies } from "@/lib/scope";
import { createAccount } from "../actions";

/** Bakiye gösterimi: (A) alacaklıyız, (B) borçluyuz */
function Bal({ v }: { v: number }) {
  if (Math.abs(v) < 0.005) return <span className="text-slate-300">—</span>;
  return (
    <span className={v < 0 ? "text-rose-600" : "text-emerald-700"}>
      {money(Math.abs(v))} {v < 0 ? "(B)" : "(A)"}
    </span>
  );
}

export default async function AccountsPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const companies = await visibleCompanies(s);
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ where: { organizationId: s.organizationId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.ledgerEntry.groupBy({
      by: ["accountId", "companyId"],
      where: { organizationId: s.organizationId, companyId: { in: companies.map((c) => c.id) } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const bal = new Map(sums.map((x) => [`${x.accountId}|${x.companyId}`, num(x._sum.debit) - num(x._sum.credit)]));
  const of = (accountId: string, companyId: string) => bal.get(`${accountId}|${companyId}`) ?? 0;
  const multi = companies.length > 1;
  const groups = [
    { type: "SUPPLIER", title: "Tedarikçiler" },
    { type: "CUSTOMER", title: "Müşteriler" },
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="h1">Cari Hesaplar</h1>
      {groups.map((g) => {
        const list = accounts.filter((a) => a.type === g.type);
        const colTotal = (cid: string) => list.reduce((t, a) => t + of(a.id, cid), 0);
        return (
          <div key={g.type} className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">{g.title}</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Ünvan</th>
                  <th>Vergi no</th>
                  {companies.map((c) => <th key={c.id} className="num">{c.name}</th>)}
                  {multi && <th className="num">Grup toplamı</th>}
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td><Link className="text-emerald-700 hover:underline" href={`/cari/${a.id}`}>{a.name}</Link></td>
                    <td className="text-slate-500">{a.taxNumber ?? "-"}</td>
                    {companies.map((c) => <td key={c.id} className="num"><Bal v={of(a.id, c.id)} /></td>)}
                    {multi && <td className="num font-medium"><Bal v={companies.reduce((t, c) => t + of(a.id, c.id), 0)} /></td>}
                  </tr>
                ))}
                {list.length > 0 && (
                  <tr className="font-semibold">
                    <td colSpan={2}>Toplam</td>
                    {companies.map((c) => <td key={c.id} className="num"><Bal v={colTotal(c.id)} /></td>)}
                    {multi && <td className="num"><Bal v={companies.reduce((t, c) => t + colTotal(c.id), 0)} /></td>}
                  </tr>
                )}
              </tbody>
            </table>
            {!list.length && <p className="text-sm text-slate-400">Kayıt yok.</p>}
          </div>
        );
      })}
      <p className="text-xs text-slate-400">(A) alacaklıyız: karşı taraf bize borçlu · (B) borçluyuz · Bakiyeler her şirket için ayrı tutulur.</p>

      <form action={createAccount} className="card grid gap-2 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Yeni cari kartı (tüm şirketlerde ortak)</h2>
        <div><label className="label">Tür</label><select name="type" className="input"><option value="SUPPLIER">Tedarikçi</option><option value="CUSTOMER">Müşteri</option></select></div>
        <div className="sm:col-span-3"><label className="label">Ünvan</label><input name="name" required className="input" /></div>
        <div><label className="label">Vergi / TC no</label><input name="taxNumber" className="input" /></div>
        <div><label className="label">Vergi dairesi</label><input name="taxOffice" className="input" /></div>
        <div><label className="label">Telefon</label><input name="phone" className="input" /></div>
        <div><label className="label">E-posta</label><input name="email" type="email" className="input" /></div>
        <div className="sm:col-span-4"><label className="label">Adres</label><input name="address" className="input" /></div>
        <div><button className="btn-primary">Kaydet</button></div>
      </form>
    </div>
  );
}
