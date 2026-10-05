/**
 * WarEra (warera.io) Askeri Birlik & Fabrika Raporlama Scripti
 *
 * Bu script, kayıtlı Ordu (Military Unit - MU) ID'leri için:
 * 1. mu.getById -> Ordu detayları ve üye listesi
 * 2. user.getUserLite -> Oyuncu seviye ve aktiflik durumu
 * 3. company.getCompanies -> Oyuncunun fabrika ID'leri (perPage: 13)
 * 4. company.getById -> Fabrika detayları (Otomasyon motoru, Depo, Mola odası, Ürün, Bölge, Durum)
 * çeker; konsola tablo formatında döker ve CSV / JSON dosyası olarak kaydeder.
 *
 * Kullanım:
 * npx tsx scripts/fetch_army_factories_report.ts [MU_ID]
 */

import fs from "fs";
import path from "path";

// Kayıtlı WarEra Askeri Birlik (MU) ID'leri
export const TARGET_MILITARY_UNITS = [
  { id: "69c229c4449287ea1a26a5b3", name: "Turkic Tribe" },
  { id: "689f69064e095b8b9f1b885a", name: "ASHINA" },
  { id: "68bc9bcb4870c8e343e42855", name: "ASHINA Reserve" },
  { id: "690088ce4864a132a2d92d07", name: "Legio Panthera" },
  { id: "6902269a560184d196a6fba8", name: "BEASTs" },
  { id: "6a0f1495478fe2a58d2868d6", name: "Deliler" },
  { id: "693d20605669127e9d45f9b8", name: "DTX" },
];

const BASE_URL = "https://api2.warera.io/trpc";
const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Bekleme yardımcısı
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Rate limit (HTTP 429) duyarlı ve retry-after başlığını dikkate alan GET isteği
 */
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("retry-after");
        const waitSec = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) + 1
          : 5;
        console.warn(
          `[HTTP 429] Rate limit aşıldı. ${waitSec} saniye bekleniyor...`,
        );
        await sleep(waitSec * 1000);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      return json;
    } catch (err: any) {
      if (attempt === retries - 1) throw err;
      await sleep(1500);
    }
  }
}

/**
 * Aşama 1: Ordu Detayları ve Üye Listesini Alma
 */
async function getMilitaryUnit(muId: string) {
  const input = encodeURIComponent(JSON.stringify({ muId }));
  const url = `${BASE_URL}/mu.getById?input=${input}`;
  const json = await fetchWithRetry(url);
  return json?.result?.data;
}

/**
 * Aşama 2: Oyuncu Bilgilerini ve Aktifliğini Alma
 */
async function getUserLite(userId: string) {
  const input = encodeURIComponent(JSON.stringify({ userId }));
  const url = `${BASE_URL}/user.getUserLite?input=${input}`;
  const json = await fetchWithRetry(url);
  return json?.result?.data;
}

/**
 * Aşama 3: Oyuncunun Fabrikalarını (Şirketlerini) Listeleme (Tam sayıyı almak için perPage: 100 ve cursor sayfalandırması)
 */
async function getUserCompanies(userId: string) {
  const allItems: string[] = [];
  let cursor: string | undefined = undefined;

  for (let page = 0; page < 5; page++) {
    const inputObj: Record<string, any> = { userId, perPage: 100 };
    if (cursor) inputObj.cursor = cursor;

    const input = encodeURIComponent(JSON.stringify(inputObj));
    const url = `${BASE_URL}/company.getCompanies?input=${input}`;
    const json = await fetchWithRetry(url);
    const items = json?.result?.data?.items || [];
    if (items.length === 0) break;

    allItems.push(...items);
    if (items.length < 100) break;
    cursor = items[items.length - 1];
  }

  return allItems;
}

/**
 * Aşama 4: Fabrika Detaylarını ve Seviyelerini Çekme (tRPC Batching - 50'şerli ve 600ms gecikmeli)
 */
async function getCompaniesDetailsBatch(companyIds: string[]) {
  if (companyIds.length === 0) return [];

  const results: any[] = [];
  const chunkSize = 50;

  for (let i = 0; i < companyIds.length; i += chunkSize) {
    const chunk = companyIds.slice(i, i + chunkSize);
    const endpoints = chunk.map(() => "company.getById").join(",");

    const batchInput: Record<string, { companyId: string }> = {};
    chunk.forEach((id, idx) => {
      batchInput[String(idx)] = { companyId: id };
    });

    const url = `${BASE_URL}/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
    try {
      const json = await fetchWithRetry(url);
      const batchData = Array.isArray(json) ? json : [json];
      batchData.forEach((item: any) => {
        const d = item?.result?.data;
        if (d) results.push(d);
      });
    } catch (e) {
      console.error("Batch company fetch error:", e);
    }

    if (i + chunkSize < companyIds.length) {
      await sleep(600); // 600ms gecikme
    }
  }

  return results;
}

/**
 * Tek bir ordu için tüm aşamaları çalıştırır ve rapor üretir
 */
export async function reportMilitaryUnit(muId: string, fallbackName?: string) {
  console.log(`\n============================================================`);
  console.log(`[Aşama 1] Ordu verisi çekiliyor: ${muId}`);
  const muData = await getMilitaryUnit(muId);
  const armyName = muData?.name || fallbackName || "Bilinmeyen Ordu";
  const members: string[] = muData?.members || [];
  console.log(`Ordu Adı: ${armyName} | Toplam Üye Sayısı: ${members.length}`);

  console.log(`[Aşama 2 & 3] Oyuncular ve fabrika listeleri çekiliyor...`);
  const playersReport: any[] = [];
  const allFactoriesReport: any[] = [];

  let activePlayersCount = 0;
  let activeCitizensCount = 0;
  let totalFactoriesCount = 0;
  let totalEnginePower = 0;

  for (let i = 0; i < members.length; i++) {
    const userId = members[i];
    await sleep(150); // Rate pacing

    let userProfile: any = null;
    try {
      userProfile = await getUserLite(userId);
    } catch (e) {
      console.warn(`User lite fetch failed for ${userId}`);
    }

    const username = userProfile?.username || `Oyuncu_${userId.slice(-5)}`;
    const level = userProfile?.leveling?.level || 1;
    const lastActive =
      userProfile?.dates?.lastConnectionAt || userProfile?.updatedAt || "";
    const lastActiveMs = lastActive ? new Date(lastActive).getTime() : 0;

    // Aktiflik Kriteri: isActive === true VEYA son 3 gün içerisinde giriş yapmış olmak
    const isActive = Boolean(
      userProfile?.isActive === true ||
      (lastActiveMs > 0 &&
        Date.now() - lastActiveMs <= 3 * 24 * 60 * 60 * 1000),
    );

    // Aktif Vatandaş Kriteri: Aktif ve Seviye >= 10
    const isCitizen = isActive && level >= 10;

    if (isActive) activePlayersCount++;
    if (isCitizen) activeCitizensCount++;

    // Fabrikaları listele
    let companyIds: string[] = [];
    try {
      companyIds = await getUserCompanies(userId);
    } catch (e) {
      console.warn(`Companies fetch failed for ${userId}`);
    }

    // Fabrika detaylarını çek
    let factoriesDetails: any[] = [];
    if (companyIds.length > 0) {
      factoriesDetails = await getCompaniesDetailsBatch(companyIds);
    }

    let userEngineTotal = 0;
    const userFactories = factoriesDetails.map((f: any, idx: number) => {
      const autoLevel = Number(
        f?.activeUpgradeLevels?.automatedEngine ??
          f?.upgradesV2?.upgrades?.automatedEngine?.level ??
          0,
      );
      userEngineTotal += autoLevel;

      const storageLevel = Number(
        f?.activeUpgradeLevels?.storage ??
          f?.upgradesV2?.upgrades?.storage?.level ??
          1,
      );
      const breakRoomLevel = Number(
        f?.activeUpgradeLevels?.breakRoom ??
          f?.upgradesV2?.upgrades?.breakRoom?.level ??
          0,
      );
      const status = String(
        f?.upgradesV2?.upgrades?.storage?.status ??
          (f?.isOperational !== false ? "active" : "inactive"),
      );

      const itemCode = f?.itemCode || "bilinmiyor";
      const name = f?.name || `Fabrika #${idx + 1}`;

      allFactoriesReport.push({
        "Ordu Adı": armyName,
        Sahibi: username,
        "Fabrika Adı": name,
        "Ürün Türü": itemCode,
        "Motor Seviyesi (Otomasyon)": autoLevel,
        "Depo Seviyesi": storageLevel,
        "Mola Odası": breakRoomLevel,
        Bölge: f?.region || "-",
        Durum: status === "inactive" ? "Pasif" : "Aktif",
      });

      return {
        id: f?._id,
        name,
        itemCode,
        automatedLevel: autoLevel,
        storageLevel,
        breakRoomLevel,
        status,
        region: f?.region,
      };
    });

    totalFactoriesCount += companyIds.length;
    totalEnginePower += userEngineTotal;

    playersReport.push({
      "Ordu Adı": armyName,
      "Kullanıcı Adı": username,
      Seviye: level,
      "Aktiflik Durumu": isActive ? "Aktif" : "Pasif",
      "Aktif Vatandaş (Lv>=10)": isCitizen ? "Evet" : "Hayır",
      "Sahip Olduğu Fabrika Sayısı": companyIds.length,
      "Toplam Motor Seviyesi": userEngineTotal,
      "Son Giriş": lastActive
        ? new Date(lastActive).toLocaleString("tr-TR")
        : "-",
    });

    process.stdout.write(
      `\rİlerliyor: [${i + 1}/${members.length}] ${username}...`,
    );
  }

  console.log(`\nTamamlandı!\n`);

  // 1. Ordu Bazında Özet
  const armySummary = [
    {
      "Ordu Adı": armyName,
      "Toplam Oyuncu": members.length,
      "Aktif Oyuncu": activePlayersCount,
      "Aktif Vatandaş (Seviye >= 10)": activeCitizensCount,
      "Toplam Fabrika": totalFactoriesCount,
      "Toplam Motor Gücü": totalEnginePower,
    },
  ];

  console.log(`\n================== 1. ORDU BAZINDA ÖZET ==================`);
  console.table(armySummary);

  console.log(
    `\n================== 2. OYUNCU BAZINDA DETAY (İlk 15) ==================`,
  );
  console.table(playersReport.slice(0, 15));

  console.log(
    `\n================== 3. FABRİKA BAZINDA DETAY (İlk 15) ==================`,
  );
  console.table(allFactoriesReport.slice(0, 15));

  // CSV Kaydetme
  const csvRows: string[][] = [
    [
      "Ordu Adi",
      "Kullanici Adi",
      "Seviye",
      "Aktiflik Durumu",
      "Aktif Vatandas",
      "Fabrika Sayisi",
      "Toplam Motor Seviyesi",
      "Fabrika Adi",
      "Urun Turu",
      "Motor Seviyesi",
      "Depo Seviyesi",
      "Mola Odasi",
      "Bolge",
      "Durum",
    ],
  ];

  if (allFactoriesReport.length === 0) {
    playersReport.forEach((p) => {
      csvRows.push([
        `"${p["Ordu Adı"]}"`,
        `"${p["Kullanıcı Adı"]}"`,
        String(p["Seviye"]),
        `"${p["Aktiflik Durumu"]}"`,
        `"${p["Aktif Vatandaş (Lv>=10)"]}"`,
        String(p["Sahip Olduğu Fabrika Sayısı"]),
        String(p["Toplam Motor Seviyesi"]),
        '""',
        '""',
        "0",
        "0",
        "0",
        '""',
        '""',
      ]);
    });
  } else {
    allFactoriesReport.forEach((f) => {
      csvRows.push([
        `"${f["Ordu Adı"]}"`,
        `"${f["Sahibi"]}"`,
        '""',
        '""',
        '""',
        '""',
        '""',
        `"${f["Fabrika Adı"].replace(/"/g, '""')}"`,
        `"${f["Ürün Türü"]}"`,
        String(f["Motor Seviyesi (Otomasyon)"]),
        String(f["Depo Seviyesi"]),
        String(f["Mola Odası"]),
        `"${f["Bölge"]}"`,
        `"${f["Durum"]}"`,
      ]);
    });
  }

  const exportDir = path.resolve(process.cwd(), "reports");
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const safeName = armyName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const csvPath = path.join(exportDir, `${safeName}_fabrika_raporu.csv`);
  fs.writeFileSync(
    csvPath,
    "\uFEFF" + csvRows.map((r) => r.join(";")).join("\r\n"),
    "utf8",
  );

  const jsonPath = path.join(exportDir, `${safeName}_fabrika_raporu.json`);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        summary: armySummary[0],
        players: playersReport,
        factories: allFactoriesReport,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`\n📁 Raporlar kaydedildi:`);
  console.log(`- CSV : ${csvPath}`);
  console.log(`- JSON: ${jsonPath}`);

  return {
    summary: armySummary[0],
    players: playersReport,
    factories: allFactoriesReport,
  };
}

// Komut satırı çalıştırma kontrolü
if (
  process.argv[1] &&
  process.argv[1].endsWith("fetch_army_factories_report.ts")
) {
  const argMuId = process.argv[2] || TARGET_MILITARY_UNITS[0].id;
  reportMilitaryUnit(argMuId).catch(console.error);
}
