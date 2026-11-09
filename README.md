# Restoran Yönetim Sistemi

Kafe ve restoranlar için adisyon, **reçete bazlı maliyet analizi**, stok, alış, **cari hesap** ve
**e-fatura/e-arşiv** yönetimi. Çok şubeli ve çok kiracılı (abonelik satışına hazır) mimari.

Gereksinimler ve yol haritası: [docs/GEREKSINIMLER.md](docs/GEREKSINIMLER.md)

İnternette yayınlama (Vercel + Neon): [docs/YAYINLAMA.md](docs/YAYINLAMA.md)

## Kurulum

Gerekenler: Node.js 20+, PostgreSQL 14+.

```bash
npm install
cp .env.example .env          # DATABASE_URL ve SESSION_SECRET değerlerini düzenleyin
npm run db:reset              # tabloları kurar (migration) ve örnek veriyi yükler
npm run dev                   # http://localhost:3000
```

Örnek veride 3 kafe (20, 15 ve 40 masa), örnek menü (burgerler, pizzalar, makarnalar, patates
kızartması, içecekler) ve reçeteleri, tedarikçi alışları ve son 7 günün satışları bulunur.

| Kullanıcı | Rol | Şifre |
| --- | --- | --- |
| patron@ornek.com | Patron (tüm şubeler) | 123456 |
| mudur1@ornek.com … mudur3@ | Şube müdürü | 123456 |
| kasa1@ornek.com … kasa3@ | Kasiyer (yalnızca satış) | 123456 |

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build && npm start` | Üretim derlemesi |
| `npm test` | Maliyet hesaplama birim testleri |
| `npm run lint` | TypeScript tip kontrolü |
| `npm run db:reset` | Veritabanını sıfırla ve örnek veriyi yükle |
| `npm run db:migrate` | Bekleyen tablo değişikliklerini uygula |

## Proje yapısı

```
prisma/schema.prisma        Veri modeli (kiracı, şube, menü, reçete, stok, cari, alış, adisyon, e-belge)
prisma/seed.ts              Örnek veri
src/lib/costing.ts          Maliyet çekirdeği (saf fonksiyonlar, testli)
src/lib/services/stock.ts   Alış kaydı, ortalama maliyet, sayım
src/lib/services/orders.ts  Adisyon kapanışı: maliyet sabitleme, stok düşümü, cari
src/lib/services/edocument.ts  E-fatura/e-arşiv sağlayıcı arayüzü
src/lib/services/reports.ts Kârlılık ve şube raporları
src/app/(app)/              Ekranlar (patron paneli, satış, menü, stok, alış, cari, raporlar, e-belge)
tests/                      Birim testleri
```
