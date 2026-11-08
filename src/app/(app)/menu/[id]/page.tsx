import Link from "next/link";
import { notFound } from "next/navigation";
import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { netFromGross, recipeCost, round } from "@/lib/costing";
import { branchCostLookup } from "@/lib/services/stock";
import { money, pct, qty, UNIT_LABEL } from "@/lib/format";
import { removeRecipeLine, saveProduct, saveRecipeLine } from "../../actions";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireSession(["OWNER", "MANAGER"]);
  const isNew = id === "yeni";
  const [product, categories, stockItems, branches] = await Promise.all([
    isNew
      ? null
      : prisma.product.findFirst({
          where: { id, organizationId: s.organizationId },
          include: { recipe: { include: { stockItem: true } } },
        }),
    prisma.category.findMany({ where: { organizationId: s.organizationId }, orderBy: { sort: "asc" } }),
    prisma.stockItem.findMany({ where: { organizationId: s.organizationId }, orderBy: { name: "asc" } }),
    prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { name: "asc" } }),
  ]);
  if (!isNew && !product) notFound();
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0];

  let cost = { total: 0, lines: [] as { stockItemId: string; quantity: number; wastePct: number; unitCost: number; lineCost: number }[] };
  if (product && branch) {
    const costOf = await branchCostLookup(prisma, branch.id, product.recipe.map((r) => r.stockItemId));
    cost = recipeCost(
      product.recipe.map((r) => ({ stockItemId: r.stockItemId, quantity: num(r.quantity), wastePct: num(r.wastePct) })),
      costOf,
    );
  }
  const net = product ? netFromGross(num(product.price), product.vatRate) : 0;

  return (
    <div className="space-y-4">
      <Link href="/menu" className="text-sm text-emerald-700">← Menü</Link>
      <h1 className="h1">{product?.name ?? "Yeni ürün"}</h1>

      <form action={saveProduct} className="card grid gap-3 sm:grid-cols-6">
        {product && <input type="hidden" name="id" value={product.id} />}
        <div className="sm:col-span-2">
          <label className="label">Ürün adı</label>
          <input name="name" required defaultValue={product?.name} className="input" />
        </div>
        <div>
          <label className="label">Kategori</label>
          <select name="categoryId" defaultValue={product?.categoryId} className="input">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Satış fiyatı (KDV dahil)</label>
          <input name="price" inputMode="decimal" required defaultValue={product ? num(product.price) : ""} className="input" />
        </div>
        <div>
          <label className="label">KDV %</label>
          <input name="vatRate" inputMode="numeric" defaultValue={product?.vatRate ?? 10} className="input" />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Satışta
          </label>
          <button className="btn-primary">Kaydet</button>
        </div>
      </form>

      {product && (
        <div className="card space-y-3 overflow-x-auto">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-semibold">Reçete (1 porsiyon)</h2>
            <form className="flex items-end gap-2">
              <div>
                <label className="label">Maliyet şubesi</label>
                <select name="branch" defaultValue={branch?.id} className="input">
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <button className="btn-secondary">Göster</button>
            </form>
          </div>
          <table className="table">
            <thead>
              <tr><th>Hammadde</th><th className="num">Miktar</th><th className="num">Fire %</th><th className="num">Birim maliyet</th><th className="num">Satır maliyeti</th><th></th></tr>
            </thead>
            <tbody>
              {product.recipe.map((r) => {
                const c = cost.lines.find((l) => l.stockItemId === r.stockItemId);
                return (
                  <tr key={r.id}>
                    <td>{r.stockItem.name}</td>
                    <td className="num">{qty(r.quantity)} {UNIT_LABEL[r.stockItem.unit]}</td>
                    <td className="num">{qty(r.wastePct)}</td>
                    <td className="num">{money(c?.unitCost ?? 0)} / {UNIT_LABEL[r.stockItem.unit]}</td>
                    <td className="num font-medium">{money(c?.lineCost ?? 0)}</td>
                    <td className="text-right">
                      <form action={removeRecipeLine.bind(null, product.id, r.id)}>
                        <button className="text-xs text-rose-600">Sil</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td colSpan={4}>Porsiyon maliyeti</td>
                <td className="num">{money(cost.total)}</td><td></td>
              </tr>
            </tbody>
          </table>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>Net satış (KDV hariç): <b>{money(net)}</b></div>
            <div>Maliyet oranı: <b>{pct(net ? round((cost.total / net) * 100, 1) : 0)}</b></div>
            <div>Porsiyon başı brüt kâr: <b className="text-emerald-700">{money(net - cost.total)}</b></div>
          </div>
          <form action={saveRecipeLine.bind(null, product.id)} className="grid gap-2 border-t pt-3 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <label className="label">Hammadde ekle / güncelle</label>
              <select name="stockItemId" className="input">
                {stockItems.map((si) => <option key={si.id} value={si.id}>{si.name} ({UNIT_LABEL[si.unit]})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Miktar (temel birim)</label>
              <input name="quantity" inputMode="decimal" required className="input" />
            </div>
            <div>
              <label className="label">Fire %</label>
              <input name="wastePct" inputMode="decimal" defaultValue="0" className="input" />
            </div>
            <div className="flex items-end"><button className="btn-primary w-full">Ekle</button></div>
          </form>
        </div>
      )}
    </div>
  );
}
