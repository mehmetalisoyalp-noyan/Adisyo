import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { money } from "@/lib/format";
import { ActionButton } from "@/components/ActionForm";
import { deleteSalesImport } from "../actions";
import { Tabs } from "../Tabs";
import { SalesUploader } from "./SalesUploader";

export default async function SalesImportsPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { createdAt: "asc" } });
  const imports = await prisma.salesImport.findMany({
    where: { organizationId: s.organizationId, branchId: { in: branches.map((b) => b.id) } },
    include: { branch: true, lines: true },
    orderBy: { periodStart: "desc" },
    take: 60,
  });
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="space-y-4">
      <h1 className="h1">Aylık Kapanış</h1>
      <Tabs active="/kapanis/satis" />
      <SalesUploader branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultBranchId={branches[0]?.id ?? ""} defaultMonth={defaultMonth} />
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Yüklenen satış raporları</h2>
        <table className="table">
          <thead><tr><th>Ay</th><th>Şube</th><th className="num">Ürün</th><th className="num">Adet</th><th className="num">Tutar</th><th className="num">Eşleşmeyen</th><th></th></tr></thead>
          <tbody>
            {imports.map((i) => (
              <tr key={i.id}>
                <td>{i.periodStart.toLocaleDateString("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" })}</td>
                <td>{i.branch.name}</td>
                <td className="num">{i.lines.length}</td>
                <td className="num">{i.lines.reduce((t, l) => t + num(l.quantity), 0).toLocaleString("tr-TR")}</td>
                <td className="num">{money(i.lines.reduce((t, l) => t + num(l.revenue), 0))}</td>
                <td className="num">{i.lines.filter((l) => !l.productId).length}</td>
                <td className="text-right"><ActionButton action={deleteSalesImport.bind(null, i.id)} label="Sil" confirm="Satış raporu silinsin mi?" className="text-xs text-rose-600 underline" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!imports.length && <p className="text-sm text-slate-400">Henüz satış raporu yüklenmedi.</p>}
      </div>
    </div>
  );
}
