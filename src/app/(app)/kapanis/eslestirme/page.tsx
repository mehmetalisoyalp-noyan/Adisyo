import { requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { key } from "@/lib/menuImport";
import { Tabs } from "../Tabs";
import { AliasSelect } from "./AliasSelect";

export default async function MappingPage() {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  const [lines, products, aliases] = await Promise.all([
    prisma.adisyoOrderLine.findMany({
      where: { cancelled: false, order: { organizationId: s.organizationId, cancelled: false, orderDate: { gte: since } } },
      select: { productName: true, quantity: true, amount: true, parentId: true },
    }),
    prisma.product.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productAlias.findMany({ where: { organizationId: s.organizationId } }),
  ]);
  const byKey = new Map(products.map((p) => [key(p.name), p.id]));
  const alias = new Map(aliases.map((a) => [a.alias, a.productId]));
  const agg = new Map<string, { name: string; qty: number; amount: number; sub: boolean }>();
  for (const l of lines) {
    const k = key(l.productName);
    const a = agg.get(k) ?? { name: l.productName, qty: 0, amount: 0, sub: !!l.parentId };
    a.qty += num(l.quantity);
    a.amount += num(l.amount);
    agg.set(k, a);
  }
  const rows = [...agg.entries()].map(([k, a]) => ({ ...a, k, productId: alias.get(k) ?? byKey.get(k) ?? "", how: alias.has(k) ? "elle" : byKey.has(k) ? "aynı ad" : "" }));
  rows.sort((x, y) => Number(!!x.productId) - Number(!!y.productId) || y.qty - x.qty);
  const unmatched = rows.filter((r) => !r.productId).length;
  return (
    <div className="space-y-4">
      <h1 className="h1">Aylık Kapanış</h1>
      <Tabs active="/kapanis/eslestirme" />
      <div className="card text-sm text-slate-600">
        Adisyo'daki ürün adlarının menüdeki karşılıkları (son 180 gün). Eşleştirme geçmiş siparişlere de uygulanır.
        Reçetesi olmayan içecek gibi ürünleri eşleştirmeden bırakabilirsiniz; bunlar ciroya katılır ama malzeme tüketimine katılmaz.
        {unmatched > 0 && <b className="ml-1 text-amber-700">{unmatched} ürün eşleşmedi.</b>}
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Adisyo'daki ad</th><th className="num">Adet</th><th className="num">Tutar</th><th>Menüdeki karşılığı</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className={r.productId ? "" : "bg-amber-50"}>
                <td>{r.name}{r.sub && <span className="ml-1 text-xs text-slate-400">(menü içi)</span>}{r.how && <span className="ml-1 text-xs text-emerald-700">({r.how})</span>}</td>
                <td className="num">{r.qty.toLocaleString("tr-TR")}</td>
                <td className="num">{r.amount.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td>
                <td><AliasSelect name={r.name} value={r.productId} products={products} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-slate-400">Henüz Adisyo'dan sipariş alınmadı. Ayarlar → Entegrasyonlar sayfasından bağlantıyı kurun.</p>}
      </div>
    </div>
  );
}
