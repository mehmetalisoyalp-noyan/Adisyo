"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { commitMenuImport, previewMenuImport } from "../../actions";

type Preview = Awaited<ReturnType<typeof previewMenuImport>>;
type Commit = Awaited<ReturnType<typeof commitMenuImport>>;
const tl = (v: number) => v.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });

export function Importer() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Commit | null>(null);
  const [pending, start] = useTransition();

  const form = () => {
    const fd = new FormData();
    if (file) fd.append("file", file);
    return fd;
  };
  const choose = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    start(async () => setPreview(await previewMenuImport(fd)));
  };

  const ok = preview && "products" in preview && preview.errors.length === 0;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={() => input.current?.click()}>Excel dosyası seç</button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <span className="text-sm text-slate-600">{file ? file.name : "Dosya seçilmedi"}</span>
        {pending && <span className="text-sm text-slate-500">İşleniyor…</span>}
        <a href="/menu/sablon" className="ml-auto text-sm text-emerald-700 underline">Boş şablonu indir</a>
      </div>

      {preview && preview.errors.length > 0 && (
        <div className="card border-rose-200">
          <h2 className="mb-2 font-semibold text-rose-700">Dosyada {preview.errors.length} hata var — düzeltip yeniden yükleyin</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">{preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {preview && "warnings" in preview && preview.warnings && preview.warnings.length > 0 && (
        <div className="card border-amber-200">
          <h2 className="mb-2 font-semibold text-amber-700">Uyarılar</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">{preview.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {preview && "products" in preview && preview.products && (
        <div className="card space-y-3 overflow-x-auto">
          <h2 className="font-semibold">Önizleme</h2>
          <p className="text-sm text-slate-600">
            Malzeme: <b>{preview.newItems}</b> yeni, <b>{preview.updatedItems}</b> güncellenecek · Ürün: <b>{preview.newProducts}</b> yeni,{" "}
            <b>{preview.updatedProducts}</b> güncellenecek · Reçete satırı: <b>{preview.recipeLines}</b>
          </p>
          <table className="table">
            <thead><tr><th>Ürün</th><th>Kategori</th><th>Durum</th><th className="num">Satış fiyatı</th><th className="num">Reçete maliyeti</th><th className="num">Maliyet oranı</th><th>Not</th></tr></thead>
            <tbody>
              {preview.products.map((p) => (
                <tr key={p.name} className={p.active ? "" : "text-slate-500"}>
                  <td className="font-medium">{p.name}{!p.exists && <span className="ml-1 rounded bg-emerald-100 px-1 text-xs text-emerald-800">yeni</span>}</td>
                  <td>{p.category}</td>
                  <td>{p.active ? "Satışta" : "Taslak"}</td>
                  <td className="num">{p.price != null ? tl(p.price) : "-"}</td>
                  <td className="num">{tl(p.cost)}</td>
                  <td className={`num ${p.costPct && p.costPct > 35 ? "text-rose-600" : ""}`}>{p.costPct != null ? `%${p.costPct.toFixed(1)}` : "-"}</td>
                  <td className="text-xs text-amber-700">
                    {p.lines === 0 ? "reçete yok" : p.missingPrices.length ? `fiyatı olmayan: ${p.missingPrices.join(", ")}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">
            Maliyetler dosyadaki alış fiyatlarıyla hesaplanmıştır. Programda alış faturası girildikçe şubenin gerçek ortalama maliyeti kullanılır.
            Dosyada reçetesi olan ürünlerin programdaki reçetesi dosyadakiyle değiştirilir.
          </p>
          {!result && (
            <button className="btn-primary" disabled={!ok || pending} onClick={() => start(async () => setResult(await commitMenuImport(form())))}>
              {pending ? "Aktarılıyor…" : "Programa aktar"}
            </button>
          )}
        </div>
      )}

      {result && "error" in result && result.error && <div className="card text-sm text-rose-700">{result.error}</div>}
      {result && "ok" in result && result.ok && (
        <div className="card space-y-2 border-emerald-300 bg-emerald-50 text-sm text-emerald-900">
          <b>Aktarıldı.</b> {result.ok.newItems} yeni ve {result.ok.updatedItems} güncellenen malzeme, {result.ok.newProducts} yeni ve{" "}
          {result.ok.updatedProducts} güncellenen ürün, {result.ok.newCategories} yeni kategori, {result.ok.recipeLines} reçete satırı.
          <div className="flex gap-3">
            <Link href="/menu" className="underline">Menü & reçete maliyetlerine git</Link>
            <Link href="/stok" className="underline">Stok kalemlerine git</Link>
          </div>
        </div>
      )}
    </div>
  );
}
