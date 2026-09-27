import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

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
async function fetchWarEra(url: string, init?: RequestInit): Promise<Response> {
  const maxAttempts = Math.max(2, tokenManager.hasTokens() ? 2 : 1);
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = tokenManager.getNextToken();
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
        tokenManager.reportRateLimit(token, 60);
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
  const cacheKey = `mu_${muId}`;

  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.json({ ...cached.data, cached: true });
  }

  const hasValidToken = tokenManager.hasTokens();

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(
      JSON.stringify({ muId })
    )}`;

    const muResponse = await fetchWarEra(muUrl);

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
          lastActive: userProfile?.dates?.lastConnectionAt || userProfile?.updatedAt || new Date().toISOString(),
          latestDonations: donations,
          totalDonations,
          donationCount: donations.length,
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
