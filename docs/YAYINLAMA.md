# Programı internette yayınlama (kalıcı adres)

Program iki ücretsiz hizmetle yayınlanır:

- **Neon**: PostgreSQL veritabanı
- **Vercel**: Programın çalıştığı sunucu ve internet adresi (örn. `adisyo.vercel.app`)

İkisinde de **GitHub hesabınızla** giriş yapabilirsiniz. Toplam süre yaklaşık 15 dakika.

---

## 1. Adım: Veritabanı (Neon)

1. **https://neon.tech** adresine gidin → **Sign up** → **Continue with GitHub**.
2. **Create project** ekranında:
   - **Project name:** `restoran`
   - **Region:** **AWS Europe Central 1 (Frankfurt)** (Türkiye'ye en yakın bölge)
   - **Create project** düğmesine basın.
3. Açılan ekranda **Connect** düğmesine basın. Bir bağlantı adresi göreceksiniz:
   `postgresql://...@ep-....eu-central-1.aws.neon.tech/neondb?sslmode=require`
4. İki adresi bir kenara (Not Defteri'ne) kopyalayın:
   - **Connection pooling AÇIK** iken görünen adres → bu **DATABASE_URL** olacak
     (adreste `-pooler` kelimesi geçer)
   - **Connection pooling KAPALI** iken görünen adres → bu **DIRECT_URL** olacak

> Bu adresler veritabanınızın şifresini içerir. Kimseyle paylaşmayın, sohbete yapıştırmayın.

## 2. Adım: Uygulama (Vercel)

1. **https://vercel.com** adresine gidin → **Sign Up** → **Continue with GitHub**.
   Plan sorulursa **Hobby** seçin.
2. **Add New… → Project** seçin.
3. Listede **Adisyo** deposunu bulun → **Import**.
   - Depo listede yoksa **Adjust GitHub App Permissions** bağlantısına tıklayıp Adisyo deposuna
     erişim verin.
4. **Configure Project** ekranında **Environment Variables** bölümünü açın ve şu değerleri tek tek
   ekleyin (**Key** sol kutu, **Value** sağ kutu):

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon'dan kopyaladığınız **pooling açık** adres |
   | `DIRECT_URL` | Neon'dan kopyaladığınız **pooling kapalı** adres |
   | `SESSION_SECRET` | En az 32 karakterlik rastgele bir metin (harf ve rakam karışık uydurun) |
   | `SEED_PASSWORD` | Örnek kullanıcıların şifresi. Kendiniz belirleyin, `123456` kullanmayın |
   | `EDOC_PROVIDER` | `mock` |

5. **Deploy** düğmesine basın. İlk kurulum 3–5 dakika sürer: tablolar oluşturulur, örnek menü ve
   örnek veriler yüklenir.
6. Bitince **Congratulations!** ekranı çıkar. **Continue to Dashboard** → üstte görünen adres
   (örn. `adisyo-xxxx.vercel.app`) programınızın kalıcı adresidir.

## 3. Adım: Giriş

- Adres: Vercel'in verdiği adres
- E-posta: `patron@ornek.com` (müdür: `mudur1@ornek.com`, kasiyer: `kasa1@ornek.com`)
- Şifre: `SEED_PASSWORD` olarak belirlediğiniz şifre

Telefonda da aynı adresi açabilirsiniz. Tarayıcı menüsünden **Ana ekrana ekle** derseniz uygulama gibi
açılır.

---

## Sonrası

- **Güncellemeler kendiliğinden yayına çıkar.** Programa yapılan her değişiklik GitHub'a
  gönderildiğinde Vercel birkaç dakika içinde yeni sürümü yayınlar.
- **Veriler korunur.** Örnek veri yalnızca veritabanı boşken bir kez yüklenir. Sonraki güncellemeler
  verinize dokunmaz.
- **Saat dilimi.** Raporlardaki "bugün" ve tarih aralıkları Türkiye saatine göre hesaplanır.

## Ücretler ve sınırlar

- **Neon Free:** 0,5 GB veritabanı. Başlangıç ve deneme için fazlasıyla yeterli.
- **Vercel Hobby** ücretsizdir, ancak Vercel'in kurallarına göre **ticari kullanım için değildir**.
  Program gerçek işletmelerde kullanılmaya başlandığında **Vercel Pro**'ya geçmek gerekir
  (kullanıcı başına aylık yaklaşık 20 $). Deneme aşamasında Hobby yeterlidir.
- Gerçek işletme verisi girilmeye başlandığında Neon'da yedekleme ayarlarını birlikte gözden
  geçirelim.

## Sorun çıkarsa

Vercel'de **Deployments** sekmesinde kırmızı (**Error**) bir kayıt görürseniz, üzerine tıklayıp
**Build Logs** bölümündeki son 20–30 satırı kopyalayın ve paylaşın. En sık neden ortam
değişkenlerinin (Environment Variables) eksik ya da yanlış girilmesidir.

---

## Adisyo entegrasyonu (gece otomatik eşitleme)

Program her gece 04:00'te (Türkiye saati) her şubenin Adisyo'daki tamamlanmış siparişlerini çeker.
Bunun için Vercel'de bir kez şu ortam değişkenini ekleyin (**Settings → Environment Variables**):

| Key | Value |
| --- | --- |
| `CRON_SECRET` | En az 32 karakterlik rastgele bir metin (gece görevinin şifresi) |

Ekledikten sonra **Deployments → en üstteki kayıt → ⋯ → Redeploy** yapın.

Adisyo anahtarları programdaki **Ayarlar → Entegrasyonlar** sayfasından girilir ve veritabanında şifreli saklanır.
Şifreleme anahtarı `SESSION_SECRET` değerinden türetilir: bu değeri değiştirirseniz Adisyo anahtarlarını yeniden girmeniz gerekir
(isterseniz ayrı bir `SECRET_KEY` değişkeni tanımlayabilirsiniz).
