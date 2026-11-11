import Link from "next/link";

const TABS = [
  { href: "/ayarlar", label: "Genel & geçiş" },
  { href: "/ayarlar/subeler", label: "Şirketler & şubeler" },
  { href: "/ayarlar/kullanicilar", label: "Kullanıcılar" },
  { href: "/ayarlar/entegrasyon", label: "Entegrasyonlar (Adisyo)" },
];

export function Tabs({ active }: { active: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active === t.href ? "border-emerald-600 font-semibold text-emerald-700" : "border-transparent text-slate-600"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
