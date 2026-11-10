import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { day, money } from "@/lib/format";

export default async function PurchasesPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { organizationId: s.organizationId, ...(s.branchId ? { branchId: s.branchId } : {}) },
    include: { supplier: true, branch: { include: { company: true } }, _count: { select: { lines: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Alış Faturaları</h1>
        <div className="flex gap-2">
          <Link href="/alis/e-fatura" className="btn-primary">Gelen e-fatura yükle (XML)</Link>
          <Link href="/alis/yeni" className="btn-secondary">+ Elle fatura gir</Link>
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Tarih</th><th>Fatura no</th><th>Tedarikçi</th><th>Şube / şirket</th><th className="num">Kalem</th><th className="num">KDV hariç</th><th className="num">KDV</th><th className="num">Toplam</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{day(i.date)}</td>
                <td>
                  <Link href={`/alis/${i.id}`} className="text-emerald-700 hover:underline">{i.invoiceNo}</Link>
                  {i.eInvoiceUuid && <span className="ml-1 text-xs text-emerald-700">e-fatura</span>}
                </td>
                <td><Link className="text-emerald-700 hover:underline" href={`/cari/${i.supplierId}`}>{i.supplier.name}</Link></td>
                <td>{i.branch.name}<div className="text-xs text-slate-400">{i.branch.company.name}</div></td>
                <td className="num">{i._count.lines}</td>
                <td className="num">{money(i.totalNet)}</td>
                <td className="num">{money(i.totalVat)}</td>
                <td className="num font-medium">{money(i.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
