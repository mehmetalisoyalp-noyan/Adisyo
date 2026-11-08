import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { money } from "@/lib/format";

export default async function PurchasesPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { organizationId: s.organizationId, ...(s.branchId ? { branchId: s.branchId } : {}) },
    include: { supplier: true, branch: true, _count: { select: { lines: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="h1">Alış Faturaları</h1>
        <Link href="/alis/yeni" className="btn-primary">+ Alış faturası gir</Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Tarih</th><th>Fatura no</th><th>Tedarikçi</th><th>Şube</th><th className="num">Kalem</th><th className="num">KDV hariç</th><th className="num">KDV</th><th className="num">Toplam</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.date.toLocaleDateString("tr-TR")}</td>
                <td>{i.invoiceNo}{i.eInvoiceUuid && <span className="ml-1 text-xs text-emerald-700">e-fatura</span>}</td>
                <td><Link className="text-emerald-700 hover:underline" href={`/cari/${i.supplierId}`}>{i.supplier.name}</Link></td>
                <td>{i.branch.name}</td>
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
