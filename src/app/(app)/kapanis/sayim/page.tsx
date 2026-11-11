import Link from "next/link";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { day, money } from "@/lib/format";
import { Tabs } from "../Tabs";
import { CountUploader } from "./CountUploader";

export default async function CountsPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { createdAt: "asc" } });
  const counts = await prisma.stockCount.findMany({
    where: { organizationId: s.organizationId, branchId: { in: branches.map((b) => b.id) } },
    include: { branch: true, lines: { include: { stockItem: true } } },
    orderBy: [{ countedAt: "desc" }],
    take: 100,
  });
  return (
    <div className="space-y-4">
      <h1 className="h1">Aylık Kapanış</h1>
      <Tabs active="/kapanis/sayim" />
      <CountUploader branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultBranchId={branches[0]?.id ?? ""} />
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Kayıtlı sayımlar</h2>
        <table className="table">
          <thead><tr><th>Sayım tarihi</th><th>Şube</th><th className="num">Sayılan kalem</th><th className="num">Stok değeri*</th><th>Maliyet</th><th>Dosya</th></tr></thead>
          <tbody>
            {counts.map((c) => {
              const value = c.lines.reduce((t, l) => t + num(l.quantity) * (l.unitCost != null ? num(l.unitCost) : num(l.stockItem.lastCost)), 0);
              const locked = c.lines.some((l) => l.unitCost != null);
              return (
                <tr key={c.id}>
                  <td><Link href={`/kapanis/sayim/${c.id}`} className="text-emerald-700 hover:underline">{day(c.countedAt)}</Link></td>
                  <td>{c.branch.name}</td>
                  <td className="num">{c.lines.filter((l) => num(l.quantity) > 0).length}</td>
                  <td className="num">{money(value)}</td>
                  <td className="text-xs">{locked ? <span className="text-emerald-700">sabitlenmiş</span> : <span className="text-slate-500">son alış fiyatıyla</span>}</td>
                  <td className="text-xs text-slate-400">{c.fileName ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!counts.length && <p className="text-sm text-slate-400">Henüz sayım yok. İlk sayım (ör. 31.12.2026) dönem başı stoğu olur.</p>}
        <p className="mt-2 text-xs text-slate-400">* Sayımda birim maliyet yoksa malzemenin son alış maliyetiyle değerlenir.</p>
      </div>
    </div>
  );
}
