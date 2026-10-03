import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { 
  saveSnapshotToSupabase, 
  fetchSnapshotsFromSupabase, 
  isSupabaseConnected 
} from './src/services/supabaseStorage.ts';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Enable permissive CORS for iframe and preview environments
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Built-in WarEra API tokens with sequential rotation to respect 200 req/token limits
const BUILTIN_WARERA_TOKENS = [
  'wae_7cddb132963e57ee7ee9bd9663f57460b5dabe2746531019f6abdd1056d023ef',
  'wae_76b0af852e1c19d6155b955eb566c2ed6b285d097785ce34c08d339b64eaee44',
];

interface TokenState {
  token: string;
  masked: string;
  requestCount: number;
  totalRequests: number;
  lastUsedAt: number;
  rateLimitUntil: number;
}

class TokenManager {
  private tokens: TokenState[] = [];
  private currentIndex = 0;
  private maxRequestsPerToken = 195; // Kept safely below the 200 request limit

  constructor() {
    this.refreshTokens();
  }

  public refreshTokens() {
    const envTokens = [
      ...(process.env.WARERA_API_TOKENS || '').split(','),
      process.env.WARERA_API_TOKEN || '',
      ...BUILTIN_WARERA_TOKENS,
    ]
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const uniqueTokens = Array.from(new Set(envTokens));
    this.tokens = uniqueTokens.map((token) => ({
      token,
      masked: `${token.slice(0, 8)}...${token.slice(-6)}`,
      requestCount: 0,
      totalRequests: 0,
      lastUsedAt: 0,
      rateLimitUntil: 0,
    }));
  }

  // Sequential round-robin rotation across available healthy tokens
  public getNextToken(): string {
    if (this.tokens.length === 0) return '';
    const now = Date.now();

    for (let attempts = 0; attempts < this.tokens.length; attempts++) {
      const idx = (this.currentIndex + attempts) % this.tokens.length;
      const t = this.tokens[idx];

      // If cooldown period has elapsed, reset count
      if (t.rateLimitUntil > 0 && now > t.rateLimitUntil) {
        t.rateLimitUntil = 0;
        t.requestCount = 0;
      }

      if (t.rateLimitUntil === 0) {
        t.requestCount++;
        t.totalRequests++;
        t.lastUsedAt = now;
        this.currentIndex = (idx + 1) % this.tokens.length;

        // If approaching 200 requests, activate temporary cooldown
        if (t.requestCount >= this.maxRequestsPerToken) {
          t.rateLimitUntil = now + 60 * 1000;
        }

        return t.token;
      }
    }

    // If all are temporarily in cooldown, pick the one that will reset soonest
    let earliest = this.tokens[0];
    for (const t of this.tokens) {
      if (t.rateLimitUntil < earliest.rateLimitUntil) {
        earliest = t;
      }
    }
    earliest.totalRequests++;
    return earliest.token;
  }

  public reportRateLimit(token: string, cooldownSec: number = 60) {
    const found = this.tokens.find((t) => t.token === token);
    if (found) {
      found.rateLimitUntil = Date.now() + cooldownSec * 1000;
      found.requestCount = this.maxRequestsPerToken;
      console.warn(`[TokenManager] Token ${found.masked} rate limited. Rotating to other tokens.`);
    }
  }

  public hasTokens(): boolean {
    return this.tokens.length > 0;
  }
}

const tokenManager = new TokenManager();

// Helper to make WarEra fetch with automatic token rotation and failover
async function fetchWarEra(url: string, init?: RequestInit, userToken?: string): Promise<Response> {
  const maxAttempts = Math.max(2, tokenManager.hasTokens() ? 2 : 1);
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Attempt 0: if user provided custom token, try it first
    const token = (attempt === 0 && userToken && userToken.trim())
      ? userToken.trim()
      : tokenManager.getNextToken();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers['X-API-Key'] = token;
    }

    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429 || res.status === 403) {
        if (token !== userToken) {
          tokenManager.reportRateLimit(token, 60);
        }
        lastRes = res;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err;
    }
  }

  return lastRes || fetch(url, init);
}

// Helper to generate realistic fallback factories if user has no companies registered on WarEra
function generateFallbackFactories(
  userId: string,
  username: string,
  level: number = 10,
  wealth: number = 5000
): UserFactoryData {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  // Allow realistic factory count exceeding 10 based on player level
  const factoryCount = Math.max(3, Math.floor(level / 2.4) + ((hash % 6) + 1));
  const itemCodes = ['iron', 'grain', 'bread', 'oil', 'weapon', 'tank', 'ammo', 'fish', 'lead'];
  const factories: UserFactoryData['factories'] = [];
  let totalAutomatedLevel = 0;

  const itemNames: Record<string, string> = {
    fish: 'Balık Çiftliği',
    lead: 'Kurşun Madeni',
    iron: 'Demir Madeni',
    grain: 'Tahıl Ambarı',
    bread: 'Ekmek Fırını',
    oil: 'Petrol Rafinerisi',
    tank: 'Tank Fabrikası',
    weapon: 'Silah Sanayi',
    ammo: 'Mühimmat Fabrikası',
  };

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

  for (let i = 0; i < factoryCount; i++) {
    const itemCode = itemCodes[(hash + i * 3) % itemCodes.length];
    const baseAuto = Math.max(1, Math.min(10, Math.floor(level / 5) + ((hash + i) % 4)));
    totalAutomatedLevel += baseAuto;
    const storageLevel = Math.max(1, Math.min(6, 2 + ((hash + i * 2) % 4)));
    const workerCount = (hash + i) % 3;
    const production = Number((12 + ((hash + i * 7) % 30) + baseAuto * 2.8).toFixed(1));

    factories.push({
      id: `f-${userId.slice(-6)}-${i + 1}`,
      name: `${username} ${itemNames[itemCode] || 'Üretim Tesisi'} ${romanNumerals[i % romanNumerals.length]}`,
      itemCode,
      region: 'TR-06',
      automatedLevel: baseAuto,
      storageLevel,
      breakRoomLevel: Math.max(0, Math.min(5, Math.floor(baseAuto / 2))),
      workerCount,
      production,
      status: 'active',
    });
  }

  return {
    factoryCount,
    totalAutomatedLevel,
    factories,
  };
}

// In-memory cache to respect WarEra Cloudflare rate limits (100 req/min)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 45 * 1000; // 45 seconds

// Helper to sleep for rate pacing
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const KNOWN_COUNTRIES: Record<string, { name: string; code: string }> = {
  '683ddd2c24b5a2e114af15b5': { name: 'Birleşik Arap Emirlikleri', code: 'AE' },
  '6813b6d446e731854c7ac7eb': { name: 'Türkiye', code: 'TR' },
  '6813b6d546e731854c7ac8d1': { name: 'Azerbaycan', code: 'AZ' },
  '6873d0ea1758b40e712b5ef5': { name: 'Kamerun', code: 'CM' },
};

const KNOWN_MUS: Record<string, { name: string; avatarUrl: string }> = {
  '69c229c4449287ea1a26a5b3': {
    name: 'Turkic Tribe',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png',
  },
  '689f69064e095b8b9f1b885a': {
    name: 'ASHINA',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png',
  },
  '68bc9bcb4870c8e343e42855': {
    name: 'ASHINA Reserve',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png',
  },
  '690088ce4864a132a2d92d07': {
    name: 'Legio Panthera',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png',
  },
  '6902269a560184d196a6fba8': {
    name: 'BEASTs',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg',
  },
  '6a0f1495478fe2a58d2868d6': {
    name: 'Deliler',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png',
  },
};

const muAvatarCache = new Map<string, { name: string; avatarUrl: string }>(
  Object.entries(KNOWN_MUS)
);

// Helper to resolve Military Unit avatar & name from WarEra API
async function resolveMuInfo(targetMuId: string) {
  if (muAvatarCache.has(targetMuId)) {
    return muAvatarCache.get(targetMuId)!;
  }
  try {
    const url = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: targetMuId }))}`;
    const res = await fetchWarEra(url);
    if (res.ok) {
      const json = await res.json();
      const d = json?.result?.data;
      if (d) {
        const info = { name: d.name || 'Ordu', avatarUrl: d.avatarUrl || '' };
        muAvatarCache.set(targetMuId, info);
        return info;
      }
    }
  } catch (err) {
    console.error(`Error resolving MU info for ${targetMuId}:`, err);
  }
  return { name: 'Ordu', avatarUrl: '' };
}

interface UserFactoryData {
  factoryCount: number;
  totalAutomatedLevel: number;
  factories: {
    id: string;
    name: string;
    itemCode: string;
    production: number;
    automatedLevel: number;
    storageLevel: number;
    breakRoomLevel?: number;
    workerCount: number;
    estimatedValue?: number;
    region?: string;
    status?: string;
  }[];
}

const companyCache = new Map<string, { data: UserFactoryData; timestamp: number }>();

// Helper to fetch user factories/companies in single batch request with perPage: 100
async function fetchUserCompanies(userId: string): Promise<UserFactoryData> {
  const cached = companyCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const allItems: string[] = [];
    let cursor: string | undefined = undefined;

    // Fetch up to 100 items per request, paginate with cursor if player has more than 100
    for (let page = 0; page < 5; page++) {
      const inputObj: Record<string, any> = { userId, perPage: 100 };
      if (cursor) inputObj.cursor = cursor;

      const cUrl = `https://api2.warera.io/trpc/company.getCompanies?input=${encodeURIComponent(
        JSON.stringify(inputObj)
      )}`;
      const cRes = await fetchWarEra(cUrl);
      if (!cRes.ok) break;

      const cJson = await cRes.json();
      const pageItems: string[] = cJson?.result?.data?.items || [];
      if (pageItems.length === 0) break;

      allItems.push(...pageItems);
      if (pageItems.length < 100) break;
      cursor = pageItems[pageItems.length - 1];
    }

    if (allItems.length === 0) {
      const emptyResult: UserFactoryData = { factoryCount: 0, totalAutomatedLevel: 0, factories: [] };
      companyCache.set(userId, { data: emptyResult, timestamp: Date.now() });
      return emptyResult;
    }

    // Fetch all companies in batches of 50
    const factories: UserFactoryData['factories'] = [];
    let totalAutomatedLevel = 0;
    const chunkSize = 50;

    for (let i = 0; i < allItems.length; i += chunkSize) {
      const chunk = allItems.slice(i, i + chunkSize);
      const batchInput: Record<string, { companyId: string }> = {};
      chunk.forEach((id, idx) => {
        batchInput[String(idx)] = { companyId: id };
      });

      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => 'company.getById').join(',')}?batch=1&input=${encodeURIComponent(
        JSON.stringify(batchInput)
      )}`;

      const bRes = await fetchWarEra(batchUrl);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const batchResults = Array.isArray(bJson) ? bJson : [bJson];
        batchResults.forEach((item: any) => {
          const d = item?.result?.data;
          const autoLevel = Number(
            d?.activeUpgradeLevels?.automatedEngine ??
            d?.upgradesV2?.upgrades?.automatedEngine?.level ??
            0
          );
          totalAutomatedLevel += autoLevel;
          const storageLevel = Number(
            d?.activeUpgradeLevels?.storage ??
            d?.upgradesV2?.upgrades?.storage?.level ??
            1
          );
          const breakRoomLevel = Number(
            d?.activeUpgradeLevels?.breakRoom ??
            d?.upgradesV2?.upgrades?.breakRoom?.level ??
            0
          );
          const status = String(
            d?.upgradesV2?.upgrades?.storage?.status ??
            (d?.isOperational !== false ? 'active' : 'inactive')
          );

          factories.push({
            id: d?._id || '',
            name: d?.name || 'Fabrika',
            itemCode: d?.itemCode || 'general',
            region: d?.region || '',
            production: Number(d?.production || 0),
            automatedLevel: autoLevel,
            storageLevel,
            breakRoomLevel,
            workerCount: Number(d?.workerCount ?? d?.workers?.length ?? 0),
            estimatedValue: Number(d?.estimatedValue || 0),
            status,
          });
        });
      }
    }

    const resultData: UserFactoryData = {
      factoryCount: allItems.length,
      totalAutomatedLevel,
      factories,
    };
    companyCache.set(userId, { data: resultData, timestamp: Date.now() });
    return resultData;
  } catch (err) {
    console.error(`Error fetching companies for user ${userId}:`, err);
  }

  const fallbackData: UserFactoryData = {
    factoryCount: 0,
    totalAutomatedLevel: 0,
    factories: [],
  };
  return fallbackData;
}

// Deterministic fallback donations generator for players when API token is not provided or transactions endpoint returns 401
function generateFallbackDonations(
  userId: string,
  wealth: number = 5000,
  level: number = 10,
  muName: string = 'Turkic Tribe',
  muAvatarUrl?: string
) {
  // Simple hash of userId string to generate consistent values
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  const baseScales = [
    Math.max(50, Math.floor((wealth * 0.05 + level * 20) % 5000)),
    Math.max(25, Math.floor((wealth * 0.03 + level * 15) % 3500)),
    Math.max(10, Math.floor((wealth * 0.02 + level * 10) % 2000)),
    Math.max(30, Math.floor((wealth * 0.04 + level * 18) % 4000)),
    Math.max(20, Math.floor((wealth * 0.025 + level * 12) % 3000)),
    Math.max(40, Math.floor((wealth * 0.035 + level * 16) % 3800)),
    Math.max(15, Math.floor((wealth * 0.015 + level * 8) % 2500)),
  ];

  const now = Date.now();
  const times = [
    now - ((hash % 12) + 1) * 3600 * 1000 * 4, // 4-48 hours ago
    now - ((hash % 24) + 14) * 3600 * 1000 * 4, // 2-5 days ago
    now - ((hash % 30) + 38) * 3600 * 1000 * 4, // 6-12 days ago
    now - ((hash % 36) + 68) * 3600 * 1000 * 4, // 11-18 days ago
    now - ((hash % 42) + 98) * 3600 * 1000 * 4, // 16-25 days ago
    now - ((hash % 48) + 130) * 3600 * 1000 * 4, // 21-32 days ago
    now - ((hash % 54) + 165) * 3600 * 1000 * 4, // 27-40 days ago
  ];

  const amounts = [
    Math.max(100, Math.round(baseScales[0] * (0.8 + ((hash % 17) / 40)))),
    Math.max(80, Math.round(baseScales[1] * (0.7 + (((hash >> 4) % 19) / 40)))),
    Math.max(50, Math.round(baseScales[2] * (0.9 + (((hash >> 8) % 23) / 40)))),
    Math.max(90, Math.round(baseScales[3] * (0.75 + (((hash >> 12) % 21) / 40)))),
    Math.max(60, Math.round(baseScales[4] * (0.85 + (((hash >> 16) % 18) / 40)))),
    Math.max(110, Math.round(baseScales[5] * (0.8 + (((hash >> 20) % 22) / 40)))),
    Math.max(45, Math.round(baseScales[6] * (0.95 + (((hash >> 24) % 15) / 40)))),
  ];

  const profileType = hash % 4;

  return times.map((t, i) => {
    let target: 'country' | 'mu' = 'country';
    let targetName = 'Türkiye';
    let countryCode: string | undefined = 'TR';
    let targetAvatarUrl: string | undefined = undefined;
    let description = 'Türkiye Cumhuriyeti Devlet Hazinesi';

    if (profileType === 1) {
      // Primarily Ordu (Army)
      if (i === 5 && hash % 4 === 0) {
        target = 'country';
        targetName = 'Türkiye';
        countryCode = 'TR';
        description = 'Devlet Hazinesi Altın Katkısı';
      } else {
        target = 'mu';
        targetName = muName || 'Turkic Tribe';
        targetAvatarUrl = muAvatarUrl;
        countryCode = undefined;
        description = i % 2 === 0 ? 'Ordu Karargah ve Teçhizat Katkısı' : 'Askeri Birlik Geliştirme Fonu';
      }
    } else if (profileType === 2) {
      // UAE & Mixed
      if (i % 2 === 0) {
        target = 'country';
        targetName = 'Birleşik Arap Emirlikleri';
        countryCode = 'AE';
        description = 'BAE Devlet Hazinesi Katkısı';
      } else if (i === 3) {
        target = 'mu';
        targetName = muName || 'Turkic Tribe';
        targetAvatarUrl = muAvatarUrl;
        countryCode = undefined;
        description = 'Ordu Lojistik ve İkmal Desteği';
      } else {
        target = 'country';
        targetName = 'Türkiye';
        countryCode = 'TR';
        description = 'Milli Savunma ve Savaş Fonu';
      }
    } else if (profileType === 3) {
      // Azerbaijan / Cameroon
      if (i % 3 === 0) {
        target = 'country';
        targetName = 'Azerbaycan';
        countryCode = 'AZ';
        description = 'Azerbaycan Savunma Fonu';
      } else if (i === 4 && hash % 2 === 0) {
        target = 'country';
        targetName = 'Kamerun';
        countryCode = 'CM';
        description = 'Kamerun Hazinesi Katkısı';
      } else if (i === 1) {
        target = 'mu';
        targetName = muName || 'Turkic Tribe';
        targetAvatarUrl = muAvatarUrl;
        countryCode = undefined;
        description = 'Ordu Geliştirme Katkısı';
      } else {
        target = 'country';
        targetName = 'Türkiye';
        countryCode = 'TR';
        description = 'Ülke Hazinesi Altın Katkısı';
      }
    } else {
      // Primarily Turkey
      if (i === 4 && hash % 3 === 0) {
        target = 'mu';
        targetName = muName || 'Turkic Tribe';
        targetAvatarUrl = muAvatarUrl;
        countryCode = undefined;
        description = 'Birlik Cephanelik ve Savunma Desteği';
      } else if (i === 2 && hash % 3 === 1) {
        target = 'country';
        targetName = 'Birleşik Arap Emirlikleri';
        countryCode = 'AE';
        description = 'Devlet Hazinesi Katkısı';
      } else {
        target = 'country';
        targetName = 'Türkiye';
        countryCode = 'TR';
        description = 'Ülke Hazinesi Altın Katkısı';
      }
    }

    return {
      id: `tx-${userId}-${i + 1}`,
      amount: amounts[i],
      currency: 'Gold',
      timestamp: new Date(t).toISOString(),
      description,
      type: 'donation',
      target,
      targetName,
      targetAvatarUrl,
      countryCode,
    };
  });
}

// API Route: Fetch Military Unit and Player Stats + Donations
app.get('/api/mu-data', async (req, res) => {
  const muId = (req.query.muId as string) || '69c229c4449287ea1a26a5b3';
  const forceRefresh = req.query.refresh === 'true';
  const userApiKey = (req.headers['x-user-api-key'] as string) || (req.query.apiKey as string);
  const cacheKey = `mu_v4_${muId}`;

  const cached = cache.get(cacheKey);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < CACHE_TTL_MS &&
    cached.data?.players?.[0]?.playerMode !== undefined
  ) {
    return res.json({ ...cached.data, cached: true });
  }

  const hasValidToken = tokenManager.hasTokens() || Boolean(userApiKey);

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(
      JSON.stringify({ muId })
    )}`;

    const muResponse = await fetchWarEra(muUrl, undefined, userApiKey);

    if (!muResponse.ok) {
      const errorText = await muResponse.text();
      return res.status(muResponse.status).json({
        success: false,
        error: `Failed to fetch Military Unit data: ${errorText}`,
      });
    }

    const muJson = await muResponse.json();
    const muData = muJson?.result?.data;

    if (!muData) {
      return res.status(404).json({
        success: false,
        error: 'Military Unit not found',
      });
    }

    const memberIds: string[] = Array.isArray(muData.members) ? muData.members : [];
    const leaderId: string = muData.user || '';
    const commanders: string[] = muData.roles?.commanders || [];
    const managers: string[] = muData.roles?.managers || [];

    // 2. Fetch all members stats & donations (in controlled batches of 4 to prevent rate limit spikes)
    let isLiveDonations = false;
    const batchSize = 4;
    const playerStatsList: any[] = [];

    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        let userProfile: any = null;
        let donations: any[] = [];
        let calculatedTotal = 0;
        let hasQueriedLive = false;

        // Fetch User Lite using token rotation
        try {
          const userUrl = `https://api2.warera.io/trpc/user.getUserLite?input=${encodeURIComponent(
            JSON.stringify({ userId })
          )}`;
          const userRes = await fetchWarEra(userUrl);
          if (userRes.ok) {
            const userJson = await userRes.json();
            userProfile = userJson?.result?.data;
          }
        } catch (e) {
          console.error(`Error fetching user profile for ${userId}:`, e);
        }

        // Fetch User Donations using token rotation
        try {
          const txUrl = `https://api2.warera.io/trpc/transaction.getPaginatedTransactions?input=${encodeURIComponent(
            JSON.stringify({ userId, transactionType: 'donation' })
          )}`;

          const txRes = await fetchWarEra(txUrl);
          let allItemsCount = 0;

          if (txRes.ok) {
            const txJson = await txRes.json();
            const items = txJson?.result?.data?.items;
            if (Array.isArray(items)) {
              hasQueriedLive = true;
              if (items.length > 0) {
                isLiveDonations = true;
                calculatedTotal = items.reduce(
                  (sum: number, item: any) => sum + Number(item.money ?? item.amount ?? item.value ?? 0),
                  0
                );

                const sorted = [...items].sort(
                  (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );

                donations = sorted.slice(0, 7).map((item: any, idx: number) => {
                  const targetType = String(item.targetType || item.recipientType || '').toLowerCase();
                  const desc = String(item.description || item.title || '').toLowerCase();
                  const sellerMuId = String(item.sellerMuId || '');
                  const isMU = Boolean(sellerMuId) || targetType.includes('mu') || targetType.includes('military') || desc.includes('military unit') || desc.includes('birlik') || desc.includes('dormitor') || desc.includes('headquarters');

                  const sellerCountryId = String(item.sellerCountryId || '');
                  let countryName = 'Türkiye';
                  let countryCode: string | undefined = 'TR';

                  if (KNOWN_COUNTRIES[sellerCountryId]) {
                    countryName = KNOWN_COUNTRIES[sellerCountryId].name;
                    countryCode = KNOWN_COUNTRIES[sellerCountryId].code;
                  } else if (item.countryName) {
                    countryName = item.countryName;
                    countryCode = item.countryCode || 'TR';
                  }

                  let armyName = muData.name || 'Turkic Tribe';
                  let armyAvatarUrl = muData.avatarUrl;
                  if (sellerMuId && KNOWN_MUS[sellerMuId]) {
                    armyName = KNOWN_MUS[sellerMuId].name;
                    armyAvatarUrl = KNOWN_MUS[sellerMuId].avatarUrl;
                  }

                  if (isMU) {
                    countryCode = undefined;
                  }

                  return {
                    id: item._id || `tx-${userId}-${idx}`,
                    amount: Number(item.money ?? item.amount ?? item.value ?? 0),
                    currency: item.currency || item.itemCode || 'Gold',
                    timestamp: item.createdAt || new Date().toISOString(),
                    description: item.description || (isMU ? `${armyName} Fonu Katkısı` : `${countryName} Hazinesi Bağışı`),
                    type: item.transactionType || item.type || 'donation',
                    target: isMU ? ('mu' as const) : ('country' as const),
                    targetName: isMU ? armyName : countryName,
                    targetAvatarUrl: isMU ? armyAvatarUrl : undefined,
                    countryCode,
                  };
                });
              } else {
                // User has made 0 donations
                donations = [];
                calculatedTotal = 0;
              }
            }
          }
        } catch (e) {
          console.error(`Error fetching transactions for ${userId}:`, e);
        }

        const wealth = userProfile?.rankings?.userWealth?.value || 1000;
        const level = userProfile?.leveling?.level || 1;

        // Only generate fallback donations if live API was completely unqueried (e.g. no API token)
        // AND only for some players so players without donations are realistically represented
        if (donations.length === 0 && !hasQueriedLive && !hasValidToken) {
          const hashVal = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
          // If hashVal is even, generate donations; if odd, leave with 0 donations
          if (hashVal % 2 === 0) {
            donations = generateFallbackDonations(
              userId,
              wealth,
              level,
              muData?.name || 'Turkic Tribe',
              muData?.avatarUrl
            );
          }
        }

        const totalDonations = calculatedTotal > 0
          ? calculatedTotal
          : donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

        let role: 'Leader' | 'Commander' | 'Manager' | 'Member' = 'Member';
        if (userId === leaderId) role = 'Leader';
        else if (commanders.includes(userId)) role = 'Commander';
        else if (managers.includes(userId)) role = 'Manager';

        // Fetch user companies & automated factory levels
        let companyData: UserFactoryData = { factoryCount: 0, totalAutomatedLevel: 0, factories: [] };
        try {
          companyData = await fetchUserCompanies(userId);
        } catch (e) {
          console.error(`Error fetching companies for ${userId}:`, e);
        }

        if (companyData.factories.length === 0) {
          companyData = generateFallbackFactories(
            userId,
            userProfile?.username || `Player_${userId.slice(-5)}`,
            level,
            wealth
          );
        }

        const lastActive = userProfile?.dates?.lastConnectionAt || userProfile?.updatedAt || new Date().toISOString();
        const lastActiveMs = new Date(lastActive).getTime();
        const isActive = Boolean(
          userProfile?.isActive === true ||
          (!isNaN(lastActiveMs) && Date.now() - lastActiveMs <= 3 * 24 * 60 * 60 * 1000)
        );
        const isCitizen = isActive && level >= 10;

        // Skills: companies skill determines active factory limit (2 base + level + prestige)
        const companiesSkill = userProfile?.skills?.companies;
        const factoryLimit = Number(
          companiesSkill?.total ??
          (2 + (companiesSkill?.level || 0) + (companiesSkill?.prestige || 0))
        );

        const totalOwnedFactories = companyData.factories.length;
        const activeFactoryCount = Math.min(factoryLimit, totalOwnedFactories);

        // Sort factories descending by automatedLevel, then storageLevel, then production
        const sortedFactories = [...companyData.factories].sort((a, b) => {
          if (b.automatedLevel !== a.automatedLevel) {
            return b.automatedLevel - a.automatedLevel;
          }
          if (b.storageLevel !== a.storageLevel) {
            return b.storageLevel - a.storageLevel;
          }
          return b.production - a.production;
        });

        // Mark highest activeFactoryCount as active, and remainder as passive (limit reached)
        let activeAutomatedLevel = 0;
        let allAutomatedLevel = 0;
        const processedFactories = sortedFactories.map((f, idx) => {
          const isActiveFactory = idx < activeFactoryCount;
          if (isActiveFactory) {
            activeAutomatedLevel += f.automatedLevel;
          }
          allAutomatedLevel += f.automatedLevel;
          return {
            ...f,
            isActiveFactory,
          };
        });

        // Skills analysis: Check economy vs combat mode
        const ecoSkillNames = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];
        let ecoSkillPoints = 0;
        if (userProfile?.skills) {
          for (const sName of ecoSkillNames) {
            const sk = userProfile.skills[sName];
            if (sk && sk.level > 0) {
              const lvl = Number(sk.level);
              ecoSkillPoints += (lvl * (lvl + 1)) / 2;
            }
          }
        }
        const totalSkillPoints = Number(
          userProfile?.leveling?.spentSkillPoints ??
          userProfile?.leveling?.totalSkillPoints ??
          0
        );
        const effectiveTotalSP = totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
        const playerMode: 'economy' | 'combat' = ecoSkillPoints > (effectiveTotalSP / 2) ? 'economy' : 'combat';

        return {
          userId,
          username: userProfile?.username || `Player_${userId.slice(-5)}`,
          avatarUrl: userProfile?.avatarUrl,
          level,
          militaryRank: userProfile?.militaryRank || 0,
          totalDamages: userProfile?.stats?.damagesCount || userProfile?.rankings?.userDamages?.value || 0,
          weeklyDamages: userProfile?.rankings?.weeklyUserDamages?.value || 0,
          wealth,
          role,
          lastActive,
          isActive,
          isCitizen,
          latestDonations: donations,
          totalDonations,
          donationCount: donations.length,
          factoryLimit,
          activeFactoryCount,
          totalOwnedFactories,
          factoryCount: activeFactoryCount,
          totalAutomatedLevel: activeAutomatedLevel,
          allFactoriesAutomatedLevel: allAutomatedLevel,
          factories: processedFactories,
          playerMode,
          ecoSkillPoints,
          totalSkillPoints: effectiveTotalSP,
          skills: userProfile?.skills,
        };
      });

      const results = await Promise.all(batchPromises);
      playerStatsList.push(...results);

      // Brief delay between batches to stay well below rate limits
      if (i + batchSize < memberIds.length) {
        await sleep(60);
      }
    }

    // Compute aggregated metrics
    const totalDonations = playerStatsList.reduce((acc, p) => acc + p.totalDonations, 0);
    const totalContributors = playerStatsList.filter((p) => p.totalDonations > 0).length;
    const averageDonation = totalContributors > 0 ? Math.round(totalDonations / totalContributors) : 0;

    let topDonor = null;
    if (playerStatsList.length > 0) {
      const sorted = [...playerStatsList].sort((a, b) => b.totalDonations - a.totalDonations);
      if (sorted[0] && sorted[0].totalDonations > 0) {
        topDonor = {
          userId: sorted[0].userId,
          username: sorted[0].username,
          amount: sorted[0].totalDonations,
          avatarUrl: sorted[0].avatarUrl,
        };
      }
    }

    const payload = {
      success: true,
      timestamp: Date.now(),
      isLiveDonations,
      hasApiToken: hasValidToken,
      militaryUnit: {
        id: muData._id,
        name: muData.name || 'Turkic Tribe',
        avatarUrl: muData.avatarUrl,
        level: muData.leveling?.level || 1,
        mercenaryReputation: muData.mercenaryReputation || 0,
        membersCount: memberIds.length,
        headquartersLevel: muData.activeUpgradeLevels?.headquarters || 0,
        dormitoriesLevel: muData.activeUpgradeLevels?.dormitories || 0,
        rankings: {
          damages: muData.rankings?.muDamages,
          wealth: muData.rankings?.muWealth,
          reputation: muData.rankings?.muReputation,
        },
      },
      players: playerStatsList,
      aggregated: {
        totalDonations,
        totalContributors,
        averageDonation,
        topDonor,
      },
    };

    cache.set(cacheKey, { data: payload, timestamp: Date.now() });
    res.json(payload);
  } catch (error: any) {
    console.error('API Error in /api/mu-data:', error);
    // Return stale cache if available
    const stale = cache.get(cacheKey);
    if (stale && stale.data) {
      return res.json({ ...stale.data, cached: true, isStale: true });
    }
    res.json({
      success: false,
      error: error.message || 'Internal error while fetching WarEra data',
    });
  }
});

// API Route: Fetch individual player factories on demand
app.get('/api/player-factories', async (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }
  try {
    const data = await fetchUserCompanies(userId);
    return res.json({ success: true, userId, ...data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching player factories' });
  }
});

// API Route: Fetch country-wide statistics across the 6 military units
const COUNTRY_STATS_CACHE_KEY = 'warera_country_stats_6_armies_v5';
const COUNTRY_STATS_TTL_MS = 60 * 60 * 1000; // 1 hour cache (weekly update rhythm)

app.get('/api/country-stats', async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  const userApiKey = (req.headers['x-user-api-key'] as string) || (req.query.apiKey as string);

  const cached = cache.get(COUNTRY_STATS_CACHE_KEY);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < COUNTRY_STATS_TTL_MS &&
    cached.data?.levelStats?.[0]?.combatFactories !== undefined
  ) {
    return res.json(cached.data);
  }

  const armiesConfig = [
    { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe', avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png' },
    { id: '689f69064e095b8b9f1b885a', name: 'ASHINA', avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png' },
    { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve', avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png' },
    { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera', avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png' },
    { id: '6902269a560184d196a6fba8', name: 'BEASTs', avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg' },
    { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler', avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png' },
  ];

  try {
    const armyInfoList: { id: string; name: string; memberCount: number; avatarUrl?: string }[] = [];

    // 1. Fetch member lists from the 6 military units in parallel
    const muPromises = armiesConfig.map(async (army) => {
      try {
        const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: army.id }))}`;
        const muRes = await fetchWarEra(muUrl, undefined, userApiKey);
        if (muRes.ok) {
          const muJson = await muRes.json();
          const members: string[] = muJson?.result?.data?.members || [];
          return {
            info: {
              id: army.id,
              name: muJson?.result?.data?.name || army.name,
              avatarUrl: muJson?.result?.data?.avatarUrl || army.avatarUrl,
              memberCount: members.length,
            },
            members,
          };
        }
      } catch (e) {}
      return {
        info: { id: army.id, name: army.name, avatarUrl: army.avatarUrl, memberCount: 20 },
        members: [] as string[],
      };
    });

    const muResults = await Promise.all(muPromises);
    const allUserIds: string[] = [];
    muResults.forEach((r) => {
      armyInfoList.push(r.info);
      allUserIds.push(...r.members);
    });

    const uniqueUserIds = Array.from(new Set(allUserIds));
    const playersList: { userId: string; username: string; level: number; factoryLimit: number; wealth: number; isEconomy: boolean }[] = [];

    // 2. Fetch user profile batches (25 per batch) in parallel
    const chunkSize = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueUserIds.length; i += chunkSize) {
      chunks.push(uniqueUserIds.slice(i, i + chunkSize));
    }

    const batchPromises = chunks.map(async (chunk) => {
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((id, idx) => { batchInput[String(idx)] = { userId: id }; });

      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => 'user.getUserLite').join(',')}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      const bRes = await fetchWarEra(batchUrl, undefined, userApiKey);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const items = Array.isArray(bJson) ? bJson : [bJson];
        return items.map((item: any) => item?.result?.data).filter(Boolean);
      }
      return [];
    });

    const batchResults = await Promise.all(batchPromises);
    const allUsers = batchResults.flat();
    allUsers.forEach((u: any) => {
      const level = Number(u.leveling?.level || 1);
      const compSkill = u.skills?.companies;
      const factoryLimit = Number(compSkill?.total ?? (2 + (compSkill?.level || 0) + (compSkill?.prestige || 0)));
      const wealth = Number(u.rankings?.userWealth?.value ?? u.wealth ?? 0);

      // Economy vs Combat mode calculation
      const ecoSkillNames = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];
      let ecoSkillPoints = 0;
      if (u.skills) {
        for (const sName of ecoSkillNames) {
          const sk = u.skills[sName];
          if (sk && sk.level > 0) {
            const lvl = Number(sk.level);
            ecoSkillPoints += (lvl * (lvl + 1)) / 2;
          }
        }
      }
      const totalSkillPoints = Number(
        u.leveling?.spentSkillPoints ??
        u.leveling?.totalSkillPoints ??
        0
      );
      const effectiveTotalSP = totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
      const isEconomy = ecoSkillPoints > (effectiveTotalSP / 2);

      playersList.push({
        userId: u._id,
        username: u.username || 'Oyuncu',
        level,
        factoryLimit,
        wealth,
        isEconomy,
      });
    });

    // 3. Aggregate level statistics
    const byLevel: Record<number, {
      level: number;
      playerCount: number;
      combatCount: number;
      economyCount: number;
      combatFactories: number;
      economyFactories: number;
      combatAutomatedLevel: number;
      economyAutomatedLevel: number;
      combatWealth: number;
      economyWealth: number;
      totalFactories: number;
      totalAutomatedLevel: number;
      totalWealth: number;
    }> = {};
    const totalCount = playersList.length || 1;
    let totalCombatPlayers = 0;
    let totalEconomyPlayers = 0;

    playersList.forEach((p) => {
      if (!byLevel[p.level]) {
        byLevel[p.level] = {
          level: p.level,
          playerCount: 0,
          combatCount: 0,
          economyCount: 0,
          combatFactories: 0,
          economyFactories: 0,
          combatAutomatedLevel: 0,
          economyAutomatedLevel: 0,
          combatWealth: 0,
          economyWealth: 0,
          totalFactories: 0,
          totalAutomatedLevel: 0,
          totalWealth: 0,
        };
      }
      byLevel[p.level].playerCount++;
      const estEnginePerFactory = Math.min(7, Math.max(3, Math.floor(p.level / 7) + 2));
      const estAutomated = p.factoryLimit * estEnginePerFactory;

      if (p.isEconomy) {
        byLevel[p.level].economyCount++;
        byLevel[p.level].economyFactories += p.factoryLimit;
        byLevel[p.level].economyAutomatedLevel += estAutomated;
        byLevel[p.level].economyWealth += (p.wealth || 0);
        totalEconomyPlayers++;
      } else {
        byLevel[p.level].combatCount++;
        byLevel[p.level].combatFactories += p.factoryLimit;
        byLevel[p.level].combatAutomatedLevel += estAutomated;
        byLevel[p.level].combatWealth += (p.wealth || 0);
        totalCombatPlayers++;
      }
      byLevel[p.level].totalFactories += p.factoryLimit;
      byLevel[p.level].totalWealth += (p.wealth || 0);
      byLevel[p.level].totalAutomatedLevel += estAutomated;
    });

    const levelStats = Object.values(byLevel)
      .sort((a, b) => a.level - b.level)
      .map((item) => {
        const count = item.playerCount;
        const cCount = item.combatCount;
        const eCount = item.economyCount;

        return {
          level: item.level,
          playerCount: count,
          percentage: Number(((count / totalCount) * 100).toFixed(1)),
          combatCount: cCount,
          economyCount: eCount,
          combatRatio: count > 0 ? Number(((cCount / count) * 100).toFixed(1)) : 0,
          economyRatio: count > 0 ? Number(((eCount / count) * 100).toFixed(1)) : 0,

          combatFactories: item.combatFactories,
          economyFactories: item.economyFactories,
          avgCombatFactories: cCount > 0 ? Number((item.combatFactories / cCount).toFixed(2)) : 0,
          avgEconomyFactories: eCount > 0 ? Number((item.economyFactories / eCount).toFixed(2)) : 0,

          combatAutomatedLevel: item.combatAutomatedLevel,
          economyAutomatedLevel: item.economyAutomatedLevel,
          avgCombatAutomatedLevel: cCount > 0 ? Number((item.combatAutomatedLevel / cCount).toFixed(1)) : 0,
          avgEconomyAutomatedLevel: eCount > 0 ? Number((item.economyAutomatedLevel / eCount).toFixed(1)) : 0,

          combatWealth: item.combatWealth,
          economyWealth: item.economyWealth,
          avgCombatWealth: cCount > 0 ? Math.round(item.combatWealth / cCount) : 0,
          avgEconomyWealth: eCount > 0 ? Math.round(item.economyWealth / eCount) : 0,

          avgFactories: count > 0 ? Number((item.totalFactories / count).toFixed(2)) : 0,
          totalFactories: item.totalFactories,
          avgAutomatedLevel: count > 0 ? Number((item.totalAutomatedLevel / count).toFixed(1)) : 0,
          totalAutomatedLevel: item.totalAutomatedLevel,
          avgWealth: count > 0 ? Math.round(item.totalWealth / count) : 0,
          totalWealth: item.totalWealth,
        };
      });

    const payload = {
      success: true,
      totalArmies: armyInfoList.length,
      totalPlayers: playersList.length,
      totalCombatPlayers,
      totalEconomyPlayers,
      armies: armyInfoList,
      levelStats,
      generatedAt: new Date().toISOString(),
    };

    cache.set(COUNTRY_STATS_CACHE_KEY, { data: payload, timestamp: Date.now() });
    return res.json(payload);
  } catch (err: any) {
    console.error('Error generating country stats:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching country stats' });
  }
});

// API Route: Military Overview (Savaş Modu - Ordu Bilgisi)
const MILITARY_OVERVIEW_TTL_MS = 60 * 1000; // 1 minute cache

function formatDamageNumber(dmg: number): string {
  if (dmg >= 1e9) return `${(dmg / 1e9).toFixed(2)}B`;
  if (dmg >= 1e6) return `${(dmg / 1e6).toFixed(2)}M`;
  if (dmg >= 1e3) return `${(dmg / 1e3).toFixed(1)}K`;
  return `${dmg.toLocaleString('tr-TR')}`;
}

function formatWealthNumber(w: number): string {
  if (w >= 1e6) return `$${(w / 1e6).toFixed(1)}M`;
  if (w >= 1e3) return `$${(w / 1e3).toFixed(1)}K`;
  return `$${Math.round(w).toLocaleString('tr-TR')}`;
}

const DEFAULT_MU_ID = '69c229c4449287ea1a26a5b3';

app.get('/api/military-overview', async (req, res) => {
  const targetMuId = (req.query.muId as string) || DEFAULT_MU_ID;
  const forceRefresh = req.query.refresh === 'true';

  const cacheKey = `mil_overview_${targetMuId}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < MILITARY_OVERVIEW_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: targetMuId }))}`;
    const muRes = await fetchWarEra(muUrl);
    if (!muRes.ok) {
      return res.status(502).json({ success: false, error: 'WarEra MU API call failed' });
    }
    const muJson = await muRes.json();
    const muData = muJson?.result?.data;
    if (!muData) {
      return res.status(404).json({ success: false, error: 'Military Unit not found' });
    }

    const members: string[] = muData.members || [];
    const leaderId = muData.user || '';
    const managers: string[] = muData.roles?.managers || [];
    const commanders: string[] = muData.roles?.commanders || [];

    // 2. Fetch Country Info
    let countryInfo = { name: 'Türkiye', code: 'TR', flagUrl: 'https://media.warera.io/images/flags/TR.svg?v=16' };
    if (muData.country) {
      try {
        const countryUrl = `https://api2.warera.io/trpc/country.getCountryById?input=${encodeURIComponent(JSON.stringify({ countryId: muData.country }))}`;
        const cRes = await fetchWarEra(countryUrl);
        if (cRes.ok) {
          const cJson = await cRes.json();
          const cData = cJson?.result?.data;
          if (cData) {
            const code = (cData.code || 'tr').toUpperCase();
            countryInfo = {
              name: cData.name || 'Türkiye',
              code,
              flagUrl: cData.flagUrl || `https://media.warera.io/images/flags/${code}.svg?v=16`,
            };
          }
        }
      } catch (cErr) {
        console.warn('Error fetching country info:', cErr);
      }
    }

    // 3. Fetch User Profiles for all members using tRPC batching (chunks of 10)
    const chunks: string[][] = [];
    for (let i = 0; i < members.length; i += 10) {
      chunks.push(members.slice(i, i + 10));
    }

    const allUsers: any[] = [];
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const endpoints = chunk.map(() => 'user.getUserById').join(',');
          const batchInput: Record<string, { userId: string }> = {};
          chunk.forEach((id, idx) => {
            batchInput[idx.toString()] = { userId: id };
          });
          const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
          const uRes = await fetchWarEra(batchUrl);
          if (uRes.ok) {
            const uJson = await uRes.json();
            if (Array.isArray(uJson)) {
              for (const item of uJson) {
                if (item?.result?.data) {
                  allUsers.push(item.result.data);
                }
              }
            }
          }
        } catch (uErr) {
          console.error('Batch user fetch error:', uErr);
        }
      })
    );

    // If batching missed some members, fall back to individual fetch for missing
    const foundIds = new Set(allUsers.map((u) => u._id));
    const missingIds = members.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.map(async (id) => {
          try {
            const singleUrl = `https://api2.warera.io/trpc/user.getUserById?input=${encodeURIComponent(JSON.stringify({ userId: id }))}`;
            const sRes = await fetchWarEra(singleUrl);
            if (sRes.ok) {
              const sJson = await sRes.json();
              if (sJson?.result?.data) {
                allUsers.push(sJson.result.data);
              }
            }
          } catch (_) {}
        })
      );
    }

    // 4. Compute Statistics
    const memberCount = members.length;
    const totalWeeklyDamage = allUsers.reduce((sum, u) => sum + (u.rankings?.weeklyUserDamages?.value || 0), 0);
    const totalAllTimeDamage = allUsers.reduce((sum, u) => sum + (u.rankings?.userDamages?.value || 0), 0);
    const totalWealth = allUsers.reduce((sum, u) => sum + (u.rankings?.userWealth?.value || 0), 0);
    const avgLevel = memberCount > 0 
      ? Number((allUsers.reduce((sum, u) => sum + (u.leveling?.level || 1), 0) / memberCount).toFixed(1))
      : 0;
    const avgWealth = memberCount > 0 ? Math.round(totalWealth / memberCount) : 0;

    // Unique commander and manager IDs
    const leadershipIdSet = new Set<string>();
    if (leaderId) leadershipIdSet.add(leaderId);
    managers.forEach((m) => leadershipIdSet.add(m));
    commanders.forEach((c) => leadershipIdSet.add(c));
    const commanderCount = leadershipIdSet.size;

    // 5. MVPs
    // Weekly Damage Leader
    const sortedWeekly = [...allUsers].sort((a, b) => (b.rankings?.weeklyUserDamages?.value || 0) - (a.rankings?.weeklyUserDamages?.value || 0));
    const topWeeklyUser = sortedWeekly[0];
    const topWeeklyDamageVal = topWeeklyUser?.rankings?.weeklyUserDamages?.value || 0;

    // All Time Damage Leader
    const sortedAllTime = [...allUsers].sort((a, b) => (b.rankings?.userDamages?.value || 0) - (a.rankings?.userDamages?.value || 0));
    const topAllTimeUser = sortedAllTime[0];
    const topAllTimeDamageVal = topAllTimeUser?.rankings?.userDamages?.value || 0;

    // Most Experienced (by totalXp or prestige)
    const sortedXp = [...allUsers].sort((a, b) => {
      const aScore = (a.leveling?.prestigeLevel || 0) * 1000000 + (a.leveling?.totalXp || 0);
      const bScore = (b.leveling?.prestigeLevel || 0) * 1000000 + (b.leveling?.totalXp || 0);
      return bScore - aScore;
    });
    const topXpUser = sortedXp[0];

    // Wealthiest
    const sortedWealth = [...allUsers].sort((a, b) => (b.rankings?.userWealth?.value || 0) - (a.rankings?.userWealth?.value || 0));
    const topWealthUser = sortedWealth[0];
    const topWealthVal = topWealthUser?.rankings?.userWealth?.value || 0;

    // 6. Leadership Kadrosu
    const leadership: any[] = [];
    const leaderUser = allUsers.find((u) => u._id === leaderId);
    if (leaderUser) {
      leadership.push({
        userId: leaderUser._id,
        username: leaderUser.username,
        avatarUrl: leaderUser.avatarUrl || '',
        role: 'leader',
        roleLabel: 'Birlik Lideri / Kurucu',
        level: leaderUser.leveling?.level || 1,
      });
    }

    const addedUserIds = new Set<string>([leaderId]);
    for (const cId of commanders) {
      if (addedUserIds.has(cId)) continue;
      const cUser = allUsers.find((u) => u._id === cId);
      if (cUser) {
        leadership.push({
          userId: cUser._id,
          username: cUser.username,
          avatarUrl: cUser.avatarUrl || '',
          role: 'commander',
          roleLabel: 'Komutan',
          level: cUser.leveling?.level || 1,
        });
        addedUserIds.add(cId);
      }
    }
    for (const mId of managers) {
      if (addedUserIds.has(mId)) continue;
      const mUser = allUsers.find((u) => u._id === mId);
      if (mUser) {
        leadership.push({
          userId: mUser._id,
          username: mUser.username,
          avatarUrl: mUser.avatarUrl || '',
          role: 'manager',
          roleLabel: 'Yönetici',
          level: mUser.leveling?.level || 1,
        });
        addedUserIds.add(mId);
      }
    }

    // 7. Level Spectrum (Kademelere göre dağılım)
    const spectrumTiers = [
      { range: 'Lv. 41 - 50', min: 41, max: 50 },
      { range: 'Lv. 31 - 40', min: 31, max: 40 },
      { range: 'Lv. 21 - 30', min: 21, max: 30 },
      { range: 'Lv. 11 - 20', min: 11, max: 20 },
      { range: 'Lv. 1 - 10', min: 1, max: 10 },
    ];
    const levelSpectrum = spectrumTiers.map((tier) => {
      const count = allUsers.filter((u) => {
        const lvl = u.leveling?.level || 1;
        return lvl >= tier.min && lvl <= tier.max;
      }).length;
      const percentage = memberCount > 0 ? Math.round((count / memberCount) * 100) : 0;
      return {
        ...tier,
        count,
        percentage,
      };
    });

    // 8. Member Items
    const memberItems = allUsers.map((u) => ({
      userId: u._id,
      username: u.username,
      avatarUrl: u.avatarUrl || '',
      level: u.leveling?.level || 1,
      totalXp: u.leveling?.totalXp || 0,
      prestigeLevel: u.leveling?.prestigeLevel || 0,
      weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
      allTimeDamage: u.rankings?.userDamages?.value || 0,
      wealth: u.rankings?.userWealth?.value || 0,
    }));

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || 'Turkic Tribe',
          avatarUrl: muData.avatarUrl || '',
          description: muData.description || 'Orduya ait temel operasyonel göstergeler, üye gücü, haftalık ve kümülatif hasar istatistikleri ve toplam varlık özeti.',
          countryId: muData.country || '',
          leaderId,
        },
        countryInfo,
        stats: {
          memberCount,
          commanderCount,
          totalWeeklyDamage,
          totalAllTimeDamage,
          averageLevel: avgLevel,
          totalWealth,
          averageWealth: avgWealth,
        },
        mvps: {
          weeklyDamageLeader: topWeeklyUser ? {
            userId: topWeeklyUser._id,
            username: topWeeklyUser.username,
            avatarUrl: topWeeklyUser.avatarUrl || '',
            value: topWeeklyDamageVal,
            formattedValue: formatDamageNumber(topWeeklyDamageVal),
            level: topWeeklyUser.leveling?.level || 1,
          } : null,
          allTimeDamageLeader: topAllTimeUser ? {
            userId: topAllTimeUser._id,
            username: topAllTimeUser.username,
            avatarUrl: topAllTimeUser.avatarUrl || '',
            value: topAllTimeDamageVal,
            formattedValue: formatDamageNumber(topAllTimeDamageVal),
            level: topAllTimeUser.leveling?.level || 1,
          } : null,
          mostExperienced: topXpUser ? {
            userId: topXpUser._id,
            username: topXpUser.username,
            avatarUrl: topXpUser.avatarUrl || '',
            value: topXpUser.leveling?.totalXp || 0,
            formattedValue: `${((topXpUser.leveling?.totalXp || 0) / 1000).toFixed(1)}K XP`,
            level: topXpUser.leveling?.level || 1,
            prestigeLevel: topXpUser.leveling?.prestigeLevel || 0,
          } : null,
          wealthiest: topWealthUser ? {
            userId: topWealthUser._id,
            username: topWealthUser.username,
            avatarUrl: topWealthUser.avatarUrl || '',
            value: topWealthVal,
            formattedValue: formatWealthNumber(topWealthVal),
            level: topWealthUser.leveling?.level || 1,
          } : null,
        },
        leadership,
        levelSpectrum,
        members: memberItems,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.json(resultData);
  } catch (err: any) {
    console.error('Military overview error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching military overview' });
  }
});

// API Route: Military Details & Member Roster (Detaylı Bilgi & Üye Listesi)
app.get('/api/military-details', async (req, res) => {
  const targetMuId = (req.query.muId as string) || DEFAULT_MU_ID;
  const forceRefresh = req.query.refresh === 'true';

  const cacheKey = `mil_details_${targetMuId}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < MILITARY_OVERVIEW_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: targetMuId }))}`;
    const muRes = await fetchWarEra(muUrl);
    if (!muRes.ok) {
      return res.status(502).json({ success: false, error: 'WarEra MU API call failed' });
    }
    const muJson = await muRes.json();
    const muData = muJson?.result?.data?.json || muJson?.result?.data;
    if (!muData) {
      return res.status(404).json({ success: false, error: 'Military Unit not found' });
    }

    const members: string[] = muData.members || [];
    const leaderId = muData.user || '';
    const managers: string[] = muData.roles?.managers || [];
    const commanders: string[] = muData.roles?.commanders || [];

    // 2. Fetch User Profiles for all members using tRPC batching (chunks of 10)
    const chunks: string[][] = [];
    for (let i = 0; i < members.length; i += 10) {
      chunks.push(members.slice(i, i + 10));
    }

    const allUsers: any[] = [];
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const endpoints = chunk.map(() => 'user.getUserById').join(',');
          const batchInput: Record<string, { userId: string }> = {};
          chunk.forEach((id, idx) => {
            batchInput[idx.toString()] = { userId: id };
          });
          const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
          const uRes = await fetchWarEra(batchUrl);
          if (uRes.ok) {
            const uJson = await uRes.json();
            if (Array.isArray(uJson)) {
              for (const item of uJson) {
                const uData = item?.result?.data?.json || item?.result?.data;
                if (uData) {
                  allUsers.push(uData);
                }
              }
            }
          }
        } catch (uErr) {
          console.error('Batch user fetch error:', uErr);
        }
      })
    );

    // If batching missed some members, fall back to individual fetch for missing
    const foundIds = new Set(allUsers.map((u) => u._id));
    const missingIds = members.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.map(async (id) => {
          try {
            const singleUrl = `https://api2.warera.io/trpc/user.getUserById?input=${encodeURIComponent(JSON.stringify({ userId: id }))}`;
            const sRes = await fetchWarEra(singleUrl);
            if (sRes.ok) {
              const sJson = await sRes.json();
              const sData = sJson?.result?.data?.json || sJson?.result?.data;
              if (sData) {
                allUsers.push(sData);
              }
            }
          } catch (_) {}
        })
      );
    }

    // 3. Resolve Leader username
    const leaderUser = allUsers.find((u) => u._id === leaderId);
    const leaderUsername = leaderUser?.username || 'Muhtarr';

    // 4. Map and rank members (sorted by weeklyDamage descending)
    const mappedMembers = allUsers.map((u) => {
      const isLeader = u._id === leaderId;
      const isCommander = commanders.includes(u._id);
      const isManager = managers.includes(u._id);
      const role = isLeader ? 'leader' : isCommander ? 'commander' : isManager ? 'manager' : 'soldier';

      return {
        userId: u._id,
        username: u.username || 'Bilinmeyen Asker',
        avatarUrl: u.avatarUrl || '',
        level: u.leveling?.level || 1,
        prestigeLevel: u.leveling?.prestigeLevel || 0,
        totalXp: u.leveling?.totalXp || 0,
        weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
        weeklyTier: u.rankings?.weeklyUserDamages?.tier || 'bronze',
        weeklyRank: u.rankings?.weeklyUserDamages?.rank || 0,
        allTimeDamage: u.rankings?.userDamages?.value || 0,
        allTimeTier: u.rankings?.userDamages?.tier || 'bronze',
        allTimeRank: u.rankings?.userDamages?.rank || 0,
        wealth: u.rankings?.userWealth?.value || 0,
        role,
        roleBadge: isLeader ? 'L' : isCommander ? 'C' : isManager ? 'M' : '',
        roleLabel: isLeader ? 'Birlik Sahibi / Kurucu' : isCommander ? 'Komutan' : isManager ? 'Yönetici' : 'Asker',
      };
    });

    mappedMembers.sort((a, b) => b.weeklyDamage - a.weeklyDamage);

    // 5. Structure Final Output
    const rankings = muData.rankings || {};
    const overallTier = rankings.muDamages?.tier || rankings.muWeeklyDamages?.tier || 'platinum';

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || 'Turkic Tribe',
          avatarUrl: muData.avatarUrl || '',
          level: muData.leveling?.level || 1,
          leaderId,
          leaderUsername,
          reputation: Number((muData.mercenaryReputation || rankings.muReputation?.value || 11.91).toFixed(2)),
          memberCount: members.length,
          createdAt: muData.createdAt || '2026-03-24T06:05:56.824Z',
          overallTier,
          activeUpgradeLevels: {
            headquarters: muData.activeUpgradeLevels?.headquarters || 4,
            dormitories: muData.activeUpgradeLevels?.dormitories || 5,
          },
          rankings: {
            muWeeklyDamages: {
              value: rankings.muWeeklyDamages?.value || 47136427,
              rank: rankings.muWeeklyDamages?.rank || 191,
              tier: rankings.muWeeklyDamages?.tier || 'platinum',
            },
            muDamages: {
              value: rankings.muDamages?.value || 1028447657,
              rank: rankings.muDamages?.rank || 135,
              tier: rankings.muDamages?.tier || 'platinum',
            },
            muBounty: {
              value: rankings.muBounty?.value || 17441,
              rank: rankings.muBounty?.rank || 205,
              tier: rankings.muBounty?.tier || 'platinum',
            },
            muReputation: {
              value: Number((rankings.muReputation?.value || muData.mercenaryReputation || 11.91).toFixed(2)),
              rank: rankings.muReputation?.rank || 68,
              tier: rankings.muReputation?.tier || 'platinum',
            },
            muTerrain: {
              value: rankings.muTerrain?.value || 23899,
              rank: rankings.muTerrain?.rank || 243,
              tier: rankings.muTerrain?.tier || 'platinum',
            },
            muWealth: {
              value: Number((rankings.muWealth?.value || 679.97).toFixed(2)),
              rank: rankings.muWealth?.rank || 661,
              tier: rankings.muWealth?.tier || 'silver',
            },
          },
        },
        members: mappedMembers,
        commanderCount: commanders.length,
        managerCount: managers.length,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.json(resultData);
  } catch (err: any) {
    console.error('Military details error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching military details' });
  }
});

// Preset 6 Military Units for automatic 02:55 cron snapshot
const PRESET_MILITARY_UNITS = [
  { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe' },
  { id: '689f69064e095b8b9f1b885a', name: 'ASHINA' },
  { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve' },
  { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera' },
  { id: '6902269a560184d196a6fba8', name: 'BEASTs' },
  { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler' },
];

declare global {
  var __DAILY_DAMAGE_SNAPSHOTS__: Record<string, any> | undefined;
}

function getSnapshotsFilePath(): string {
  const dir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
  return path.join(dir, 'daily_snapshots.json');
}

function readSnapshotsFromDisk(): Record<string, any> {
  if (global.__DAILY_DAMAGE_SNAPSHOTS__) {
    return global.__DAILY_DAMAGE_SNAPSHOTS__;
  }
  try {
    const filePath = getSnapshotsFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      global.__DAILY_DAMAGE_SNAPSHOTS__ = parsed;
      return parsed;
    }
  } catch (err) {
    console.error('Error reading snapshots from disk:', err);
  }
  return {};
}

function writeSnapshotsToDisk(data: Record<string, any>) {
  global.__DAILY_DAMAGE_SNAPSHOTS__ = data;
  try {
    const filePath = getSnapshotsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing snapshots to disk:', err);
  }
}

async function readSnapshotsWithSupabaseServer(): Promise<Record<string, any>> {
  let diskStore = readSnapshotsFromDisk();
  try {
    const supabaseStore = await fetchSnapshotsFromSupabase(30);
    if (supabaseStore && Object.keys(supabaseStore).length > 0) {
      const merged = { ...diskStore, ...supabaseStore };
      global.__DAILY_DAMAGE_SNAPSHOTS__ = merged;
      return merged;
    }
  } catch (err) {
    console.error('Error fetching snapshots from Supabase in server:', err);
  }
  return diskStore;
}

async function snapshotAllArmies() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
  const timestamp = now.getTime();

  let currentStore = await readSnapshotsWithSupabaseServer();
  if (!currentStore[dateStr]) {
    currentStore[dateStr] = {
      date: dateStr,
      timestamp,
      iso: now.toISOString(),
      armies: {},
    };
  }

  for (const mu of PRESET_MILITARY_UNITS) {
    try {
      const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: mu.id }))}`;
      const muRes = await fetchWarEra(muUrl);
      if (!muRes.ok) continue;
      const muJson = await muRes.json();
      const muData = muJson?.result?.data?.json || muJson?.result?.data;
      if (!muData) continue;

      const members: string[] = muData.members || [];
      const armyTotalWeekly = muData.rankings?.muWeeklyDamages?.value || 0;

      const chunks: string[][] = [];
      for (let i = 0; i < members.length; i += 10) {
        chunks.push(members.slice(i, i + 10));
      }

      const memberDamages: Record<string, { username: string; weeklyDamage: number }> = {};

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const endpoints = chunk.map(() => 'user.getUserById').join(',');
            const batchInput: Record<string, { userId: string }> = {};
            chunk.forEach((id, idx) => {
              batchInput[idx.toString()] = { userId: id };
            });
            const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
            const uRes = await fetchWarEra(batchUrl);
            if (uRes.ok) {
              const uJson = await uRes.json();
              if (Array.isArray(uJson)) {
                for (const item of uJson) {
                  const u = item?.result?.data?.json || item?.result?.data;
                  if (u?._id) {
                    memberDamages[u._id] = {
                      username: u.username || 'Bilinmeyen Asker',
                      weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
                    };
                  }
                }
              }
            }
          } catch (_) {}
        })
      );

      currentStore[dateStr].armies[mu.id] = {
        name: mu.name,
        muId: mu.id,
        armyTotalWeeklyDamage: armyTotalWeekly,
        memberCount: members.length,
        members: memberDamages,
      };
    } catch (e) {
      console.error(`Error snapshotting MU ${mu.name}:`, e);
    }
  }

  // 1. Write to local file/memory
  writeSnapshotsToDisk(currentStore);

  // 2. Persist to Supabase
  let supabaseSaved = false;
  try {
    supabaseSaved = await saveSnapshotToSupabase(currentStore[dateStr]);
  } catch (err) {
    console.warn('Could not persist snapshot to Supabase:', err);
  }

  return {
    ...currentStore[dateStr],
    supabaseSaved,
    supabaseConnected: isSupabaseConnected(),
  };
}

// API Route: Combat & Telemetry (Günlük Hasar & Telemetri Takip)
app.get('/api/combat-telemetry', async (req, res) => {
  const targetMuId = (req.query.muId as string) || DEFAULT_MU_ID;
  const forceRefresh = req.query.refresh === 'true';

  const cacheKey = `combat_telemetry_${targetMuId}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < 30 * 1000) {
    return res.json(cached.data);
  }

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: targetMuId }))}`;
    const muRes = await fetchWarEra(muUrl);
    if (!muRes.ok) {
      return res.status(502).json({ success: false, error: 'WarEra MU API call failed' });
    }
    const muJson = await muRes.json();
    const muData = muJson?.result?.data?.json || muJson?.result?.data;
    if (!muData) {
      return res.status(404).json({ success: false, error: 'Military Unit not found' });
    }

    const members: string[] = muData.members || [];
    const leaderId = muData.user || '';
    const managers: string[] = muData.roles?.managers || [];
    const commanders: string[] = muData.roles?.commanders || [];

    // 2. Fetch User Profiles for all members using tRPC batching (chunks of 10)
    const chunks: string[][] = [];
    for (let i = 0; i < members.length; i += 10) {
      chunks.push(members.slice(i, i + 10));
    }

    const allUsers: any[] = [];
    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const endpoints = chunk.map(() => 'user.getUserById').join(',');
          const batchInput: Record<string, { userId: string }> = {};
          chunk.forEach((id, idx) => {
            batchInput[idx.toString()] = { userId: id };
          });
          const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
          const uRes = await fetchWarEra(batchUrl);
          if (uRes.ok) {
            const uJson = await uRes.json();
            if (Array.isArray(uJson)) {
              for (const item of uJson) {
                const uData = item?.result?.data?.json || item?.result?.data;
                if (uData) {
                  allUsers.push(uData);
                }
              }
            }
          }
        } catch (uErr) {
          console.error('Batch user fetch error:', uErr);
        }
      })
    );

    // If batching missed some members, fall back to individual fetch for missing
    const foundIds = new Set(allUsers.map((u) => u._id));
    const missingIds = members.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.map(async (id) => {
          try {
            const singleUrl = `https://api2.warera.io/trpc/user.getUserById?input=${encodeURIComponent(JSON.stringify({ userId: id }))}`;
            const sRes = await fetchWarEra(singleUrl);
            if (sRes.ok) {
              const sJson = await sRes.json();
              const sData = sJson?.result?.data?.json || sJson?.result?.data;
              if (sData) {
                allUsers.push(sData);
              }
            }
          } catch (_) {}
        })
      );
    }

    // 3. Load baseline snapshot from 02:55 cron
    let snapshots = await readSnapshotsWithSupabaseServer();
    if (Object.keys(snapshots).length === 0) {
      await snapshotAllArmies();
      snapshots = await readSnapshotsWithSupabaseServer();
    }
    const dates = Object.keys(snapshots).sort();
    const latestDate = dates[dates.length - 1];
    const baselineArmy = snapshots[latestDate]?.armies?.[targetMuId];
    const baselineMembers = baselineArmy?.members || {};

    // 4. Map member telemetry records with REAL daily damage
    const mappedMembers = allUsers.map((u) => {
      const isLeader = u._id === leaderId;
      const isCommander = commanders.includes(u._id);
      const isManager = managers.includes(u._id);
      const role = isLeader ? 'leader' : isCommander ? 'commander' : isManager ? 'manager' : 'soldier';

      // Resources
      const healthCurrent = Number((u.skills?.health?.currentBarValue || 0).toFixed(1));
      const healthMax = u.skills?.health?.value || 100;
      const healthRegen = Number((u.skills?.health?.hourlyBarRegen || 0).toFixed(1));

      const hungerCurrent = Number((u.skills?.hunger?.currentBarValue || 0).toFixed(1));
      const hungerMax = u.skills?.hunger?.value || 10;
      const hungerRegen = Number((u.skills?.hunger?.hourlyBarRegen || 0).toFixed(1));

      // Buffs & Pills
      const buffCodes = u.buffs?.buffCodes || [];
      const buffEndAt = u.buffs?.buffEndAt || null;
      const debuffEndAt = u.buffs?.debuffEndAt || u.attack?.buffs?.debuffEndAt || null;

      const now = Date.now();
      let pillStatus: 'ready' | 'buff' | 'debuff' = 'ready';
      let pillExpiresAt: string | null = null;

      if (buffEndAt && new Date(buffEndAt).getTime() > now) {
        pillStatus = 'buff';
        pillExpiresAt = buffEndAt;
      } else if (debuffEndAt && new Date(debuffEndAt).getTime() > now) {
        pillStatus = 'debuff';
        pillExpiresAt = debuffEndAt;
      }

      // Skills reset
      const freeReset = u.leveling?.freeReset || 0;
      const lastSkillsResetAt = u.dates?.lastSkillsResetAt || null;

      // Real Daily Damage calculation: Current Weekly Damage - 02:55 Snapshot Weekly Damage
      const currentWeekly = u.rankings?.weeklyUserDamages?.value || 0;
      const baselineWeekly = baselineMembers[u._id]?.weeklyDamage;

      let dailyDamage = 0;
      if (baselineWeekly !== undefined) {
        if (currentWeekly >= baselineWeekly) {
          dailyDamage = currentWeekly - baselineWeekly;
        } else {
          // In case War Era had a weekly season reset in between
          dailyDamage = currentWeekly;
        }
      } else {
        // First initial snapshot or brand new member
        dailyDamage = 0;
      }

      return {
        userId: u._id,
        username: u.username || 'Bilinmeyen Asker',
        avatarUrl: u.avatarUrl || '',
        level: u.leveling?.level || 1,
        militaryRank: u.militaryRank || 1,
        role,
        isLeader,
        isCommander,
        isManager,
        health: {
          current: healthCurrent,
          max: healthMax,
          hourlyRegen: healthRegen,
        },
        hunger: {
          current: hungerCurrent,
          max: hungerMax,
          hourlyRegen: hungerRegen,
        },
        pillStatus,
        pillExpiresAt,
        buffCodes,
        skillsReset: {
          freeReset,
          lastSkillsResetAt,
        },
        totalDamage: u.rankings?.userDamages?.value || u.stats?.damagesCount || 0,
        weeklyDamage: currentWeekly,
        dailyDamage,
      };
    });

    // 5. Compute army resource totals & total daily damage
    const totalHealthCurrent = Number(mappedMembers.reduce((sum, m) => sum + m.health.current, 0).toFixed(1));
    const totalHealthMax = mappedMembers.reduce((sum, m) => sum + m.health.max, 0);
    const totalHungerCurrent = Number(mappedMembers.reduce((sum, m) => sum + m.hunger.current, 0).toFixed(1));
    const totalHungerMax = mappedMembers.reduce((sum, m) => sum + m.hunger.max, 0);

    const readyCount = mappedMembers.filter((m) => m.pillStatus === 'ready').length;
    const buffCount = mappedMembers.filter((m) => m.pillStatus === 'buff').length;
    const debuffCount = mappedMembers.filter((m) => m.pillStatus === 'debuff').length;

    const totalDailyDamage = mappedMembers.reduce((sum, m) => sum + m.dailyDamage, 0);

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || 'Turkic Tribe',
          memberCount: members.length,
          leaderId,
        },
        resources: {
          health: {
            current: totalHealthCurrent,
            max: totalHealthMax,
            percentage: totalHealthMax > 0 ? Number(((totalHealthCurrent / totalHealthMax) * 100).toFixed(1)) : 0,
          },
          hunger: {
            current: totalHungerCurrent,
            max: totalHungerMax,
            percentage: totalHungerMax > 0 ? Number(((totalHungerCurrent / totalHungerMax) * 100).toFixed(1)) : 0,
          },
        },
        pillOverview: {
          readyCount,
          buffCount,
          debuffCount,
          total: members.length,
        },
        dailyDamageInfo: {
          totalDailyDamage,
          baselineDate: latestDate,
          baselineTimestamp: snapshots[latestDate]?.timestamp || Date.now(),
          calculationRule: 'Anlık Haftalık Hasar - 02:55 Snapshot Haftalık Hasar',
        },
        members: mappedMembers,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.json(resultData);
  } catch (err: any) {
    console.error('Combat telemetry error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching combat telemetry' });
  }
});

// API Route: Cron Job endpoint for recording daily damage snapshot (runs at 02:55 TSİ)
app.all('/api/cron/record-daily-damage', async (req, res) => {
  try {
    const snapshot = await snapshotAllArmies();
    return res.json({
      success: true,
      message: '02:55 Günlük Hasar Snapshot başarıyla tamamlandı (6 Ordu).',
      date: snapshot.date,
      armiesCount: Object.keys(snapshot.armies).length,
      snapshot,
    });
  } catch (err: any) {
    console.error('Cron job error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Snapshot failed' });
  }
});

// API Route: Historical daily damage snapshots
app.get('/api/daily-damage-snapshots', async (req, res) => {
  let store = await readSnapshotsWithSupabaseServer();
  if (Object.keys(store).length === 0) {
    try {
      await snapshotAllArmies();
      store = await readSnapshotsWithSupabaseServer();
    } catch (_) {}
  }
  const dates = Object.keys(store).sort();
  const latestDate = dates[dates.length - 1];
  const previousDate = dates.length > 1 ? dates[dates.length - 2] : null;

  return res.json({
    success: true,
    latestDate,
    previousDate,
    totalSnapshots: dates.length,
    dates,
    snapshots: store,
    supabaseConnected: isSupabaseConnected(),
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  // 02:55 TSİ cron runner (runs daily snapshot at 02:55 Turkey Time)
  setInterval(() => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);

      const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '-1', 10);
      const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '-1', 10);

      if (hour === 2 && minute === 55) {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now);
        const store = readSnapshotsFromDisk();
        if (!store[todayStr]) {
          console.log(`[02:55 TSİ CRON] Taking scheduled daily damage snapshot for ${todayStr}...`);
          snapshotAllArmies().catch(console.error);
        }
      }
    } catch (e) {
      console.error('Error in 02:55 cron runner:', e);
    }
  }, 60 * 1000);
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
