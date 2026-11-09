import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { dateInput, day, money } from "@/lib/format";
import { visibleCompanies } from "@/lib/scope";
import { addAccountPayment } from "../../actions";

const SOURCE = { OPENING: "Açılış", PURCHASE: "Alış", SALE: "Satış", PAYMENT: "Ödeme/Tahsilat" } as const;

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sirket?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const acc = await prisma.account.findFirst({ where: { id, organizationId: s.organizationId } });
  if (!acc) notFound();
  const companies = await visibleCompanies(s);
  const sums = await prisma.ledgerEntry.groupBy({
    by: ["companyId"],
    where: { accountId: acc.id, companyId: { in: companies.map((c) => c.id) } },
    _sum: { debit: true, credit: true },
    _count: true,
  });
  const balOf = (cid: string) => {
    const x = sums.find((y) => y.companyId === cid);
    return x ? num(x._sum.debit) - num(x._sum.credit) : 0;
  };
  // Seçili şirket: parametre, yoksa hareketi olan ilk şirket
  const company =
    companies.find((c) => c.id === sp.sirket) ??
    companies.find((c) => sums.some((x) => x.companyId === c.id)) ??
    companies[0];
  const entries = company
    ? await prisma.ledgerEntry.findMany({
        where: { accountId: acc.id, companyId: company.id },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        include: { branch: true },
      })
    : [];
  let running = 0;
  const rows = entries.map((e) => {
    running += num(e.debit) - num(e.credit);
    return { ...e, running };
  });
  const isSupplier = acc.type === "SUPPLIER";
  const total = companies.reduce((t, c) => t + balOf(c.id), 0);
  const label = (v: number) => (v < 0 ? "borçluyuz" : v > 0 ? "alacaklıyız" : "");

  return (
    <div className="space-y-4">
      <Link href="/cari" className="text-sm text-emerald-700">← Cari hesaplar</Link>
      <div>
        <h1 className="h1">{acc.name}</h1>
        <p className="text-sm text-slate-500">
          {isSupplier ? "Tedarikçi" : "Müşteri"} · {acc.taxOffice ?? ""} {acc.taxNumber ?? ""} {acc.phone ?? ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {companies.map((c) => {
          const v = balOf(c.id);
          return (
            <Link
              key={c.id}
              href={`?sirket=${c.id}`}
              className={`card block ${c.id === company?.id ? "border-emerald-500 ring-1 ring-emerald-500" : "hover:border-emerald-300"}`}
            >
              <div className="text-xs text-slate-500">{c.name}</div>
              <div className={`text-lg font-bold tabular-nums ${v < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(Math.abs(v))}</div>
              <div className="text-xs text-slate-400">{label(v) || "bakiye yok"}</div>
            </Link>
          );
        })}
        {companies.length > 1 && (
          <div className="card bg-slate-50">
            <div className="text-xs text-slate-500">Grup toplamı</div>
            <div className={`text-lg font-bold tabular-nums ${total < 0 ? "text-rose-600" : "text-emerald-700"}`}>{money(Math.abs(total))}</div>
            <div className="text-xs text-slate-400">{label(total)}</div>
          </div>
        )}
      </div>

      {company && (
        <>
          <div className="card overflow-x-auto">
            <h2 className="mb-2 font-semibold">Ekstre — {company.name}</h2>
            <table className="table">
              <thead><tr><th>Tarih</th><th>Açıklama</th><th>Tür</th><th>Şube</th><th className="num">Borç</th><th className="num">Alacak</th><th className="num">Bakiye</th></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{day(e.date)}</td>
                    <td>{e.description}</td>
                    <td className="text-slate-500">{SOURCE[e.source]}</td>
                    <td className="text-slate-500">{e.branch?.name ?? "-"}</td>
                    <td className="num">{num(e.debit) ? money(e.debit) : ""}</td>
                    <td className="num">{num(e.credit) ? money(e.credit) : ""}</td>
                    <td className="num font-medium">{money(e.running)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="text-sm text-slate-400">Bu şirkette hareket yok.</p>}
          </div>
          <form action={addAccountPayment.bind(null, acc.id)} className="card grid gap-2 sm:grid-cols-4">
            <h2 className="font-semibold sm:col-span-4">
              {isSupplier ? "Tedarikçiye ödeme yap" : "Müşteriden tahsilat al"} — {company.name} adına
            </h2>
            <input type="hidden" name="companyId" value={company.id} />
            <div><label className="label">Tarih</label><input type="date" name="date" defaultValue={dateInput(new Date())} className="input" /></div>
            <div><label className="label">Tutar</label><input name="amount" inputMode="decimal" required className="input" /></div>
            <div className="sm:col-span-2"><label className="label">Açıklama</label><input name="description" placeholder="Havale, nakit, çek…" className="input" /></div>
            <div><button className="btn-primary">Kaydet</button></div>
          </form>
        </>
      )}
    </div>
  );
}
