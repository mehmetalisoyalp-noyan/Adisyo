import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHANNEL_LABEL, money, TYPE_LABEL } from "@/lib/format";
import { openOrder } from "../../actions";

export default async function Tables({ params }: { params: Promise<{ branchId: string }> }) {
  const { branchId } = await params;
  const s = await requireSession();
  const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId: s.organizationId } });
  if (!branch || !canAccessBranch(s, branchId)) notFound();
  const [tables, open] = await Promise.all([
    prisma.diningTable.findMany({ where: { branchId }, orderBy: { sort: "asc" } }),
    prisma.order.findMany({ where: { branchId, status: "OPEN" }, orderBy: { openedAt: "asc" } }),
  ]);
  const byTable = new Map(open.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  const others = open.filter((o) => !o.tableId);
  const areas = [...new Set(tables.map((t) => t.area))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">{branch.name} — Masalar</h1>
        <div className="flex gap-2">
          <form action={openOrder.bind(null, branchId, null, "TAKEAWAY")}><button className="btn-secondary">+ Gel-Al</button></form>
          {branch.hasDelivery && (
            <form action={openOrder.bind(null, branchId, null, "DELIVERY")}><button className="btn-secondary">+ Paket Servis</button></form>
          )}
        </div>
      </div>
      {others.length > 0 && (
        <div className="card">
          <h2 className="mb-2 text-sm font-semibold">Açık gel-al / paket siparişleri</h2>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link key={o.id} href={`/pos/order/${o.id}`} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
                #{o.number} {TYPE_LABEL[o.type]} · {CHANNEL_LABEL[o.channel]} · {money(o.total)}
              </Link>
            ))}
          </div>
        </div>
      )}
      {areas.map((area) => (
        <section key={area}>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">{area}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {tables.filter((t) => t.area === area).map((t) => {
              const o = byTable.get(t.id);
              return (
                <form key={t.id} action={openOrder.bind(null, branchId, t.id, "DINE_IN")}>
                  <button
                    className={`h-20 w-full rounded-xl border text-sm font-medium shadow-sm ${
                      o ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white hover:border-emerald-400"
                    }`}
                  >
                    {t.name}
                    {o && <div className="text-xs font-semibold tabular-nums">{money(o.total)}</div>}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
