import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { dateInput, day, money } from "@/lib/format";
import { addAccountPayment } from "../../actions";

const SOURCE = { OPENING: "Açılış", PURCHASE: "Alış", SALE: "Satış", PAYMENT: "Ödeme/Tahsilat" } as const;

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const acc = await prisma.account.findFirst({
    where: { id, organizationId: s.organizationId },
    include: { entries: { orderBy: { date: "asc" }, include: { branch: true } } },
  });
  if (!acc) notFound();
  let running = 0;
  const rows = acc.entries.map((e) => {
    running += num(e.debit) - num(e.credit);
    return { ...e, running };
  });
  const isSupplier = acc.type === "SUPPLIER";
  return (
    <div className="space-y-4">
      <Link href="/cari" className="text-sm text-emerald-700">← Cari hesaplar</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">{acc.name}</h1>
          <p className="text-sm text-slate-500">
            {isSupplier ? "Tedarikçi" : "Müşteri"} · {acc.taxOffice ?? ""} {acc.taxNumber ?? ""} {acc.phone ?? ""}
          </p>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${running < 0 ? "text-rose-600" : "text-emerald-700"}`}>
          {money(Math.abs(running))} <span className="text-sm font-normal">{running < 0 ? "borçluyuz" : running > 0 ? "alacaklıyız" : ""}</span>
        </div>
      </div>
      <div className="card overflow-x-auto">
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
        {!rows.length && <p className="text-sm text-slate-400">Hareket yok.</p>}
      </div>
      <form action={addAccountPayment.bind(null, acc.id)} className="card grid gap-2 sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">{isSupplier ? "Tedarikçiye ödeme yap" : "Müşteriden tahsilat al"}</h2>
        <div><label className="label">Tarih</label><input type="date" name="date" defaultValue={dateInput(new Date())} className="input" /></div>
        <div><label className="label">Tutar</label><input name="amount" inputMode="decimal" required className="input" /></div>
        <div className="sm:col-span-2"><label className="label">Açıklama</label><input name="description" placeholder="Havale, nakit, çek…" className="input" /></div>
        <div><button className="btn-primary">Kaydet</button></div>
      </form>
    </div>
  );
}
