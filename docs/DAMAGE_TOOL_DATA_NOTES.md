# Hasar Optimizasyonu: API veri notları

Örnek API yanıtlarının kimlik bilgileri ayıklanmış dosyaları `docs/api-samples/` altındadır. Yenilemek için `npx tsx scripts/sample-damage-tool-data.ts [24-haneli-userId]` çalıştırın. Script yalnızca WarEra'dan salt-okunur istek yapar (user.getUserLite için POST); anahtar değerini yazdırmaz ve oyuncu adı/ID alanlarını örneklerden çıkarır.

## Doğrulanan yanıt biçimleri

- `gameConfig.getGameConfig`: `result.data` içindeki oyun yapılandırması. Skill levels sayısal anahtarlı nesnedir (`levels["0"]` …), her kayıtta `value`, `totalCost`, `unlockAtLevel` bulunabilir. Becerilerin adı `criticalDamages` (çoğul) olarak geçer. Ekipman bonusları `items[code].dynamicStats`; tüketim bonusları `flatStats` altındadır.
- `user.getUserLite`: `leveling.level`, `leveling.xp`, `leveling.totalXp`, `leveling.totalSkillPoints`, `leveling.spentSkillPoints`, `leveling.availableSkillPoints`, `leveling.prestigeLevel`; `country` ülke ID'si; `militaryRank` sayıdır. Bu örnekte `spentSkillPoints + availableSkillPoints` toplamı `totalSkillPoints` ile tutarlıydı. Toplam alanları olmayan yanıtta seviye başına 4 puan fallback'i kullanılır.
- `user.getUserById`: Beceri nesneleri `skills[skill].level`, `value`, `strategic` alanlarını içerebilir. Örnekte `strategic` doğrudan düz bonus olarak sunulmuş ve `value` ile config taban değeri farkıyla da örtüşmüştür. `strategic` eksikse bu farktan pozitif değer çıkarılır ve yeniden dağıtım boyunca sabit tutulur.
- `search.searchAnything`: `result.data.userIds` ID dizisi verir; tam/küçük büyük harf duyarsız ad eşleşmesi için profiller `user.getUserLite` ile karşılaştırılır.
- `itemTrading.getPrices`: `result.data` doğrudan item kodu → sayı şeklinde fiyat haritasıdır. Eksik fiyatlar sıfır kabul edilmez; fiyatı bilinmeyen mühimmat veya tüketim planına eklenmez.
- `country.getCountryById`: `result.data.taxes.market` market vergi yüzdesi olarak gözlendi. API bunu vermezse vergi kullanıcı tarafından girilir.
- Supabase `price_data` tablosunda `id`, `equipment_name`, `main_stat`, `critical_chance`, `cautious_price` ve `updated_at` kolonları doğrulandı. Ekipman adları Türkçe (ör. `Basit bot`) tutulduğundan sunucu handler'ı bunları modelin kullandığı ekipman slotlarına dönüştürür; quality kolonu olmadığı için kalite, oyun yapılandırmasındaki stat aralıklarından çıkarılır. Fiyatlar sayfalı okunur; servise ait olmayan `median_price`, `confidence` ve `source` alanları varsayılan değerlerle doldurulur.

## Modelde doğrulanmamış varsayımlar

Kod içindeki ilgili formüllerde varsayımlar ayrıca işaretlidir: overflow değerinin fazla precision/crit başına düz puan olması; ıskanın hasar çarpanının 0.5 olması; zırh can tüketiminin onda bir aşağı yuvarlanması ve alt sınırının 1 olması; her eşyanın 100 vuruş dayanması ve hurda getirilerinin sabit tablodan gelmesi; günde 2.4 can barı varsayan `100 / regenDividedBy` yenilenme geleneği; yemek yuvası hesabı `hunger × günlük bar`; kasa-2 gelir payının %1 olması; pill debuff saldırı azalmasının varsayılan %60 olması; battle bonuslarının toplamsal birleştirilmesi; market fiyatlarının vergi öncesi olması; market fiyatı yoksa gelir hanesinin sıfır kalması. Rütbe hasar bonusu yanıtta bulunmadığı için elle girilir.

Fiyat tablosundaki ekipman satırlarında `cautious_price = null` hiçbir zaman aday olmaz. Normal modda `confidence=low` ve `source=smoothed` elenir. Ekipman fiyatlarına ve WarEra piyasa fiyatlarına market vergisi varsayılan olarak eklenir (`EQUIPMENT_PRICES_INCLUDE_TAX = false`). Ekipman veri tarihi 10 günden eskiyse arayüz uyarı verir.

## Güvenlik ve dağıtım

Vercel Hobby 12 fonksiyon sınırı dolu olduğundan yeni `api/` entry point eklenmemiştir. Özellik mevcut `/api/warera-proxy?tool=damage` içinde sunucu tarafında çalışır; config 6 saat, piyasa fiyatı 5 dakika, ekipman tablosu 10 dakika bellekte cache edilir. Endpoint IP başına dakikada 12 istekle sınırlandırılır. WarEra anahtarı hiçbir zaman istemciye dönmez.

Vercel ortam değişkenleri:

- `WARERA_API_KEY`: bu araç için sunucu tarafı WarEra API anahtarı. Boşsa eski `WARERA_API_TOKEN` / `WARERA_API_TOKENS` döngüsü kullanılır.
- `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` (veya mevcut Supabase ortam değişkenleri): `price_data` tablosuna sunucu tarafında okuma. Servis rolü anahtarını `NEXT_PUBLIC_` değişkeni olarak tanımlamayın. Yalnız anon key kullanıldığında tabloya SELECT RLS/policy izni verilmelidir.

Arama ve optimizasyon hataları açıkça gösterilir. CPU yoğun tarama tarayıcı Web Worker'ında yürür, iptal/progress destekler ve varsayılan 8 saniyede eldeki en iyi sonucu döndürür.
