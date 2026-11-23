# Hasar Optimizasyonu: API veri notları

Örnek API yanıtlarının kimlik bilgileri ayıklanmış dosyaları `docs/api-samples/` altındadır. Yenilemek için `npx tsx scripts/sample-damage-tool-data.ts [24-haneli-userId]` çalıştırın. Script yalnızca WarEra'dan salt-okunur istek yapar (user.getUserLite için POST); anahtar değerini yazdırmaz ve oyuncu adı/ID alanlarını örneklerden çıkarır.

## Doğrulanan yanıt biçimleri

- `gameConfig.getGameConfig`: `result.data` içindeki oyun yapılandırması. Skill levels sayısal anahtarlı nesnedir (`levels["0"]` …), her kayıtta `value`, `totalCost`, `unlockAtLevel` bulunabilir. Becerilerin adı `criticalDamages` (çoğul) olarak geçer. Ekipman bonusları `items[code].dynamicStats`; tüketim bonusları `flatStats` altındadır.
- `user.getUserLite`: `leveling.level`, `leveling.xp`, `leveling.totalXp`, `leveling.totalSkillPoints`, `leveling.spentSkillPoints`, `leveling.availableSkillPoints`, `leveling.prestigeLevel`; `country` ülke ID'si; `militaryRank` sayıdır. Bu örnekte `spentSkillPoints + availableSkillPoints` toplamı `totalSkillPoints` ile tutarlıydı. Toplam alanları olmayan yanıtta seviye başına 4 puan fallback'i kullanılır.
- `user.getUserById`: Beceri nesneleri `skills[skill].level`, `value`, `strategic` alanlarını içerebilir. Örnekte `strategic` doğrudan düz bonus olarak sunulmuş ve `value` ile config taban değeri farkıyla da örtüşmüştür. `strategic` eksikse bu farktan pozitif değer çıkarılır ve yeniden dağıtım boyunca sabit tutulur.
- `search.searchAnything`: `result.data.userIds` ID dizisi verir; tam/küçük büyük harf duyarsız ad eşleşmesi için profiller `user.getUserLite` ile karşılaştırılır.
- `itemTrading.getPrices`: `result.data` doğrudan item kodu → sayı şeklinde fiyat haritasıdır. Eksik fiyatlar sıfır kabul edilmez; fiyatı bilinmeyen mühimmat veya tüketim planına eklenmez.
- `country.getCountryById`: `result.data.taxes.market` örnekte `0.5` olarak gözlendi. Sayısal alan doğrulandı; birimin yüzde puanı mı (`0.5%`) yoksa oran mı (`50%`) olduğu oyunun resmi dokümanlarından teyit edilemedi. Araç bütçeyi olduğundan geniş göstermemek için geçici olarak yüksek maliyetli `50%` yorumunu uygular ve arayüzde uyarır.
- Supabase `price_data` tablosunda `id`, `equipment_name`, `main_stat`, `critical_chance`, `cautious_price` ve `updated_at` kolonları doğrulandı. Ekipman adları Türkçe (ör. `Basit bot`) tutulduğundan sunucu handler'ı bunları modelin kullandığı ekipman slotlarına dönüştürür; quality kolonu olmadığı için kalite, oyun yapılandırmasındaki stat aralıklarından çıkarılır. Fiyatlar sayfalı okunur; servise ait olmayan `median_price`, `confidence` ve `source` alanları varsayılan değerlerle doldurulur.

## Modelde doğrulanmamış varsayımlar

Kod içindeki ilgili formüllerde varsayımlar ayrıca işaretlidir: overflow değerinin fazla precision/crit başına düz puan olması; ıskanın hasar çarpanının 0.5 olması; zırh can tüketiminin onda bir aşağı yuvarlanması ve alt sınırının 1 olması; her eşyanın 100 vuruş dayanması ve hurda getirilerinin sabit tablodan gelmesi; günde 2.4 can barı varsayan `100 / regenDividedBy` yenilenme geleneği; yemek yuvası hesabı `hunger × günlük bar`; kasa-2 gelir payının %1 olması; pill debuff saldırı azalmasının varsayılan %60 olması; battle bonuslarının toplamsal birleştirilmesi; market fiyatlarının vergi öncesi olması; market fiyatı yoksa gelir hanesinin sıfır kalması. `user.getUserById.skills.attack.militaryRankPercent` varsa rütbe yüzdesi otomatik gelir; alan yoksa yüzde uydurulmaz ve sıfır/elle düzenlenebilir kalır.

## Gelir tahmini ve savaş ön dolguları

| Alan | Kaynak / API alanı | Durum ve davranış |
|---|---|---|
| Günlük giriş ödülü | `gameConfig.getGameConfig` → `user.dailyReward.money`, `user.dailyReward.case1`; `itemTrading.getPrices` → `case1` | Mevcut yerel örneklerde alanlar mevcut. Kasa, canlı `case1` fiyatıyla vergisiz değerlenir; market alım vergisi ödül kasasına eklenmez. |
| Günlük/haftalık/aylık görev | `gameConfig.getGameConfig` → `mission.reward.{daily,weekly,monthly}.{money,cases}` | Yerel yapılandırma örneğinde bu yol bulunmuyor; gelire sessizce sıfır ödül eklenmez. Yanıt alanı yoksa UI görev ödüllerinin hariç tutulduğunu bildirir. Uygun alan dönen yanıtta dönem ödülü 1/7/30'a bölünür; XP dahil edilmez. |
| Üretim tıklaması | `user.regenDividedBy`, `user.energyCostPerAction`; `skills.energy.levels[n].value`; `skills.production.levels[n].value`; `items[code].isTradable`, `productionPoints`, `productionNeeds`; `itemTrading.getPrices` | Konfigürasyon ve fiyat alanları yerel örneklerle doğrulandı. Günlük tıklama `floor(enerji × 24 / regenDividedBy / energyCostPerAction)`; savaş maliyeti `battle.healthCost` olarak tanımlı olduğundan model savaş vuruşlarında enerji düşmez. Bu, yapılandırma alanlarına göre yapılan model çıkarımıdır. |
| Ek gelir, depo/bölge/ücret ayarları | Kullanıcı girdisi | Yönetim maaşı, çalışan geliri, motor, bounty ve üretim bonus/vergi alanları API'den güvenilir hesaplanamadığı için manuel bırakılır. Üretim varsayılanları kendi şirketi, bonus %0 ve vergi %0'dır; üretim geliri varsayılan olarak kapalıdır. |
| Geliri bütçeye katma | Günlük gelir tahmini + kullanıcı bütçesi | Varsayılan açık. `effectiveBudget = max(0, günlük bütçe) + (açıksa max(0, gelir))`. Boş bütçe sıfır sayılır. Dövüş ganimet kasaları mevcut modelde ayrı kalır ve bu tahmine eklenmez. |
| Rütbe bonus yüzdesi | `user.getUserById` → `skills.attack.militaryRankPercent` | Mevcut sanitize edilmiş oyuncu örneğinde yüzde alanı `61`; bu alan yoksa sadece `militaryRank` seviyesi kullanılarak yüzde türetilmez, manuel giriş gerekir. |
| Savaş listesi / emirler | `battle.getBattles`, `battleOrder.getByBattle` (`{ battleId, side }`) | Bu prosedürler mevcut `management-intelligence` handler'ında da çağrılıyor. Araç savaş listesini yaklaşık 1 dakika, emirleri 30 saniye önbelleğe alır. Yeni örnek alma scripti gerçek yanıtları alıp kimlikleri ayıklayarak kaydetmek üzere güncellendi; bu çalışma oturumunda WarEra host'una DNS erişimi olmadığı için yeni savaş/emir örnek dosyaları üretilemedi. Yanıt alamama veya alan belirsizliği otomatik bonusu kapalı/elle seçilebilir bırakır. |
| Ülke/ittifak/düşman ilişkileri | `country.getAllCountries`, `country.getCountryById` → `allianceId`, `enemy`, `swornEnemy`, `warsWith` | İttifak/düşman bonusları yalnız alanlar ve ilgili taraf verisi mevcut olduğunda otomatik seçilir; eksik alan varsa elle seçilir. |
| MU emri / karargâh | `battleOrder.getByBattle`, `battle` side `muOrders`, `mu.getById` → `activeUpgradeLevels.headquarters`; `gameConfig.upgradesConfig.headquarters.levels[n].stats.attackBonus` | Emirdeki oyuncu MU'su ve MU seviyesi eşleştirilirse ön doldurulur. Profilde MU üyeliği yoksa veya emir/yanıt belirsizse elle kalır. MU yardımı günlük kullanılabilir yardım sayısı profilden net çıkarılamadığı için varsayılan 0/manual'dır. |
| Üs | `region.getRegionsObject` → bölge `activeUpgradeLevels.base`; `battle.getBattles` → saldıran tarafın bölgesi; `gameConfig.upgradesConfig.base.levels[n].stats.attackBonus` | Saldıran taraf oyuncunun ülkesiyse veya bilinen ittifak tarafıysa bölge seviyesi eşlenir. Başka koşullarda otomatik eklenmez; kullanıcı elle seçebilir. |
| Bölge savaş cezaları | Battle/region alanları | Başkent bağlantısı, işgal ve kaybedilen saldırı bölgesi şartları yerel yanıt şemasından açıkça kanıtlanamadı; otomatik seçilmez ve UI elle seçmeyi söyler. |
| Prestige | `gameConfig` → `user.prestige.skillBonusLevels` | Prestige seviyesi profilden alınıyor ancak bu bonusun seviye tavanını mı yoksa görünen beceri değerini mi değiştirdiği doğrulanmadı. Model mevcut oyuncu beceri seviyelerini temel alır; bonusu ikinci kez eklemez. |

Savaş ve bölge prosedür isimleri mevcut `src/server/handlers/management-intelligence.ts` kullanımından alındı; resmi docs sayfası bu oturumda okunabilir işlem/şema satırları sunmadı. `scripts/sample-damage-tool-data.ts` güncellediğiniz gerçek yanıtları `docs/api-samples/` içine redakte ederek yazar. API yanıtları başarıyla örneklenene kadar yukarıdaki belirsiz otomatik ön dolgular fail-safe şekilde manuel kalmalıdır.

Fiyat tablosundaki ekipman satırlarında `cautious_price = null` hiçbir zaman aday olmaz. Normal modda `confidence=low` ve `source=smoothed` elenir. Ekipman fiyatlarına ve WarEra piyasa fiyatlarına market vergisi varsayılan olarak eklenir (`EQUIPMENT_PRICES_INCLUDE_TAX = false`). Ekipman veri tarihi 10 günden eskiyse arayüz uyarı verir.

## Güvenlik ve dağıtım

Vercel Hobby 12 fonksiyon sınırı dolu olduğundan yeni `api/` entry point eklenmemiştir. Özellik mevcut `/api/warera-proxy?tool=damage` içinde sunucu tarafında çalışır; config 6 saat, piyasa fiyatı 5 dakika, ekipman tablosu 10 dakika bellekte cache edilir. Endpoint IP başına dakikada 12 istekle sınırlandırılır. WarEra anahtarı hiçbir zaman istemciye dönmez.

Vercel ortam değişkenleri:

- `WARERA_API_KEY`: bu araç için sunucu tarafı WarEra API anahtarı. Boşsa eski `WARERA_API_TOKEN` / `WARERA_API_TOKENS` döngüsü kullanılır.
- `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` (veya mevcut Supabase ortam değişkenleri): `price_data` tablosuna sunucu tarafında okuma. Servis rolü anahtarını `NEXT_PUBLIC_` değişkeni olarak tanımlamayın. Yalnız anon key kullanıldığında tabloya SELECT RLS/policy izni verilmelidir.

Arama ve optimizasyon hataları açıkça gösterilir. CPU yoğun tarama tarayıcı Web Worker'ında yürür, iptal/progress destekler ve varsayılan 8 saniyede eldeki en iyi sonucu döndürür. Ekonomi puanları savaşa ayrıldığında enerji/üretim seviyeleri gelir tablosunda puan maliyetiyle taranır; şirket/yönetim için ölçülebilir gelir etkisi olmadığı için mevcut seviyelerinde tutulurlar. 60 puanın üzerinde ekonomi dağılımları kaba adımlarla aranır ve mevcut puan seviyesi ayrıca dahil edilir.
