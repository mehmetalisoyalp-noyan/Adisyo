import Link from "next/link";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { netFromGross, round, suggestedPrice } from "@/lib/costing";
import { productCosts } from "@/lib/services/stock";
import { money, pct } from "@/lib/format";
import { createCategory } from "../actions";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const target = Number((await searchParams).target) || 30;
  const [categories, branches] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: s.organizationId },
      orderBy: { sort: "asc" },
      include: { products: { orderBy: { sort: "asc" }, include: { _count: { select: { recipe: true } } } } },
    }),
    prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { name: "asc" } }),
  ]);
  const ids = categories.flatMap((c) => c.products.map((p) => p.id));
  const costsByBranch = await Promise.all(branches.map(async (b) => (await productCosts(prisma, b.id, ids)).costs));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Menü & Reçete Maliyetleri</h1>
          <p className="text-sm text-slate-500">
            Maliyetler reçete × şubenin ağırlıklı ortalama alış maliyetinden hesaplanır (KDV hariç).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="label">Hedef maliyet oranı (%)</label>
              <input name="target" defaultValue={target} className="input w-24" />
            </div>
            <button className="btn-secondary">Hesapla</button>
          </form>
          <Link href="/menu/ice-aktar" className="btn-secondary">Excel'den içe aktar</Link>
          <Link href="/menu/yeni" className="btn-primary">+ Yeni ürün</Link>
        </div>
      </div>

      {categories.map((c) => (
        <div key={c.id} className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">{c.name}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="num">Satış fiyatı</th>
                {branches.map((b) => <th key={b.id} className="num">Maliyet · {b.name}</th>)}
                <th className="num">Maliyet oranı</th>
                <th className="num">Birim kâr</th>
                <th className="num">Önerilen fiyat (%{target})</th>
              </tr>
            </thead>
            <tbody>
              {c.products.map((p) => {
                const price = num(p.price);
                const costs = costsByBranch.map((m) => m.get(p.id) ?? 0);
                const avg = costs.reduce((a, b) => a + b, 0) / (costs.length || 1);
                const net = netFromGross(price, p.vatRate);
                const costPct = net ? round((avg / net) * 100, 1) : 0;
                const sug = suggestedPrice(avg, target, p.vatRate);
                return (
                  <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                    <td>
                      <Link className="font-medium text-emerald-700 hover:underline" href={`/menu/${p.id}`}>{p.name}</Link>
                      {p._count.recipe === 0 && <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800">reçete yok</span>}
                      {price <= 0 && <span className="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800">fiyat girilmedi</span>}
                      {!p.active && <span className="ml-2 rounded bg-slate-200 px-1 text-xs text-slate-600">satışa kapalı</span>}
                    </td>
                    <td className="num">{money(price)}</td>
                    {costs.map((x, i) => <td key={i} className="num">{money(x)}</td>)}
                    <td className={`num ${costPct > target ? "font-semibold text-rose-600" : "text-emerald-700"}`}>{pct(costPct)}</td>
                    <td className="num">{money(net - avg)}</td>
                    <td className={`num ${sug > price ? "text-rose-600" : "text-slate-500"}`}>{money(sug)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <form action={createCategory} className="card flex max-w-md gap-2">
        <input name="name" placeholder="Yeni kategori adı" className="input" />
        <button className="btn-secondary whitespace-nowrap">Kategori ekle</button>
      </form>
    </div>
  );
}
