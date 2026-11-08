import { branchScope, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { money, qty, UNIT_LABEL } from "@/lib/format";
import { countStock, createStockItem } from "../actions";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const s = await requireSession(["OWNER", "MANAGER"]);
  const sp = await searchParams;
  const branches = await prisma.branch.findMany({ where: { organizationId: s.organizationId, ...branchScope(s) }, orderBy: { name: "asc" } });
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0];
  const items = await prisma.stockItem.findMany({
    where: { organizationId: s.organizationId },
    orderBy: { name: "asc" },
    include: { levels: { where: { branchId: branch?.id } } },
  });
  const stockValue = items.reduce((a, i) => a + Math.max(0, num(i.levels[0]?.quantity)) * num(i.levels[0]?.avgCost), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Stok — {branch?.name}</h1>
          <p className="text-sm text-slate-500">Stok değeri (ortalama maliyetle): <b>{money(stockValue)}</b></p>
        </div>
        <form className="flex items-end gap-2">
          <select name="branch" defaultValue={branch?.id} className="input">
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className="btn-secondary">Göster</button>
        </form>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Kalem</th><th className="num">Mevcut</th><th className="num">Kritik</th><th className="num">Ort. maliyet</th><th className="num">Son alış</th><th className="num">Değer</th><th>Sayım / fire</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const l = i.levels[0];
              const q = num(l?.quantity);
              const factor = num(i.purchaseUnitFactor);
              return (
                <tr key={i.id}>
                  <td>{i.name}<div className="text-xs text-slate-400">alış: {i.purchaseUnit} = {qty(factor)} {UNIT_LABEL[i.unit]}</div></td>
                  <td className={`num ${q < num(i.minLevel) ? "font-semibold text-rose-600" : ""}`}>{qty(q)} {UNIT_LABEL[i.unit]}</td>
                  <td className="num text-slate-400">{qty(i.minLevel)}</td>
                  <td className="num">{money(num(l?.avgCost) * factor)} / {i.purchaseUnit.split(" ")[0]}</td>
                  <td className="num text-slate-500">{money(num(i.lastCost) * factor)}</td>
                  <td className="num">{money(Math.max(0, q) * num(l?.avgCost))}</td>
                  <td>
                    {branch && (
                      <form action={countStock} className="flex gap-1">
                        <input type="hidden" name="branchId" value={branch.id} />
                        <input type="hidden" name="stockItemId" value={i.id} />
                        <input name="counted" inputMode="decimal" placeholder="Sayılan" className="input w-24 py-1" required />
                        <select name="type" className="input w-24 py-1">
                          <option value="ADJUSTMENT">Sayım</option>
                          <option value="WASTE">Fire</option>
                        </select>
                        <button className="btn-secondary px-2 py-1">Kaydet</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={createStockItem} className="card grid gap-2 sm:grid-cols-6">
        <h2 className="font-semibold sm:col-span-6">Yeni stok kalemi</h2>
        <div className="sm:col-span-2"><label className="label">Ad</label><input name="name" required className="input" /></div>
        <div>
          <label className="label">Temel birim</label>
          <select name="unit" className="input"><option value="GR">gr</option><option value="ML">ml</option><option value="ADET">adet</option></select>
        </div>
        <div><label className="label">Alış birimi</label><input name="purchaseUnit" placeholder="kg, koli…" required className="input" /></div>
        <div><label className="label">1 alış birimi = ? temel birim</label><input name="purchaseUnitFactor" defaultValue="1000" className="input" /></div>
        <div><label className="label">Kritik seviye</label><input name="minLevel" defaultValue="0" className="input" /></div>
        <div className="sm:col-span-6"><button className="btn-primary">Ekle</button></div>
      </form>
    </div>
  );
}
