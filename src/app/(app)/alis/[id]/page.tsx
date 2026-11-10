import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { day, money, qty, UNIT_LABEL } from "@/lib/format";
import { itemKey, UNIT_NAMES, type UblInvoice } from "@/lib/ubl";

export default async function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const inv = await prisma.purchaseInvoice.findFirst({
    where: { id, organizationId: s.organizationId },
    include: {
      supplier: true,
      branch: { include: { company: true } },
      lines: { include: { stockItem: true } },
      eDocuments: { where: { direction: "INCOMING" } },
    },
  });
  if (!inv || !canAccessBranch(s, inv.branchId)) notFound();
  const ubl = inv.eDocuments[0]?.payload as unknown as UblInvoice | undefined;
  // Faturadaki kalemlerin hangi stok kalemine eşlendiği (tedarikçi eşleştirme hafızasından)
  const mappings = ubl
    ? await prisma.supplierItemMapping.findMany({
        where: { organizationId: s.organizationId, supplierId: inv.supplierId },
        include: { stockItem: true },
      })
    : [];
  const mapOf = new Map(mappings.map((m) => [m.itemKey, m]));

  return (
    <div className="space-y-4">
      <Link href="/alis" className="text-sm text-emerald-700">← Alış faturaları</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{inv.supplier.name}</h1>
          <p className="text-sm text-slate-500">
            Fatura <b>{inv.invoiceNo}</b> · {day(inv.date)} · {inv.branch.name} ({inv.branch.company.name})
            {inv.eInvoiceUuid && <> · ETTN <span className="font-mono text-xs">{inv.eInvoiceUuid}</span></>}
          </p>
        </div>
        <div className="text-right text-sm">
          <div>KDV hariç {money(inv.totalNet)} · KDV {money(inv.totalVat)}</div>
          <div className="text-lg font-bold">Toplam {money(inv.total)}</div>
        </div>
      </div>

      {ubl && (
        <div className="card overflow-x-auto">
          <h2 className="mb-1 font-semibold">E-faturadaki kalemler (faturada yazdığı gibi)</h2>
          <p className="mb-3 text-xs text-slate-500">
            Ürün adı kısa veya kodluysa açıklama, marka ve not sütunlarına bakın. "Eşlendiği malzeme" bu tedarikçi için hatırlanan eşleştirmedir.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>Faturadaki ürün adı</th><th>Kod</th><th>Açıklama / marka / not</th>
                <th className="num">Miktar</th><th className="num">Birim fiyat</th><th className="num">İskonto</th>
                <th className="num">Tutar (KDV hariç)</th><th className="num">KDV</th><th>Eşlendiği malzeme</th>
              </tr>
            </thead>
            <tbody>
              {ubl.lines.map((l) => {
                const m = mapOf.get(itemKey(l));
                return (
                  <tr key={l.lineNo} className="align-top">
                    <td className="text-slate-400">{l.lineNo}</td>
                    <td className="font-medium">{l.name}</td>
                    <td className="text-xs text-slate-500">{l.code ?? "-"}</td>
                    <td className="text-xs text-slate-600">{[l.description, l.note].filter(Boolean).join(" · ") || "-"}</td>
                    <td className="num whitespace-nowrap">{qty(l.quantity)} {UNIT_NAMES[l.unitCode] ?? l.unitCode}</td>
                    <td className="num">{l.unitPrice ? money(l.unitPrice) : "-"}</td>
                    <td className="num whitespace-nowrap">
                      {l.discount ? <>{money(l.discount)}{l.discountPct ? <div className="text-xs text-slate-500">%{qty(l.discountPct)}</div> : null}</> : "-"}
                    </td>
                    <td className="num">{money(l.lineNet)}</td>
                    <td className="num">%{qty(l.vatRate)}</td>
                    <td className="text-xs">
                      {m ? (m.stockItem ? <span className="text-emerald-700">{m.stockItem.name}<div className="text-slate-400">1 {UNIT_NAMES[l.unitCode] ?? l.unitCode} = {qty(m.baseQtyPerUnit)} {UNIT_LABEL[m.stockItem.unit]}</div></span> : <span className="text-slate-500">stok dışı (gider)</span>) : <span className="text-amber-700">eşleştirme yok</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ubl.notes && ubl.notes.length > 0 && (
            <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-600">
              <b>Fatura notları:</b> {ubl.notes.join(" · ")}
            </div>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Programa işlenen satırlar</h2>
        <table className="table">
          <thead><tr><th>Malzeme / açıklama</th><th className="num">Miktar</th><th className="num">Birim fiyat (KDV hariç)</th><th className="num">Tutar</th><th className="num">KDV</th><th className="num">Stoğa giren</th></tr></thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.stockItem?.name ?? <span className="text-slate-500">{l.description} <span className="text-xs">(stok dışı)</span></span>}</td>
                <td className="num whitespace-nowrap">{qty(l.quantity)} {l.stockItem?.purchaseUnit ?? ""}</td>
                <td className="num">{money(l.unitPrice)}</td>
                <td className="num">{money(l.lineNet)}</td>
                <td className="num">%{l.vatRate}</td>
                <td className="num whitespace-nowrap">
                  {l.stockItem ? `${qty(num(l.quantity) * num(l.stockItem.purchaseUnitFactor))} ${UNIT_LABEL[l.stockItem.unit]}` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
