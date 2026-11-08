import Link from "next/link";
import { redirect } from "next/navigation";
import { branchScope, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function PosHome() {
  const s = await requireSession();
  const branches = await prisma.branch.findMany({
    where: { organizationId: s.organizationId, ...branchScope(s) },
    include: { _count: { select: { tables: true } } },
    orderBy: { name: "asc" },
  });
  if (branches.length === 1) redirect(`/pos/${branches[0].id}`);
  return (
    <div className="space-y-4">
      <h1 className="h1">Şube seçin</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {branches.map((b) => (
          <Link key={b.id} href={`/pos/${b.id}`} className="card hover:border-emerald-400">
            <div className="text-lg font-semibold">{b.name}</div>
            <div className="text-sm text-slate-500">{b._count.tables} masa{b.hasDelivery ? " · paket servis" : ""}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
