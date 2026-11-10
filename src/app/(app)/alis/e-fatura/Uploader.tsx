"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { stripAttachments } from "@/lib/xmlstrip";
import { importIncoming } from "../../actions";

type Result = { file: string; status: "added" | "updated" | "duplicate" | "skipped" | "error"; message: string };
const COLOR = { added: "text-emerald-700", updated: "text-sky-700", duplicate: "text-slate-500", skipped: "text-amber-700", error: "text-rose-600" };
const LABEL = { added: "Eklendi", updated: "Yenilendi", duplicate: "Zaten var", skipped: "Atlandı", error: "Hata" };

/** Seçilen dosyalardan (XML ve ZIP içindeki XML'ler) fatura metinlerini çıkarır */
async function collect(files: File[]) {
  const out: { name: string; xml: string }[] = [];
  for (const f of files) {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".xml")) out.push({ name: f.name, xml: stripAttachments(await f.text()) });
    else if (lower.endsWith(".zip")) {
      const zip = await JSZip.loadAsync(f);
      for (const entry of Object.values(zip.files)) {
        if (!entry.dir && entry.name.toLowerCase().endsWith(".xml")) {
          out.push({ name: `${f.name} › ${entry.name}`, xml: stripAttachments(await entry.async("string")) });
        }
      }
    }
  }
  return out;
}

export function Uploader() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    setResults([]);
    setBusy("Dosyalar okunuyor…");
    const all = await collect([...list]);
    if (!all.length) {
      setBusy(null);
      setResults([{ file: "-", status: "error", message: "Seçimde XML veya ZIP dosyası bulunamadı" }]);
      return;
    }
    // Sunucu sınırını aşmamak için parça parça gönder
    const acc: Result[] = [];
    let batch: typeof all = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      setBusy(`Yükleniyor… ${acc.length + batch.length} / ${all.length}`);
      try {
        acc.push(...(await importIncoming(batch)));
      } catch (e) {
        acc.push(...batch.map((b) => ({ file: b.name, status: "error" as const, message: e instanceof Error ? e.message : "Yüklenemedi" })));
      }
      setResults([...acc]);
      batch = [];
      size = 0;
    };
    for (const f of all) {
      if (batch.length >= 40 || size + f.xml.length > 2_500_000) await flush();
      batch.push(f);
      size += f.xml.length;
    }
    await flush();
    setBusy(null);
    router.refresh();
  }

  const counts = results.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">XML yükle</h2>
        <p className="text-sm text-slate-500">
          e-Portal'dan indirdiğiniz gelen e-fatura XML dosyalarını ya da bunları içeren ZIP dosyasını seçin.
          Bütün bir klasörü de seçebilirsiniz. Aynı fatura iki kez eklenmez; yeniden yüklenirse ayrıntıları yenilenir.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>Dosya seç (XML / ZIP)</button>
        <button className="btn-secondary" disabled={!!busy} onClick={() => dirRef.current?.click()}>Klasör seç</button>
        <input ref={fileRef} type="file" accept=".xml,.zip" multiple hidden onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
        <input
          ref={dirRef}
          type="file"
          multiple
          hidden
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => { handle(e.target.files); e.target.value = ""; }}
        />
      </div>
      {busy && <p className="text-sm text-slate-600">{busy}</p>}
      {results.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm">
            {(["added", "updated", "duplicate", "skipped", "error"] as const).filter((k) => counts[k]).map((k) => `${LABEL[k]}: ${counts[k]}`).join(" · ")}
          </p>
          <div className="max-h-64 overflow-y-auto rounded border border-slate-100 text-xs">
            {results.map((r, i) => (
              <div key={i} className="flex gap-2 border-b border-slate-50 px-2 py-1">
                <span className={`w-20 shrink-0 font-medium ${COLOR[r.status]}`}>{LABEL[r.status]}</span>
                <span className="truncate text-slate-600">{r.message}</span>
                <span className="ml-auto truncate text-slate-400">{r.file}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
