import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessBranch, requireSession } from "@/lib/auth";
import { num, prisma } from "@/lib/db";
import { CHANNEL_LABEL, money, TYPE_LABEL } from "@/lib/format";
import { addItem, cancelOrder, changeQty, setDiscount } from "../../../actions";
import { PaymentForm } from "./PaymentForm";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ cat?: string }>;
}) {
  const { orderId } = await params;
  const { cat } = await searchParams;
  const s = await requireSession();
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId: s.organizationId },
    include: { items: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }, table: true, branch: true },
  });
  if (!order || !canAccessBranch(s, order.branchId)) notFound();
  const [categories, customers] = await Promise.all([
    prisma.category.findMany({
      where: { organizationId: s.organizationId },
      orderBy: { sort: "asc" },
      include: { products: { where: { active: true }, orderBy: { sort: "asc" } } },
    }),
    prisma.account.findMany({ where: { organizationId: s.organizationId, type: "CUSTOMER" }, orderBy: { name: "asc" } }),
  ]);
  const activeCat = categories.find((c) => c.id === cat) ?? categories[0];
  const open = order.status === "OPEN";
  const subtotal = order.items.reduce((a, i) => a + num(i.unitPrice) * i.quantity, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/pos/${order.branchId}`} className="text-sm text-emerald-700">← {order.branch.name}</Link>
          <h1 className="h1">
            {order.table?.name ?? TYPE_LABEL[order.type]} · Adisyon #{order.number}
            {order.channel !== "POS" && <span className="ml-2 text-sm text-slate-500">({CHANNEL_LABEL[order.channel]})</span>}
          </h1>
        </div>
        {!open && <span className="rounded bg-slate-200 px-2 py-1 text-sm">Kapalı ({order.status === "PAID" ? "ödendi" : "iptal"})</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="flex gap-1 overflow-x-auto">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`?cat=${c.id}`}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${c.id === activeCat?.id ? "bg-emerald-600 text-white" : "bg-white border border-slate-200"}`}
              >
                {c.name}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {activeCat?.products.map((p) => (
              <form key={p.id} action={addItem.bind(null, order.id, p.id)}>
                <button disabled={!open} className="h-20 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm font-medium shadow-sm hover:border-emerald-400 disabled:opacity-50">
                  {p.name}
                  <div className="text-xs text-slate-500 tabular-nums">{money(p.price)}</div>
                </button>
              </form>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <table className="table">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="whitespace-nowrap">
                    {open && (
                      <form action={changeQty.bind(null, order.id, i.id, -1)} className="inline">
                        <button className="h-7 w-7 rounded border">−</button>
                      </form>
                    )}
                    <span className="mx-2 tabular-nums">{i.quantity}</span>
                    {open && (
                      <form action={changeQty.bind(null, order.id, i.id, 1)} className="inline">
                        <button className="h-7 w-7 rounded border">+</button>
                      </form>
                    )}
                  </td>
                  <td className="num">{money(num(i.unitPrice) * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!order.items.length && <p className="text-sm text-slate-400">Soldan ürün ekleyin.</p>}
          <div className="space-y-1 border-t pt-2 text-sm">
            <div className="flex justify-between"><span>Ara toplam</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {num(order.discount) > 0 && (
              <div className="flex justify-between text-rose-600"><span>İndirim</span><span className="tabular-nums">−{money(order.discount)}</span></div>
            )}
            <div className="flex justify-between text-lg font-bold"><span>Toplam</span><span className="tabular-nums">{money(order.total)}</span></div>
          </div>
          {open && s.role !== "CASHIER" && (
            <form action={setDiscount.bind(null, order.id)} className="flex gap-2">
              <input name="discount" inputMode="decimal" placeholder="İndirim (TL)" className="input" defaultValue={num(order.discount) || ""} />
              <button className="btn-secondary">Uygula</button>
            </form>
          )}
          {open && <PaymentForm orderId={order.id} total={num(order.total)} customers={customers} />}
          {open && s.role !== "CASHIER" && (
            <form action={cancelOrder.bind(null, order.id)}>
              <button className="w-full text-xs text-rose-600 underline">Adisyonu iptal et</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
