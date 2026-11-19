# Bağış Takibi'ni yeniden etkinleştirme

Bağış Takibi arayüzü ve sunucu tarafındaki hesaplama akışları silinmedi; sayfa şu anda uyarı gösteriyor ve bunları çağırmıyor. Bu dosya yeniden etkinleştirme noktalarını kaydeder.

## Arayüz

`src/components/ManagementDonationTrackingSection.tsx` bağış tablosu, oyuncu/şirket hesaplama pencereleri ve dışa aktarma işlemlerini içerir. `src/services/wareraApi.ts` içindeki `fetchManagementOverview`, `fetchTrackedPlayerDirectory` ve şirket hesaplama fonksiyonlarını kullanır.

`src/App.tsx` içinde:

1. `ManagementDonationTrackingSection` için olan `React.lazy` importunu yeniden ekleyin.
2. `activeTab === 'mgmtDonations'` dalındaki pasiflik uyarısını bileşen çağrısıyla değiştirin:

   ```tsx
   <ManagementDonationTrackingSection
     currentMuId={muId}
     onSelectArmy={handleMuIdChange}
   />
   ```

3. Bağış sayfasının diğer sayfaların askeri birlik veri çağrılarını başlatmaması için `shouldFetchArmyData` kontrolünü koruyun.

## Snapshot ve cron

`src/server/services/daily-damage.ts` içindeki `snapshotAllArmies` işlevi `captureDonationTargets` seçeneğini ve bağış hedefi/ödeme bakiyesi hesaplamalarını korur. Şu an tüm aktif cron çağrıları bu seçeneği vermediğinden şirket geliri ve `transaction.getPaginatedTransactions` istekleri yapılmaz; yeni snapshot'larda `donationTargetSnapshot`, `donationBalance` ve `donationBalanceDate` alanları da temizlenir.

Cron ile bağış snapshot'larını yeniden başlatmak için `captureDonationTargets: true` seçeneğini şu çağrılara ekleyin:

- `api/cron/record-daily-damage.ts` içindeki `snapshotAllArmies()` çağrısı
- `server.ts` içindeki `/api/cron/record-daily-damage` çağrısı
- `server.ts` içindeki yerel 02:55 zamanlayıcısının `snapshotAllArmies()` çağrısı

Tüm çağrılar `src/server/services/daily-damage.ts` içindeki ortak işlevi kullanır. Önceden kaydedilmiş snapshot alanları, normal 30 günlük saklama süresi boyunca eski tarihlerde kalabilir; yeni pasif dönem kayıtlarına eklenmez.

## Yönetim özeti API'si

`src/server/handlers/management-overview.ts` içindeki bağış işlemi/otomatik hedef yenileme kodu ve `src/components/ManagementDonationTrackingSection.tsx` içindeki istekler korunmuştur. Yönetim özeti çağrısında `donations=false` verilmesi bağış işlem sorgularını ve hedef yenilemeyi kapatır; bağış sayfası yeniden açıldığında bileşen varsayılan olarak bağış verilerini ister.
