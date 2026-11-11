import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { day, money, qty, UNIT_LABEL } from "@/lib/format";
import { ActionButton } from "@/components/ActionForm";
import { deleteCount } from "../../actions";

export default async function CountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const c = await prisma.stockCount.findFirst({
    where: { id, organizationId: s.organizationId },
    include: { branch: true, lines: { include: { stockItem: true }, orderBy: { stockItem: { name: "asc" } } } },
  });
  if (!c || !canAccessBranch(s, c.branchId)) notFound();
  return (
    <div className="space-y-4">
      <Link href="/kapanis/sayim" className="text-sm text-emerald-700">← Stok sayımları</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="h1">{c.branch.name} — {day(c.countedAt)} sayımı</h1>
        <ActionButton action={deleteCount.bind(null, c.id)} label="Sayımı sil" confirm="Sayım silinsin mi? (Stok miktarları geri alınmaz.)" className="text-sm text-rose-600 underline" />
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Malzeme</th><th className="num">Sayılan</th><th className="num">Alış birimiyle</th><th className="num">Birim maliyet</th><th className="num">Değer</th></tr></thead>
          <tbody>
            {c.lines.filter((l) => num(l.quantity) > 0).map((l) => {
              const cost = l.unitCost != null ? num(l.unitCost) : num(l.stockItem.lastCost);
              const f = num(l.stockItem.purchaseUnitFactor);
              return (
                <tr key={l.id}>
                  <td>{l.stockItem.name}</td>
                  <td className="num">{qty(l.quantity)} {UNIT_LABEL[l.stockItem.unit]}</td>
                  <td className="num text-slate-500">{qty(num(l.quantity) / f)} {l.stockItem.purchaseUnit}</td>
                  <td className="num">{money(cost * f)} / {l.stockItem.purchaseUnit}{l.unitCost == null && <span className="ml-1 text-xs text-slate-400">(son alış)</span>}</td>
                  <td className="num">{money(num(l.quantity) * cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
