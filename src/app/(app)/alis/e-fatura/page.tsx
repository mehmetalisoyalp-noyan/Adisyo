import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dt, money } from "@/lib/format";
import type { UblInvoice } from "@/lib/ubl";
import { ignoreIncoming } from "../../actions";
import { Uploader } from "./Uploader";

export default async function IncomingPage({ searchParams }: { searchParams: Promise<{ islendi?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const sp = await searchParams;
  const [pending, done] = await Promise.all([
    prisma.eDocument.findMany({
      where: { organizationId: s.organizationId, direction: "INCOMING", status: "DRAFT" },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.eDocument.findMany({
      where: { organizationId: s.organizationId, direction: "INCOMING", status: { in: ["PROCESSED", "IGNORED"] } },
      include: { purchaseInvoice: { include: { branch: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const inv = (p: unknown) => p as UblInvoice;
  const sorted = [...pending].sort((a, b) => inv(a.payload).issueDate.localeCompare(inv(b.payload).issueDate));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/alis" className="text-sm text-emerald-700">← Alış faturaları</Link>
        <h1 className="h1">Gelen e-faturalar</h1>
        <p className="text-sm text-slate-500">
          XML'i yükleyin, kalemleri stok kalemlerinizle bir kez eşleştirin. Program sonraki faturalarda eşleştirmeyi hatırlar.
          Kaydedince stok, ortalama maliyet ve tedarikçi carisi birlikte güncellenir.
        </p>
      </div>
      {sp.islendi && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Fatura alışlara kaydedildi.</div>}
      <Uploader />

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">İşlenmeyi bekleyenler ({pending.length})</h2>
        <table className="table">
          <thead><tr><th>Fatura tarihi</th><th>Fatura no</th><th>Tedarikçi</th><th>VKN</th><th className="num">Kalem</th><th className="num">Tutar</th><th></th></tr></thead>
          <tbody>
            {sorted.map((d) => {
              const p = inv(d.payload);
              return (
                <tr key={d.id}>
                  <td>{p.issueDate.split("-").reverse().join(".")}</td>
                  <td className="font-mono text-xs">{p.number}{p.typeCode !== "SATIS" && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">{p.typeCode}</span>}</td>
                  <td>{p.supplier.name}</td>
                  <td className="text-slate-500">{p.supplier.taxNumber ?? "-"}</td>
                  <td className="num">{p.lines.length}</td>
                  <td className="num font-medium">{money(p.payable)}</td>
                  <td className="whitespace-nowrap text-right">
                    <Link href={`/alis/e-fatura/${d.id}`} className="btn-primary px-3 py-1 text-xs">Eşleştir ve kaydet</Link>
                    <form action={ignoreIncoming.bind(null, d.id)} className="ml-2 inline">
                      <button className="text-xs text-slate-500 underline">Yok say</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!pending.length && <p className="text-sm text-slate-400">Bekleyen fatura yok.</p>}
      </div>

      {done.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Son işlenenler</h2>
          <table className="table">
            <tbody>
              {done.map((d) => {
                const p = inv(d.payload);
                return (
                  <tr key={d.id}>
                    <td>{dt(d.createdAt)}</td>
                    <td className="font-mono text-xs">{p.number}</td>
                    <td>{p.supplier.name}</td>
                    <td>{d.status === "PROCESSED" ? `Alışa kaydedildi · ${d.purchaseInvoice?.branch.name ?? ""}` : "Yok sayıldı"}</td>
                    <td className="num">{money(p.payable)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
