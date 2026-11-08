import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Restoran Yönetim", description: "Adisyon, maliyet ve cari yönetimi" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
