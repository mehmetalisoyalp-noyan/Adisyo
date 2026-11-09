import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { Importer } from "./Importer";

export default async function MenuImportPage() {
  await requireSession(["OWNER", "MANAGER"]);
  return (
    <div className="space-y-4">
      <Link href="/menu" className="text-sm text-emerald-700">← Menü & Reçete</Link>
      <div>
        <h1 className="h1">Menü ve reçeteleri Excel'den içe aktar</h1>
        <p className="text-sm text-slate-500">
          Dosyada üç sayfa olmalı: <b>Malzemeler</b>, <b>Ürünler</b>, <b>Reçeteler</b>. Kayıtlar ada göre eşleşir: programda aynı adla
          varsa güncellenir, yoksa eklenir. Önce önizleme gösterilir, onaylamadan hiçbir şey değişmez.
        </p>
      </div>
      <Importer />
    </div>
  );
}
