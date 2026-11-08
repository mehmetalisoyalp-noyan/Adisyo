import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";
import { logout } from "../login/actions";

const NAV = [
  { href: "/", label: "Patron Paneli", roles: ["OWNER", "MANAGER"] },
  { href: "/pos", label: "Satış", roles: ["OWNER", "MANAGER", "CASHIER"] },
  { href: "/raporlar", label: "Maliyet & Kârlılık", roles: ["OWNER", "MANAGER"] },
  { href: "/menu", label: "Menü & Reçete", roles: ["OWNER", "MANAGER"] },
  { href: "/stok", label: "Stok", roles: ["OWNER", "MANAGER"] },
  { href: "/alis", label: "Alışlar", roles: ["OWNER", "MANAGER"] },
  { href: "/cari", label: "Cari Hesaplar", roles: ["OWNER", "MANAGER"] },
  { href: "/e-belge", label: "E-Fatura / E-Arşiv", roles: ["OWNER", "MANAGER"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <span className="font-bold text-emerald-700">Restoran Yönetim</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV.filter((n) => n.roles.includes(s.role)).map((n) => (
              <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                {n.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">{s.name} · {ROLE_LABEL[s.role]}</span>
            <button className="btn-secondary px-2 py-1 text-xs">Çıkış</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
