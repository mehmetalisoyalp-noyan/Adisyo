// Ortam değişkenine kopyala-yapıştırla gelen fazlalıkları temizler:
// tırnaklar, boşluk/satır sonu, "DATABASE_URL=" öneki, "psql '...'" komutu vb.
// Adresin içinden yalnızca postgresql:// (veya postgres://) ile başlayan kısmı alır.
export function normalizeDbUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const m = raw.match(/postgres(?:ql)?:\/\/[^\s'"`]+/);
  return m ? m[0] : raw.trim();
}
