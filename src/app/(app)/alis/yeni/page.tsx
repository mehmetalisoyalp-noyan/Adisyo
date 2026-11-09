import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { PurchaseForm } from "./PurchaseForm";

export default async function NewPurchase() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const [branches, suppliers, items] = await Promise.all([
    prisma.branch.findMany({
      where: { organizationId: s.organizationId, ...branchScope(s) },
      orderBy: { createdAt: "asc" },
      include: { company: true },
    }),
    prisma.account.findMany({ where: { organizationId: s.organizationId, type: "SUPPLIER" }, orderBy: { name: "asc" } }),
    prisma.stockItem.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Alış faturası gir</h1>
      <p className="text-sm text-slate-500">
        Kaydedince stok artar, şubenin ortalama maliyeti güncellenir ve tedarikçi carisine borç işlenir.
      </p>
      <PurchaseForm
        branches={branches.map((b) => ({ id: b.id, name: `${b.name} — ${b.company.name}` }))}
        suppliers={suppliers.map((a) => ({ id: a.id, name: a.name }))}
        items={items.map((i) => ({ id: i.id, name: i.name, purchaseUnit: i.purchaseUnit, lastPrice: num(i.lastCost) * num(i.purchaseUnitFactor) }))}
      />
    </div>
  );
}
