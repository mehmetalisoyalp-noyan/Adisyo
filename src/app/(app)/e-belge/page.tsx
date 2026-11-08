import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dt, money } from "@/lib/format";
import { IssueButton } from "./IssueButton";

const STATUS = { DRAFT: "Taslak", QUEUED: "Kuyrukta", SENT: "Gönderildi", ERROR: "Hata" } as const;

export default async function EDocPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const branchFilter = s.branchId ? { branchId: s.branchId } : {};
  const [docs, pending] = await Promise.all([
    prisma.eDocument.findMany({
      where: { organizationId: s.organizationId, ...(s.branchId ? { order: { branchId: s.branchId } } : {}) },
      include: { order: { include: { branch: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.order.findMany({
      where: { organizationId: s.organizationId, status: "PAID", eDocuments: { none: { status: { in: ["SENT", "QUEUED"] } } }, ...branchFilter },
      include: { branch: true, customerAccount: true },
      orderBy: { closedAt: "desc" },
      take: 30,
    }),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">E-Fatura / E-Arşiv</h1>
        <p className="text-sm text-slate-500">
          Sağlayıcı: <b>{process.env.EDOC_PROVIDER ?? "mock"}</b>. Vergi numaralı cariye e-fatura, diğerlerine e-arşiv kesilir.
          Gerçek entegratör bağlantısı için entegratörün API bilgileri gerekir.
        </p>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Belge kesilmemiş satışlar (son 30)</h2>
        <table className="table">
          <thead><tr><th>Kapanış</th><th>Şube</th><th>Adisyon</th><th>Müşteri</th><th className="num">Tutar</th><th></th></tr></thead>
          <tbody>
            {pending.map((o) => (
              <tr key={o.id}>
                <td>{dt(o.closedAt)}</td><td>{o.branch.name}</td><td>#{o.number}</td>
                <td>{o.customerAccount?.name ?? "Nihai tüketici"}</td>
                <td className="num">{money(o.total)}</td>
                <td className="text-right"><IssueButton orderId={o.id} label={o.customerAccount?.taxNumber ? "E-fatura kes" : "E-arşiv kes"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Kesilen belgeler</h2>
        <table className="table">
          <thead><tr><th>Tarih</th><th>Tür</th><th>Belge no</th><th>Şube / adisyon</th><th>Durum</th><th className="num">Tutar</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{dt(d.createdAt)}</td>
                <td>{d.type === "E_FATURA" ? "E-Fatura" : "E-Arşiv"}</td>
                <td className="font-mono text-xs">{d.documentNo ?? "-"}</td>
                <td>{d.order ? `${d.order.branch.name} #${d.order.number}` : "-"}</td>
                <td className={d.status === "ERROR" ? "text-rose-600" : d.status === "SENT" ? "text-emerald-700" : ""}>
                  {STATUS[d.status]}{d.error ? `: ${d.error}` : ""}
                </td>
                <td className="num">{money((d.payload as { total?: number }).total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!docs.length && <p className="text-sm text-slate-400">Henüz belge kesilmedi.</p>}
      </div>
    </div>
  );
}
