import Link from "next/link";

const TABS = [
  { href: "/kapanis", label: "Aylık kapanış raporu" },
  { href: "/kapanis/sayim", label: "Stok sayımları" },
  { href: "/kapanis/satis", label: "Satış raporları (Excel)" },
  { href: "/kapanis/ciro", label: "Günlük ciro & ödemeler" },
  { href: "/kapanis/eslestirme", label: "Ürün eşleştirme (Adisyo)" },
];

export function Tabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active === t.href ? "border-emerald-600 font-semibold text-emerald-700" : "border-transparent text-slate-600"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
