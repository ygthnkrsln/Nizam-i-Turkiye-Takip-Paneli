# TürkEra Takip Paneli

WarEra topluluğu için geliştirilen TürkEra Takip Paneli; ordu, oyuncu, ekonomi ve bağış verilerini tek bir arayüzde sunar. Veriler WarEra API'sinden alınır; günlük hasar, oyuncu modu ve bağış hedefi snapshot'ları Supabase'te saklanabilir.

## Özellikler

- **Bağış Takibi:** Takip edilen birlik üyelerinin günlük ve haftalık bağış hedeflerini, gerçekleşen ödemelerini ve eksik/fazla tutarlarını gösterir. Hedefler günlük snapshot'tan hesaplanır; gün içindeki gelir değişiklikleri geçmiş hedefleri değiştirmez.
- **Ordu Takibi:** Takip edilen orduların üye, sağlık, açlık ve hasar verilerini görüntüler. Tek bir ordudan veri alınamaması diğer orduların gösterimini engellemez.
- **Savaş ve hasar araçları:** Ordu bilgisi, savaş telemetrisi, günlük/ittifak hasarı ve hasar optimizasyonu.
- **Ekonomi ve ülke araçları:** Fabrika ve çalışan gelir hesapları, market fiyatları, ülke istatistikleri ve ülke takibi.
- **Yardımcı araçlar:** Seviye hesaplayıcı ve prestij/hasar optimizasyonu.
- **Günlük kayıt:** Vercel Cron her gün Türkiye saatiyle 02:55'te hasar, oyuncu modu ve bağış hedeflerini kaydeder. Snapshot'lar 30 güne kadar tutulur.

## Teknoloji

- React, TypeScript, Vite ve Tailwind CSS
- Express tabanlı API sunucusu
- WarEra tRPC API
- Supabase (snapshot ve yönetim verisi önbelleği için)
- Vercel (dağıtım ve zamanlanmış cron için)

## Gereksinimler

- Node.js 20 LTS önerilir
- npm
- WarEra API anahtarı
- Kalıcı snapshot kayıtları için Supabase projesi

## Yerel geliştirme

1. Depoyu klonlayıp proje dizinine geçin.
2. Bağımlılıkları yükleyin:

   ```bash
   npm install
   ```

3. Ortam dosyasını oluşturun:

   ```bash
   # macOS / Linux
   cp .env.example .env

   # Windows PowerShell
   Copy-Item .env.example .env
   ```

4. `.env` içindeki gerekli değerleri yapılandırın.
5. Geliştirme sunucusunu başlatın:

   ```bash
   npm run dev
   ```

   Uygulama `http://localhost:3000` adresinde açılır.

### Ortam değişkenleri

| Değişken | Gerekli | Açıklama |
|---|---|---|
| `WARERA_API_TOKEN` | Evet* | Sunucu tarafında kullanılacak tek WarEra API anahtarı (`wae_...`). |
| `WARERA_API_TOKENS` | Hayır | Virgülle ayrılmış birden fazla anahtar. İstekler anahtarlar arasında dağıtılır. |
| `SUPABASE_URL` | Kalıcı kayıt için | Supabase proje URL'si. |
| `SUPABASE_SERVICE_ROLE_KEY` | Önerilen | Sunucu tarafında snapshot yazma/silme yetkisi için service-role anahtarı. |
| `SUPABASE_ANON_KEY` | Alternatif | Supabase anon anahtarı; veritabanı politikaları yazma işlemlerine izin vermelidir. |
| `GEMINI_API_KEY` | Hayır | Örnek ortam dosyasında bulunur; panelin temel işlevleri için gerekli değildir. |

\* Sunucu anahtarı tanımlanmamışsa kullanıcı, uygulamadaki **WarEra API Anahtarı** bölümüne kendi anahtarını girebilir. Bu anahtar tarayıcının yerel depolamasında tutulur; sunucu ortam değişkenlerini istemci koduna eklemeyin veya service-role anahtarını paylaşmayın.

Supabase değerleri tanımlanmadığında uygulama yapılandırılmış varsayılan bağlantı bilgilerini kullanabilir; kalıcı kayıt ve cron kullanımı için kendi Supabase ortam değişkenlerinizi tanımlamanız önerilir.

## Supabase kurulumu

Günlük snapshot'lar `daily_snapshots` tablosunda tutulur. Tablo yoksa Supabase SQL Editor'de aşağıdaki şemayı oluşturun:

```sql
create table if not exists public.daily_snapshots (
  date date primary key,
  timestamp bigint not null,
  armies jsonb not null default '{}'::jsonb,
  iso timestamptz,
  created_at timestamptz not null default now()
);
```

Yönetim yanıtlarının kalıcı önbelleği için isteğe bağlı tabloyu [scripts/create-management-cache-table.sql](./scripts/create-management-cache-table.sql) dosyasından oluşturabilirsiniz.

## Komutlar

```bash
npm run dev    # Yerel geliştirme sunucusu
npm run lint   # TypeScript tür kontrolü
npm run build  # İstemci ve sunucu production derlemesi
```

## Dağıtım ve günlük snapshot

Proje Vercel'e dağıtılacak şekilde yapılandırılmıştır. Vercel proje ayarlarında WarEra ve Supabase ortam değişkenlerini tanımlayın. [`vercel.json`](./vercel.json), `/api/cron/record-daily-damage` uç noktasını her gün `23:55 UTC`'de çalıştırır (Türkiye saatiyle 02:55).

Cron, takip edilen orduların üyelerini ve günlük verileri alır, oyuncu başına bağış hedefini o anki gelir/mod/seviye/servet bilgisine göre snapshot'a yazar ve eski snapshot'ları 30 günlük saklama sınırına göre temizler. Aynı gün tekrar çalıştırıldığında önceden kaydedilmiş bağış hedefi korunur. Vercel cron zamanlamaları UTC kullanır; Türkiye'de yaz/kış saati uygulaması olmadığı için bu saat yıl boyunca 02:55 TSİ'ye karşılık gelir.

## API uç noktaları

- `GET /api/management-overview` — ordu ve bağış takibi verileri
- `GET /api/player-factories?userId=<id>` — oyuncu fabrika/gelir hesabı
- `GET /api/daily-damage-snapshots` — saklanan günlük snapshot'lar
- `GET /api/cron/record-daily-damage` — zamanlanmış snapshot işlemi

## Proje yapısı

```text
api/                 Vercel API giriş noktaları ve cron
src/components/      Arayüz bileşenleri
src/config/          Takip edilen ordu ve uygulama yapılandırmaları
src/lib/             Ortak hesaplama, mod ve Supabase yardımcıları
src/server/handlers/ Sunucu API işleyicileri
src/server/services/ Snapshot ve sunucu servisleri
src/services/        İstemci API servisleri
```
