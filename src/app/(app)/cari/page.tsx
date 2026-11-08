import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { createAccount } from "../actions";

export default async function AccountsPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const [accounts, sums] = await Promise.all([
    prisma.account.findMany({ where: { organizationId: s.organizationId }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.ledgerEntry.groupBy({ by: ["accountId"], where: { organizationId: s.organizationId }, _sum: { debit: true, credit: true } }),
  ]);
  const bal = new Map(sums.map((x) => [x.accountId, num(x._sum.debit) - num(x._sum.credit)]));
  const groups = [
    { type: "SUPPLIER", title: "Tedarikçiler" },
    { type: "CUSTOMER", title: "Müşteriler" },
  ] as const;
  return (
    <div className="space-y-4">
      <h1 className="h1">Cari Hesaplar</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.type} className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">{g.title}</h2>
            <table className="table">
              <thead><tr><th>Ünvan</th><th>Vergi no</th><th className="num">Bakiye</th></tr></thead>
              <tbody>
                {accounts.filter((a) => a.type === g.type).map((a) => {
                  const b = bal.get(a.id) ?? 0;
                  return (
                    <tr key={a.id}>
                      <td><Link className="text-emerald-700 hover:underline" href={`/cari/${a.id}`}>{a.name}</Link></td>
                      <td className="text-slate-500">{a.taxNumber ?? "-"}</td>
                      <td className={`num font-medium ${b < 0 ? "text-rose-600" : b > 0 ? "text-emerald-700" : ""}`}>
                        {money(Math.abs(b))} {b < 0 ? "(B)" : b > 0 ? "(A)" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">(A) alacaklıyız — karşı taraf bize borçlu · (B) borçluyuz</p>
          </div>
        ))}
      </div>
      <form action={createAccount} className="card grid gap-2 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Yeni cari</h2>
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
