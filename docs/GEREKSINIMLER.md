# Restoran Yönetim Sistemi — Gereksinimler ve Yol Haritası

## 1. Amaç

Şu an abone olunan adisyon programının karşılamadığı ihtiyaçları karşılayan, önce kendi
işletmelerimizde kullanılacak, ileride başka işletmelere abonelikle satılabilecek bir restoran/kafe
yönetim yazılımı.

### Mevcut programda eksik olanlar (öncelik sırasıyla)

1. **Maliyet analizi yok.** Satılan her ürünün maliyeti ve kârı hesaplanamıyor.
2. **Cari hesaplar görülemiyor.** Tedarikçi borçları ve müşteri alacakları takip edilemiyor.
3. **E-fatura / e-arşiv yok.**
4. **Alışlar takip edilmiyor.** Program yalnızca satışları tutuyor.

## 2. İşletme yapısı

| Şube         | Tür  | Masa | Paket servis |
| ------------ | ---- | ---- | ------------ |
| Kafe 1 (Şirket A) | Kafe | 20   | Hayır        |
| Kafe 2 (Şirket B) | Kafe | 15   | Hayır        |
| Kafe 3 (Şirket C) | Kafe | 40   | Evet         |

Her kafe **ayrı bir şirkettir** (ayrı ünvan ve vergi numarası), her şirketin bir şubesi vardır.

Yurt dışındaki 2 işletme bu sistemin kapsamı dışında.

**Kullanım:** Şubelerdeki bilgisayarlar (kasa), müdürler, patron (cep telefonu/tablet). Garson telefonu
gerekmiyor.

## 3. Mimari kararlar

| Konu | Karar | Neden |
| --- | --- | --- |
| Uygulama | Web uygulaması (Next.js) | Kasa bilgisayarı, tablet ve telefonda kurulumsuz çalışır |
| Veritabanı | PostgreSQL | Muhasebe verisi için güvenilir, ilişkisel |
| Çok kiracılı yapı | Her kayıt `organizationId` taşır | İleride abonelik satışı için baştan hazır |
| Şirket yapısı | Grup → Şirket (tüzel kişi, VKN) → Şube | Her kafe ayrı şirket; alış, cari bakiye ve e-belge şirket bazında ayrı, patron hepsini tek girişte görür |
| Ortak tanımlar | Menü, stok kalemi ve cari kartları grup içinde ortak | Aynı tedarikçinin tek kartı, şirket başına ayrı bakiyesi olur |
| Kullanıcı rolleri | Patron / Müdür / Kasiyer | Müdür kendi şubesini, patron hepsini görür |
| Maliyet yöntemi | Şube bazında ağırlıklı ortalama | Türkiye'de yaygın ve vergi mevzuatına uygun |
| Satış maliyeti | Adisyon kapanırken sabitlenir | Sonradan fiyat değişse de geçmiş kâr değişmez |
| KDV | Satış KDV dahil girilir, maliyet KDV hariç tutulur | Kârlılık net ciro üzerinden doğru hesaplanır |
| E-belge | Sağlayıcıdan bağımsız arayüz | Entegratör değişirse yalnızca bir dosya değişir |

## 4. Maliyet hesabı nasıl çalışır?

1. **Stok kalemi** tanımlanır (örn. "Dana köfte", temel birim **gr**, alış birimi **kg** = 1000 gr).
2. **Reçete**: her ürün için 1 porsiyonda kullanılan hammadde miktarı ve fire oranı
   (örn. Hamburger = 120 gr köfte + 1 ekmek + 20 gr marul…).
3. **Alış faturası** girildiğinde şubenin stoğu artar ve **ağırlıklı ortalama maliyet** güncellenir:
   `yeni ort. = (mevcut miktar × mevcut ort. + gelen miktar × gelen fiyat) / toplam miktar`
4. **Adisyon kapanınca** her kalem için `reçete × şube ortalama maliyeti` hesaplanır, kaleme yazılır ve
   hammaddeler stoktan düşülür.
5. **Raporlar**: ürün bazında net ciro, maliyet, brüt kâr, maliyet oranı (food cost %) ve marj.
   Hedef maliyet oranına göre **önerilen satış fiyatı** gösterilir.

## 5. Modüller ve durum

| Modül | Durum (v0.1) |
| --- | --- |
| Giriş, roller, şube yetkisi | ✅ |
| Masa planı, adisyon, gel-al, paket | ✅ |
| Ödeme: nakit / kart / cariye, bölünmüş ödeme, indirim | ✅ |
| Menü, kategoriler, ürünler | ✅ |
| Reçete + fire oranı + şube bazında porsiyon maliyeti | ✅ |
| Stok kalemleri, şube stokları, sayım ve fire girişi, kritik stok | ✅ |
| Alış faturası → stok + ortalama maliyet + tedarikçi carisi | ✅ |
| Cari hesaplar: tedarikçi/müşteri, ekstre, ödeme/tahsilat | ✅ |
| Maliyet & kârlılık raporu (tarih ve şube filtreli) | ✅ |
| Patron paneli (mobil uyumlu) | ✅ |
| E-arşiv / e-fatura kesme (test sağlayıcısı ile) | ✅ (gerçek entegratör bekliyor) |
| Gelen e-fatura XML (UBL-TR) / ZIP / klasör yükleme → alış faturası | ✅ |
| Ayarlar: şirket bilgileri, şubeler, bölüm bazında masa sayısı | ✅ |
| Kullanıcı yönetimi (rol, şube, şifre, pasif yapma), şifremi değiştir | ✅ |
| Örnek veriyi seçmeli temizleme ve geçiş kontrol listesi | ✅ |
| Çoklu şirket: şirket bazında cari bakiye/ekstre, e-belgede satıcı şirket, gelen faturada alıcı VKN ile şirket eşleştirme | ✅ |
| Menü & reçete Excel içe aktarma (Malzemeler / Ürünler / Reçeteler şablonu, önizleme, ada göre güncelleme, boş şablon) | ✅ |
| Tedarikçi kalemi ↔ stok kalemi eşleştirme hafızası, birim çevrimi | ✅ |
| Stok dışı fatura kalemleri (nakliye, ambalaj) | ✅ |

## 6. Yol haritası

### Faz 2 — Gerçek bağlantılar
- [ ] **E-fatura entegratörü** bağlantısı (giden e-fatura/e-arşiv ve mükellef sorgusu)
- [x] Gelen e-faturaları XML olarak yükleyip alış faturasına çevirme (eşleştirme hafızalı)
- [ ] Gelen e-faturaları entegratörden (Mikrogrup e-Portal) otomatik çekme — API bilgisi bekleniyor
- [ ] Nakliye gibi giderleri ürün maliyetine dağıtma (isteğe bağlı)
- [ ] **Yemeksepeti, Getir, Trendyol Yemek** sipariş entegrasyonları
- [ ] **ÖKC / POS cihazı** entegrasyonu (marka/model öğrenildikten sonra)
- [ ] Fiş ve mutfak yazıcısı (ESC/POS) çıktısı

### Faz 3 — Maliyetin derinleşmesi
- [ ] Yarı mamul reçeteleri (sos, hamur gibi alt reçeteler)
- [ ] Ürün seçenekleri/ekstralar (ekstra peynir) ve bunların reçete etkisi
- [ ] Teorik ve gerçek tüketim karşılaştırması (sayım farkı = kayıp/kaçak analizi) — Mall of İstanbul 'şube verimlilik' tablosundaki ekmek/köfte/patates/tavuk incelemesinin otomatik hâli
- [ ] Şube bazında farklı satış fiyatı
- [ ] Genel giderler (kira, personel, enerji) ile net kâr ve başa baş analizi
- [ ] Fiyat değişikliği simülasyonu ("köfte %10 zamlanırsa kârım ne olur?")

### Faz 4 — İşletme ve abonelik
- [ ] Mutfak ekranı (KDS)
- [ ] Kasa açılış/kapanış (Z raporu), gün sonu mutabakatı
- [ ] Şubeler arası stok transferi, merkezden sipariş
- [ ] İnternet kesintisinde çalışma (çevrimdışı mod)
- [ ] Abonelik yönetimi, işletme kayıt ekranı, plan bazlı özellik açma

## 7. Sizden beklenen bilgiler

1. POS cihazının marka ve modeli
2. E-fatura entegratörü: **Mikrogrup e-Portal** — API / web servis dokümanı ve test hesabı (Mikrogrup'tan istenecek)
3. Yemeksepeti, Getir ve Trendyol entegrasyon başvuruları (API anahtarları)
4. Fiş ve mutfak yazıcısı modelleri (seçildiğinde)
5. Gerçek menü, reçeteler ve tedarikçi listesi (Excel olarak alınabilirse içe aktarılır)
