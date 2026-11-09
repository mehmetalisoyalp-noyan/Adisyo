import Link from "next/link";
import { notFound } from "next/navigation";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { prepareMapping } from "@/lib/services/incoming";
import { money } from "@/lib/format";
import { MappingForm } from "./MappingForm";

export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const data = await prepareMapping(s.organizationId, id).catch(() => null);
  if (!data) notFound();
  const { doc, inv, supplier, stockItems, lines, buyerCompany } = data;
  // Alıcı VKN'si bir şirketimizle eşleştiyse yalnızca o şirketin şubeleri seçilebilir
  const branches = await prisma.branch.findMany({
    where: { organizationId: s.organizationId, ...branchScope(s), ...(buyerCompany ? { companyId: buyerCompany.id } : {}) },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-4">
      <Link href="/alis/e-fatura" className="text-sm text-emerald-700">← Gelen e-faturalar</Link>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">{inv.supplier.name}</h1>
          <p className="text-sm text-slate-500">
            Fatura {inv.number} · {inv.issueDate.split("-").reverse().join(".")} · VKN/TCKN {inv.supplier.taxNumber ?? "-"} ·{" "}
            {supplier ? (
              <span className="text-emerald-700">kayıtlı cari: {supplier.name}</span>
            ) : (
              <span className="text-amber-700">yeni tedarikçi, kaydedince cari açılacak</span>
            )}
          </p>
        </div>
        <div className="text-right text-sm">
          <div>KDV hariç {money(inv.totalNet)} · KDV {money(inv.totalVat)}</div>
          <div className="text-lg font-bold">Ödenecek {money(inv.payable)}</div>
        </div>
      </div>
      <div className={`rounded-lg p-3 text-sm ${buyerCompany ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        Alıcı: <b>{inv.customer.name}</b> (VKN {inv.customer.taxNumber ?? "-"}) —{" "}
        {buyerCompany
          ? <>şirketiniz <b>{buyerCompany.name}</b> ile eşleşti.</>
          : <>şirketlerinizden hiçbiriyle eşleşmedi. Ayarlar → Şirketler &amp; şubeler sayfasında vergi numaralarını kontrol edin.</>}
      </div>
      {branches.length === 0 && (
        <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">Bu şirkete ait, erişebildiğiniz bir şube yok.</div>
      )}
      {inv.typeCode !== "SATIS" && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Fatura türü <b>{inv.typeCode}</b>. İade veya tevkifatlı faturaları kaydetmeden önce kontrol edin.
        </div>
      )}
      {doc.status !== "DRAFT" ? (
        <div className="card text-sm">Bu belge zaten işlenmiş.</div>
      ) : (
        <MappingForm
          docId={doc.id}
          branches={branches.map((b) => ({ id: b.id, name: b.name }))}
          defaultBranchId={branches.find((b) => b.id === s.branchId)?.id ?? branches[0]?.id ?? ""}
          stockItems={stockItems.map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            purchaseUnit: i.purchaseUnit,
            factor: num(i.purchaseUnitFactor),
            lastCost: num(i.lastCost),
          }))}
          lines={lines}
        />
      )}
    </div>
  );
}
