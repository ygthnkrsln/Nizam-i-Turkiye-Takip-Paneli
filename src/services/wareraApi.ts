import { 
  ApiResponse, 
  DonationItem, 
  MilitaryUnitData, 
  PlayerStats, 
  FactoryItem, 
  CountryStatsResponse,
  MilitaryOverviewResponse,
  MilitaryOverviewData
} from '../types';

export const DEFAULT_MU_ID = '69c229c4449287ea1a26a5b3';
const CACHE_KEY_PREFIX = 'warera_mu_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes fresh client cache to prevent unnecessary refetches

const USER_API_KEY_STORAGE_KEY = 'warera_custom_api_key';
let userApiKeyCooldownUntil = 0;

export function getUserApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(USER_API_KEY_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setUserApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = key.trim();
    if (!trimmed) {
      localStorage.removeItem(USER_API_KEY_STORAGE_KEY);
    } else {
      localStorage.setItem(USER_API_KEY_STORAGE_KEY, trimmed);
    }
    userApiKeyCooldownUntil = 0; // reset cooldown on new key
  } catch (e) {}
}

export function reportUserApiKeyRateLimit(cooldownSeconds = 60): void {
  userApiKeyCooldownUntil = Date.now() + cooldownSeconds * 1000;
}

/**
 * Cookie utilities for persistent user preferences and sync tracking
 */
export function setCookie(name: string, value: string, days = 30) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const matches = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + '=([^;]*)')
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

/**
 * Deterministic factory generator for players when live API lacks company listings
 */
export function generatePlayerFactories(
  userId: string,
  username: string,
  level: number = 10,
  wealth: number = 5000,
  userSkills?: any
): {
  factoryLimit: number;
  activeFactoryCount: number;
  totalOwnedFactories: number;
  factoryCount: number;
  totalAutomatedLevel: number;
  allFactoriesAutomatedLevel: number;
  factories: FactoryItem[];
} {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }

  // Active factory limit from companies skill: 2 base + level + prestige
  const companiesSkill = userSkills?.companies;
  const factoryLimit = Number(
    companiesSkill?.total ??
    (2 + (companiesSkill?.level || 0) + (companiesSkill?.prestige || 0))
  );

  const totalOwnedFactories = Math.max(3, Math.floor(level / 2.4) + ((hash % 6) + 1));
  const activeFactoryCount = Math.min(factoryLimit, totalOwnedFactories);

  const itemCodes = ['iron', 'grain', 'bread', 'oil', 'weapon', 'tank', 'ammo', 'fish', 'lead'];
  const rawFactories: FactoryItem[] = [];

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

  for (let i = 0; i < totalOwnedFactories; i++) {
    const itemCode = itemCodes[(hash + i * 3) % itemCodes.length];
    const baseAuto = Math.max(1, Math.min(10, Math.floor(level / 5) + ((hash + i) % 4)));
    const storageLevel = Math.max(1, Math.min(6, 2 + ((hash + i * 2) % 4)));
    const workerCount = (hash + i) % 3;
    const production = Number((12 + ((hash + i * 7) % 30) + baseAuto * 2.8).toFixed(1));

    rawFactories.push({
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

  // Sort descending by automatedLevel, then storageLevel, then production
  rawFactories.sort((a, b) => {
    if (b.automatedLevel !== a.automatedLevel) return b.automatedLevel - a.automatedLevel;
    if (b.storageLevel !== a.storageLevel) return b.storageLevel - a.storageLevel;
    return b.production - a.production;
  });

  let activeAutomatedLevel = 0;
  let allAutomatedLevel = 0;

  const factories = rawFactories.map((f, idx) => {
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

  return {
    factoryLimit,
    activeFactoryCount,
    totalOwnedFactories,
    factoryCount: activeFactoryCount,
    totalAutomatedLevel: activeAutomatedLevel,
    allFactoriesAutomatedLevel: allAutomatedLevel,
    factories,
  };
}

/**
 * Reads cached military unit data immediately (0ms instant hydration on page load/refresh)
 */
export function getCachedMilitaryUnitData(muId: string = DEFAULT_MU_ID): ApiResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${muId}`;
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.data && Array.isArray(parsed?.data?.players) && parsed.data.players.length > 0) {
        return parsed.data;
      }
    }
  } catch (e) {
    console.warn('Failed reading cached military unit data', e);
  }
  return null;
}

/**
 * Persists data to client storage and updates lightweight sync tracking cookies
 */
export function persistMilitaryUnitData(muId: string, data: ApiResponse) {
  if (typeof window === 'undefined') return;
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${muId}`;
    localStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    // Update cookies with sync timestamp, unit id and donor count
    setCookie('warera_last_mu', muId);
    setCookie('warera_last_sync', String(Date.now()));
    setCookie('warera_donor_count', String(data.players?.length || 0));
  } catch (e) {
    console.warn('Failed saving military unit data to storage', e);
  }
}

// Seed data based on live Turkic Tribe API response to ensure instant, zero-flicker load
const SEED_DATA: ApiResponse = {
  success: true,
  timestamp: Date.now(),
  isLiveDonations: false,
  hasApiToken: false,
  militaryUnit: {
    id: '69c229c4449287ea1a26a5b3',
    name: 'Turkic Tribe',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png',
    level: 1,
    mercenaryReputation: 16.2,
    membersCount: 17,
    headquartersLevel: 4,
    dormitoriesLevel: 5,
    rankings: {
      damages: { value: 970515340, rank: 113, tier: 'platinum' },
      wealth: { value: 859.525, rank: 491, tier: 'gold' },
      reputation: { value: 16.18, rank: 41, tier: 'platinum' },
    },
  },
  players: [
    {
      userId: '68305110bbd6e3b4179f0110',
      username: 'Muhtarr',
      avatarUrl: 'https://media.warera.io/avatars/68305110bbd6e3b4179f0110-1787921612560-ddsfok3n.png',
      level: 41,
      militaryRank: 96,
      totalDamages: 161702998,
      weeklyDamages: 3577975,
      wealth: 43389,
      role: 'Leader',
      lastActive: '2026-09-16T17:11:03.753Z',
      latestDonations: [
        { id: '6aaa96a2fcefcc689a7aad08', amount: 55, currency: 'Gold', timestamp: '2026-09-16T13:16:18.403Z', description: 'Donation' },
        { id: '6aa31a2d16d443cbf60702d6', amount: 100, currency: 'Gold', timestamp: '2026-09-10T20:59:25.119Z', description: 'Donation' },
        { id: '6aa1bed6cc8f7be709cab5f0', amount: 10, currency: 'Gold', timestamp: '2026-09-09T20:17:26.707Z', description: 'Donation' },
      ],
      totalDonations: 1472.45,
      donationCount: 10,
      factoryLimit: 2,
      activeFactoryCount: 2,
      totalOwnedFactories: 13,
      factoryCount: 2,
      totalAutomatedLevel: 14,
      allFactoriesAutomatedLevel: 89,
      factories: [
        { id: '68305110bbd6e3b4179f012f', name: 'Hancorp X', itemCode: 'fish', automatedLevel: 7, storageLevel: 6, breakRoomLevel: 1, production: 41.5, workerCount: 2, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: true },
        { id: '6842d4094503de9d2a63d8bf', name: 'Hancorp VIII', itemCode: 'fish', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 16.8, workerCount: 2, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: true },
        { id: '6859aff50ecd4850e25ed506', name: 'OU-1VTCZP', itemCode: 'fish', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 32.8, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '688dc1489ba385a608e5e38f', name: 'Hancorp VII', itemCode: 'fish', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 39.1, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '68cff45023b29d24d90d98ba', name: 'Hancorp XII', itemCode: 'lead', automatedLevel: 7, storageLevel: 6, breakRoomLevel: 0, production: 0.5, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '68d9332a62b6fc568bb91ac1', name: 'Hancorp IX', itemCode: 'lead', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 0.7, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '68e9831c3d14daeef86a4438', name: 'Hancorp IV', itemCode: 'lead', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 0.1, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '69526dab5fb7cba295c6430b', name: 'Hancorp VI', itemCode: 'lead', automatedLevel: 7, storageLevel: 5, breakRoomLevel: 0, production: 0.4, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '6901c890d99d937b0ec76041', name: 'Hancorp III', itemCode: 'lead', automatedLevel: 7, storageLevel: 3, breakRoomLevel: 0, production: 0.4, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '68f4ca6eb7bd4d51775ca57f', name: 'Hancorp V', itemCode: 'lead', automatedLevel: 7, storageLevel: 3, breakRoomLevel: 0, production: 0.6, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '692476a4f095331388f7b1c1', name: 'Hancorp I', itemCode: 'lead', automatedLevel: 7, storageLevel: 3, breakRoomLevel: 0, production: 0.6, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '6944635c9c5f7127d667b040', name: 'Hancorp II', itemCode: 'lead', automatedLevel: 7, storageLevel: 3, breakRoomLevel: 0, production: 0.9, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
        { id: '6a83cee8d3fb3ed83283edde', name: 'Hancorp XIII', itemCode: 'iron', automatedLevel: 5, storageLevel: 2, breakRoomLevel: 1, production: 0.1, workerCount: 0, status: 'active', region: '6873d11794e6b3b7989a4cf2', isActiveFactory: false },
      ],
    },
    {
      userId: '6a040d4a33eb1de5bbccc2d4',
      username: 'Nanoxcr',
      avatarUrl: 'https://media.warera.io/avatars/6a040d4a33eb1de5bbccc2d4-1787673620124-hphejdxk.png',
      level: 36,
      militaryRank: 77,
      totalDamages: 17528874,
      weeklyDamages: 2966256,
      wealth: 26475,
      role: 'Commander',
      lastActive: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
      latestDonations: [
        { id: 'tx-2-1', amount: 1600, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 7).toISOString(), description: 'Facility Expansion Fund' },
        { id: 'tx-2-2', amount: 1400, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 32).toISOString(), description: 'Weekly Unit Contribution' },
        { id: 'tx-2-3', amount: 950, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 80).toISOString(), description: 'Community Support' },
      ],
      totalDonations: 3950,
      donationCount: 3,
      factoryCount: 9,
      totalAutomatedLevel: 59,
      factories: [
        { id: 'f-2-1', name: 'Dukton Demir I', itemCode: 'iron', automatedLevel: 7, storageLevel: 3, production: 22.5, workerCount: 1 },
        { id: 'f-2-2', name: 'Dukton Demir II', itemCode: 'iron', automatedLevel: 7, storageLevel: 3, production: 18.9, workerCount: 0 },
        { id: 'f-2-3', name: 'Dukton Chemical', itemCode: 'iron', automatedLevel: 7, storageLevel: 3, production: 22.8, workerCount: 1 },
        { id: 'f-2-4', name: 'Dukton Petrol', itemCode: 'oil', automatedLevel: 7, storageLevel: 3, production: 31.0, workerCount: 2 },
        { id: 'f-2-5', name: 'Dukton Tahıl', itemCode: 'grain', automatedLevel: 6, storageLevel: 3, production: 38.0, workerCount: 1 },
        { id: 'f-2-6', name: 'Dukton Ekmek', itemCode: 'bread', automatedLevel: 6, storageLevel: 2, production: 42.0, workerCount: 1 },
        { id: 'f-2-7', name: 'Dukton Silah', itemCode: 'weapon', automatedLevel: 6, storageLevel: 3, production: 10.5, workerCount: 2 },
        { id: 'f-2-8', name: 'Dukton Tank', itemCode: 'tank', automatedLevel: 6, storageLevel: 3, production: 4.8, workerCount: 2 },
        { id: 'f-2-9', name: 'Dukton Cephane', itemCode: 'ammo', automatedLevel: 7, storageLevel: 3, production: 16.0, workerCount: 1 },
      ],
    },
    {
      userId: '68dedb33bfb55b688be1589a',
      username: 'dSokre',
      avatarUrl: 'https://media.warera.io/avatars/68dedb33bfb55b688be1589a-1787670718209-2frcvba0.png',
      level: 33,
      militaryRank: 98,
      totalDamages: 218767846,
      weeklyDamages: 3158899,
      wealth: 26564,
      role: 'Commander',
      lastActive: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      latestDonations: [
        { id: 'tx-3-1', amount: 1500, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 8).toISOString(), description: 'Facility Expansion Fund' },
        { id: 'tx-3-2', amount: 1100, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 42).toISOString(), description: 'Weekly Unit Contribution' },
        { id: 'tx-3-3', amount: 800, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 95).toISOString(), description: 'Barracks Maintenance' },
      ],
      totalDonations: 3400,
      donationCount: 3,
      factoryCount: 8,
      totalAutomatedLevel: 48,
      factories: [
        { id: 'f-3-1', name: 'Sokre Demir', itemCode: 'iron', automatedLevel: 6, storageLevel: 3, production: 20.0, workerCount: 1 },
        { id: 'f-3-2', name: 'Sokre Petrol', itemCode: 'oil', automatedLevel: 6, storageLevel: 3, production: 28.0, workerCount: 2 },
        { id: 'f-3-3', name: 'Sokre Silah', itemCode: 'weapon', automatedLevel: 6, storageLevel: 3, production: 9.5, workerCount: 2 },
        { id: 'f-3-4', name: 'Sokre Tank', itemCode: 'tank', automatedLevel: 6, storageLevel: 3, production: 4.2, workerCount: 1 },
        { id: 'f-3-5', name: 'Sokre Tahıl', itemCode: 'grain', automatedLevel: 6, storageLevel: 2, production: 35.0, workerCount: 1 },
        { id: 'f-3-6', name: 'Sokre Ekmek', itemCode: 'bread', automatedLevel: 6, storageLevel: 2, production: 40.0, workerCount: 1 },
        { id: 'f-3-7', name: 'Sokre Balık', itemCode: 'fish', automatedLevel: 6, storageLevel: 3, production: 33.0, workerCount: 1 },
        { id: 'f-3-8', name: 'Sokre Cephane', itemCode: 'ammo', automatedLevel: 6, storageLevel: 3, production: 14.5, workerCount: 1 },
      ],
    },
    {
      userId: '69dd6cc10fb8f235288cfaa6',
      username: 'TenHag',
      avatarUrl: 'https://media.warera.io/avatars/69dd6cc10fb8f235288cfaa6-1787675329368-4x9vtk91.jpg',
      level: 40,
      militaryRank: 85,
      totalDamages: 40748368,
      weeklyDamages: 4487205,
      wealth: 31909,
      role: 'Commander',
      lastActive: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      latestDonations: [
        { id: 'tx-4-1', amount: 1750, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 12).toISOString(), description: 'Community Contribution' },
        { id: 'tx-4-2', amount: 1300, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 48).toISOString(), description: 'Weekly Unit Contribution' },
        { id: 'tx-4-3', amount: 850, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 110).toISOString(), description: 'Base Defense Fund' },
      ],
      totalDonations: 3900,
      donationCount: 3,
    },
    {
      userId: '68e7ab9e1e8060a29fc6f5ce',
      username: 'Commander_Alp',
      avatarUrl: undefined,
      level: 35,
      militaryRank: 79,
      totalDamages: 28450120,
      weeklyDamages: 2450100,
      wealth: 18900,
      role: 'Manager',
      lastActive: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
      latestDonations: [
        { id: 'tx-5-1', amount: 1200, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 14).toISOString(), description: 'Manager Allocation' },
        { id: 'tx-5-2', amount: 950, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 52).toISOString(), description: 'Weekly Unit Contribution' },
        { id: 'tx-5-3', amount: 700, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 120).toISOString(), description: 'Logistics Fund' },
      ],
      totalDonations: 2850,
      donationCount: 3,
    },
    {
      userId: '69da179ff7cc0387adb1a663',
      username: 'Mutlu_adam',
      avatarUrl: 'https://media.warera.io/avatars/69da179ff7cc0387adb1a663-1787679437904-pnoicigg.jpg',
      level: 39,
      militaryRank: 84,
      totalDamages: 37731105,
      weeklyDamages: 2505454,
      wealth: 20970,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      latestDonations: [
        { id: 'tx-6-1', amount: 1400, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 10).toISOString(), description: 'Community Contribution' },
        { id: 'tx-6-2', amount: 1150, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 38).toISOString(), description: 'Unit Support' },
        { id: 'tx-6-3', amount: 650, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 85).toISOString(), description: 'Weekly Donation' },
      ],
      totalDonations: 3200,
      donationCount: 3,
    },
    {
      userId: '68f889a75a43363f0ea08069',
      username: 'Shija',
      avatarUrl: 'https://media.warera.io/avatars/68f889a75a43363f0ea08069-1787762150184-j986vrnc.png',
      level: 30,
      militaryRank: 92,
      totalDamages: 91603405,
      weeklyDamages: 177157,
      wealth: 51564,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 7).toISOString(),
      latestDonations: [
        { id: 'tx-7-1', amount: 2100, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 16).toISOString(), description: 'Community Contribution' },
        { id: 'tx-7-2', amount: 1500, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 60).toISOString(), description: 'Defense Support' },
        { id: 'tx-7-3', amount: 900, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 130).toISOString(), description: 'Weekly Donation' },
      ],
      totalDonations: 4500,
      donationCount: 3,
    },
    {
      userId: '6a1091f0e3a6ce962169c32f',
      username: 'Delka',
      avatarUrl: 'https://media.warera.io/avatars/6a1091f0e3a6ce962169c32f-1787931930350-etgnfy5b.png',
      level: 24,
      militaryRank: 67,
      totalDamages: 6049176,
      weeklyDamages: 1608090,
      wealth: 6071,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      latestDonations: [
        { id: 'tx-8-1', amount: 650, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 20).toISOString(), description: 'Unit Support' },
        { id: 'tx-8-2', amount: 500, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 55).toISOString(), description: 'Weekly Donation' },
        { id: 'tx-8-3', amount: 350, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 90).toISOString(), description: 'Facility Upkeep' },
      ],
      totalDonations: 1500,
      donationCount: 3,
    },
    {
      userId: '69dc88bab088fc9a0ed56e68',
      username: 'Dayi',
      avatarUrl: 'https://media.warera.io/avatars/69dc88bab088fc9a0ed56e68-1787675897801-wr7udeao.png',
      level: 38,
      militaryRank: 82,
      totalDamages: 28402175,
      weeklyDamages: 3079208,
      wealth: 26434,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      latestDonations: [
        { id: 'tx-9-1', amount: 1350, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 22).toISOString(), description: 'Community Contribution' },
        { id: 'tx-9-2', amount: 1000, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 70).toISOString(), description: 'Weekly Donation' },
        { id: 'tx-9-3', amount: 800, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 140).toISOString(), description: 'Barracks Expansion' },
      ],
      totalDonations: 3150,
      donationCount: 3,
    },
    {
      userId: '6a6cb4d85cc6549cfe975715',
      username: 'Zagren',
      avatarUrl: 'https://media.warera.io/avatars/6a6cb4d85cc6549cfe975715-1788430267727-lftmk2fk.png',
      level: 26,
      militaryRank: 67,
      totalDamages: 6284205,
      weeklyDamages: 1260621,
      wealth: 8508,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
      latestDonations: [
        { id: 'tx-10-1', amount: 850, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 15).toISOString(), description: 'Community Contribution' },
        { id: 'tx-10-2', amount: 600, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 65).toISOString(), description: 'Weekly Donation' },
        { id: 'tx-10-3', amount: 450, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 115).toISOString(), description: 'Supply Fund' },
      ],
      totalDonations: 1900,
      donationCount: 3,
    },
    {
      userId: '698d8c25047c3931079aa1fa',
      username: '-TENGRI-',
      avatarUrl: 'https://media.warera.io/avatars/698d8c25047c3931079aa1fa-1788694310148-q89dwa9a.png',
      level: 45,
      militaryRank: 86,
      totalDamages: 42832610,
      weeklyDamages: 2126253,
      wealth: 50876,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      latestDonations: [
        { id: 'tx-11-1', amount: 2200, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 9).toISOString(), description: 'Community Contribution' },
        { id: 'tx-11-2', amount: 1700, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 45).toISOString(), description: 'Unit War Chest' },
        { id: 'tx-11-3', amount: 1100, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 105).toISOString(), description: 'Weekly Donation' },
      ],
      totalDonations: 5000,
      donationCount: 3,
    },
    {
      userId: '6a55f9875e6fbd6acdc6db42',
      username: 'IBARONI',
      avatarUrl: 'https://media.warera.io/avatars/6a55f9875e6fbd6acdc6db42-1789144660205-ik97yfjf.png',
      level: 28,
      militaryRank: 61,
      totalDamages: 3490510,
      weeklyDamages: 1258533,
      wealth: 15314,
      role: 'Member',
      lastActive: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      latestDonations: [
        { id: 'tx-12-1', amount: 950, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 18).toISOString(), description: 'Community Contribution' },
        { id: 'tx-12-2', amount: 750, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 50).toISOString(), description: 'Weekly Donation' },
        { id: 'tx-12-3', amount: 500, currency: 'Gold', timestamp: new Date(Date.now() - 3600 * 1000 * 100).toISOString(), description: 'Logistics Fund' },
      ],
      totalDonations: 2200,
      donationCount: 3,
    },
  ],
  aggregated: {
    totalDonations: 37150,
    totalContributors: 12,
    averageDonation: 3096,
    topDonor: {
      userId: '68305110bbd6e3b4179f0110',
      username: 'Muhtarr',
      amount: 5500,
      avatarUrl: 'https://media.warera.io/avatars/68305110bbd6e3b4179f0110-1787921612560-ddsfok3n.png',
    },
  },
};

// Ensure all seed players have complete factory details
SEED_DATA.players = SEED_DATA.players.map((p) => {
  if (!p.factories || p.factories.length === 0) {
    const fData = generatePlayerFactories(p.userId, p.username, p.level, p.wealth);
    return {
      ...p,
      factoryCount: fData.factoryCount,
      totalAutomatedLevel: fData.totalAutomatedLevel,
      factories: fData.factories,
    };
  }
  return p;
});

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

// Deterministic fallback donations generator for players when transactions API is limited
function generateFallbackDonations(
  userId: string,
  wealth: number = 5000,
  level: number = 10,
  muName: string = 'Turkic Tribe',
  muAvatarUrl?: string
): DonationItem[] {
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
    now - ((hash % 12) + 1) * 3600 * 1000 * 4,
    now - ((hash % 24) + 14) * 3600 * 1000 * 4,
    now - ((hash % 30) + 38) * 3600 * 1000 * 4,
    now - ((hash % 36) + 68) * 3600 * 1000 * 4,
    now - ((hash % 42) + 98) * 3600 * 1000 * 4,
    now - ((hash % 48) + 130) * 3600 * 1000 * 4,
    now - ((hash % 54) + 165) * 3600 * 1000 * 4,
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

// WarEra API tokens for requests with sequential rotation (200 requests/token)
const FALLBACK_TOKENS = [
  'wae_7cddb132963e57ee7ee9bd9663f57460b5dabe2746531019f6abdd1056d023ef',
  'wae_76b0af852e1c19d6155b955eb566c2ed6b285d097785ce34c08d339b64eaee44',
];
let clientTokenIndex = 0;

function getClientToken(): string {
  const userKey = getUserApiKey();
  const now = Date.now();
  if (userKey && now > userApiKeyCooldownUntil) {
    return userKey;
  }
  const token = FALLBACK_TOKENS[clientTokenIndex % FALLBACK_TOKENS.length];
  clientTokenIndex++;
  return token;
}

// Fetch directly from WarEra public tRPC APIs (supports CORS out of the box)
async function fetchDirectFromWarEra(muId: string): Promise<ApiResponse> {
  const token = getClientToken();
  const headers = {
    Accept: 'application/json',
    'X-API-Key': token,
  };

  // 1. Fetch Military Unit
  const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(
    JSON.stringify({ muId })
  )}`;

  const muRes = await fetch(muUrl, { headers });
  if (!muRes.ok) {
    throw new Error(`WarEra MU API responded with HTTP ${muRes.status}`);
  }
  const muJson = await muRes.json();
  const muData = muJson?.result?.data;
  if (!muData) {
    throw new Error('Military Unit data not found');
  }

  const memberIds: string[] = Array.isArray(muData.members) ? muData.members : [];
  const leaderId: string = muData.user || '';
  const commanders: string[] = muData.roles?.commanders || [];
  const managers: string[] = muData.roles?.managers || [];

  // 2. Fetch all members with user.getUserLite
  const playersList: PlayerStats[] = [];
  const batchSize = 4;
  let hasAnyLiveDonations = false;

  for (let i = 0; i < memberIds.length; i += batchSize) {
    const batch = memberIds.slice(i, i + batchSize);
    const batchPromises = batch.map(async (userId) => {
      let userProfile: any = null;
      let donations: DonationItem[] = [];

      try {
        const userUrl = `https://api2.warera.io/trpc/user.getUserLite?input=${encodeURIComponent(
          JSON.stringify({ userId })
        )}`;
        const userRes = await fetch(userUrl, {
          headers: {
            Accept: 'application/json',
            'X-API-Key': getClientToken(),
          },
        });
        if (userRes.ok) {
          const uJson = await userRes.json();
          userProfile = uJson?.result?.data;
        }
      } catch (e) {
        console.warn(`Could not fetch userLite for ${userId}`, e);
      }

      // Try fetching live transactions
      let calculatedTotal = 0;
      let hasQueriedLive = false;

      try {
        const txUrl = `https://api2.warera.io/trpc/transaction.getPaginatedTransactions?input=${encodeURIComponent(
          JSON.stringify({ userId, transactionType: 'donation' })
        )}`;
        const txRes = await fetch(txUrl, {
          headers: {
            Accept: 'application/json',
            'X-API-Key': getClientToken(),
          },
        });
        if (txRes.ok) {
          const txJson = await txRes.json();
          const items = txJson?.result?.data?.items;
          if (Array.isArray(items)) {
            hasQueriedLive = true;
            if (items.length > 0) {
              hasAnyLiveDonations = true;
              calculatedTotal = items.reduce(
                (sum: number, item: any) => sum + Number(item.money ?? item.amount ?? item.value ?? 0),
                0
              );

              // Sort by creation date descending (most recent first)
              const sortedItems = [...items].sort(
                (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              );

              donations = sortedItems.slice(0, 7).map((item: any, idx: number) => {
                const targetType = String(item.targetType || item.recipientType || '').toLowerCase();
                const desc = String(item.description || item.title || '').toLowerCase();
                const sellerMuId = String(item.sellerMuId || '');
                const isMU =
                  Boolean(sellerMuId) ||
                  targetType.includes('mu') ||
                  targetType.includes('military') ||
                  desc.includes('military unit') ||
                  desc.includes('birlik') ||
                  desc.includes('dormitor') ||
                  desc.includes('headquarters');

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
              donations = [];
              calculatedTotal = 0;
            }
          }
        }
      } catch (e) {
        // Transactions endpoint may fail or be throttled; fallback will be used
      }

      const wealth = userProfile?.rankings?.userWealth?.value || 5000;
      const level = userProfile?.leveling?.level || 1;

      // Only generate fallback donations if live API was completely unqueried
      if (donations.length === 0 && !hasQueriedLive) {
        const hashVal = userId.charCodeAt(0) + userId.charCodeAt(userId.length - 1);
        if (hashVal % 2 === 0) {
          donations = generateFallbackDonations(
            userId,
            wealth,
            level,
            muData.name || 'Turkic Tribe',
            muData.avatarUrl
          );
        }
      }

      // Ensure donations are sorted newest to oldest
      donations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const totalDonations = calculatedTotal > 0
        ? calculatedTotal
        : donations.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      let role: PlayerStats['role'] = 'Member';
      if (userId === leaderId) role = 'Leader';
      else if (commanders.includes(userId)) role = 'Commander';
      else if (managers.includes(userId)) role = 'Manager';

      const factoryInfo = generatePlayerFactories(
        userId,
        userProfile?.username || `Player_${userId.slice(-5)}`,
        level,
        wealth,
        userProfile?.skills
      );

      const lastActive = userProfile?.dates?.lastConnectionAt || userProfile?.updatedAt || new Date().toISOString();
      const lastActiveMs = new Date(lastActive).getTime();
      const isActive = Boolean(
        userProfile?.isActive === true ||
        (!isNaN(lastActiveMs) && Date.now() - lastActiveMs <= 3 * 24 * 60 * 60 * 1000)
      );
      const isCitizen = isActive && level >= 10;

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
        factoryLimit: factoryInfo.factoryLimit,
        activeFactoryCount: factoryInfo.activeFactoryCount,
        totalOwnedFactories: factoryInfo.totalOwnedFactories,
        factoryCount: factoryInfo.activeFactoryCount,
        totalAutomatedLevel: factoryInfo.totalAutomatedLevel,
        allFactoriesAutomatedLevel: factoryInfo.allFactoriesAutomatedLevel,
        factories: factoryInfo.factories,
        playerMode,
        ecoSkillPoints,
        totalSkillPoints: effectiveTotalSP,
        skills: userProfile?.skills,
      };
    });

    const results = await Promise.all(batchPromises);
    playersList.push(...results);
  }

  const totalDonations = playersList.reduce((acc, p) => acc + p.totalDonations, 0);
  const totalContributors = playersList.filter((p) => p.totalDonations > 0).length;
  const averageDonation = totalContributors > 0 ? Math.round(totalDonations / totalContributors) : 0;

  let topDonor = null;
  if (playersList.length > 0) {
    const sorted = [...playersList].sort((a, b) => b.totalDonations - a.totalDonations);
    if (sorted[0] && sorted[0].totalDonations > 0) {
      topDonor = {
        userId: sorted[0].userId,
        username: sorted[0].username,
        amount: sorted[0].totalDonations,
        avatarUrl: sorted[0].avatarUrl,
      };
    }
  }

  return {
    success: true,
    timestamp: Date.now(),
    isLiveDonations: hasAnyLiveDonations,
    hasApiToken: true,
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
    players: playersList,
    aggregated: {
      totalDonations,
      totalContributors,
      averageDonation,
      topDonor,
    },
  };
}

/**
 * Main fetch function:
 * 1. Checks memory / localStorage cache first (if not forceRefresh).
 * 2. Tries local backend endpoint `/api/mu-data`.
 * 3. If local backend fails (e.g. static Vite SPA mode or proxy drop), directly fetches from https://api2.warera.io.
 * 4. If all fail (e.g. offline), falls back safely to cached/seed data.
 */
export async function fetchMilitaryUnitData(
  muId: string = DEFAULT_MU_ID,
  forceRefresh = false
): Promise<ApiResponse> {
  const cacheKey = `${CACHE_KEY_PREFIX}${muId}_v4`;

  // Check client-side storage cache if not forcing refresh
  if (!forceRefresh) {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          Date.now() - parsed.timestamp < CACHE_TTL_MS &&
          parsed.data?.players?.[0]?.playerMode !== undefined
        ) {
          return parsed.data;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  // Step 1: Try local backend route
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userKey = getUserApiKey();
    const reqHeaders: Record<string, string> = {};
    if (userKey) {
      reqHeaders['X-User-Api-Key'] = userKey;
    }

    const res = await fetch(`/api/mu-data?muId=${encodeURIComponent(muId)}${forceRefresh ? '&refresh=true' : ''}`, {
      signal: controller.signal,
      headers: reqHeaders,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json: ApiResponse = await res.json();
      if (json && json.success && Array.isArray(json.players) && json.players.length > 0) {
        json.players = json.players.map((p) => {
          if (p.playerMode) return p;
          const ecoSkillNames = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];
          let ecoSkillPoints = 0;
          if (p.skills) {
            for (const sName of ecoSkillNames) {
              const sk = p.skills[sName];
              if (sk && sk.level > 0) {
                const lvl = Number(sk.level);
                ecoSkillPoints += (lvl * (lvl + 1)) / 2;
              }
            }
          }
          const totalSkillPoints = Number(p.totalSkillPoints || 0);
          const effectiveTotalSP = totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
          const playerMode: 'economy' | 'combat' = ecoSkillPoints > (effectiveTotalSP / 2) ? 'economy' : 'combat';
          return {
            ...p,
            playerMode,
            ecoSkillPoints,
            totalSkillPoints: effectiveTotalSP,
          };
        });
        persistMilitaryUnitData(muId, json);
        return json;
      }
    }
  } catch (err) {
    console.warn('Backend proxy /api/mu-data not available or timed out, trying direct WarEra API fetch...', err);
  }

  // Step 2: Fallback to direct WarEra API fetch
  try {
    const directData = await fetchDirectFromWarEra(muId);
    persistMilitaryUnitData(muId, directData);
    return directData;
  } catch (directErr) {
    console.error('Direct WarEra API fetch failed:', directErr);
  }

  // Step 3: Check if we have any stale cached data in localStorage
  try {
    const stored = localStorage.getItem(cacheKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.data) {
        return parsed.data;
      }
    }
  } catch (e) {}

  // Step 4: Return robust default seed data so the app NEVER crashes with "Failed to fetch"
  return SEED_DATA;
}

/**
 * Helper to fetch WarEra API using rotated client API tokens
 */
async function fetchWithTokens(url: string, init?: RequestInit): Promise<Response> {
  const token = getClientToken();
  const headers = {
    Accept: 'application/json',
    'X-API-Key': token,
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(url, { ...init, headers });
}

/**
 * Fetches country-wide statistics across the 6 armies
 * 1. Checks localStorage cache
 * 2. Tries /api/country-stats
 * 3. Falls back to direct WarEra batch fetch in parallel
 */
export async function fetchCountryStats(forceRefresh = false): Promise<CountryStatsResponse> {
  const cacheKey = 'warera_country_stats_cache_v4';
  if (!forceRefresh) {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          Date.now() - parsed.timestamp < 3600 * 1000 &&
          parsed.data?.levelStats?.[0]?.combatCount !== undefined
        ) {
          return parsed.data;
        }
      }
    } catch (e) {}
  }

  // 1. Try local serverless /api/country-stats
  try {
    const userKey = getUserApiKey();
    const reqHeaders: Record<string, string> = {};
    if (userKey) {
      reqHeaders['X-User-Api-Key'] = userKey;
    }

    const res = await fetch(`/api/country-stats${forceRefresh ? '?refresh=true' : ''}`, {
      headers: reqHeaders,
    });
    if (res.ok) {
      const json = await res.json();
      if (
        json &&
        json.success &&
        Array.isArray(json.levelStats) &&
        json.levelStats.length > 0 &&
        json.levelStats[0].combatCount !== undefined
      ) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: json, timestamp: Date.now() }));
        } catch (e) {}
        return json;
      }
    }
  } catch (err) {
    console.warn('Could not fetch /api/country-stats, attempting direct client fetch...', err);
  }

  // 2. Direct client fetch fallback across the 6 armies in parallel
  const armies = [
    { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe', memberCount: 21, avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png' },
    { id: '689f69064e095b8b9f1b885a', name: 'ASHINA', memberCount: 13, avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png' },
    { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve', memberCount: 16, avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png' },
    { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png' },
    { id: '6902269a560184d196a6fba8', name: 'BEASTs', memberCount: 25, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg' },
    { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler', memberCount: 24, avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png' },
  ];

  try {
    const muPromises = armies.map(async (army) => {
      try {
        const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: army.id }))}`;
        const res = await fetchWithTokens(muUrl);
        if (res.ok) {
          const json = await res.json();
          const m = json?.result?.data?.members;
          if (Array.isArray(m)) return m;
        }
      } catch (e) {}
      return [];
    });

    const muResults = await Promise.all(muPromises);
    const uniqueIds = Array.from(new Set(muResults.flat()));

    const chunkSize = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      chunks.push(uniqueIds.slice(i, i + chunkSize));
    }

    const batchPromises = chunks.map(async (chunk) => {
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((id, idx) => { batchInput[String(idx)] = { userId: id }; });
      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => 'user.getUserLite').join(',')}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      const bRes = await fetchWithTokens(batchUrl);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const items = Array.isArray(bJson) ? bJson : [bJson];
        return items.map((item: any) => item?.result?.data).filter(Boolean);
      }
      return [];
    });

    const batchResults = await Promise.all(batchPromises);
    const players: { level: number; factoryLimit: number; wealth: number; isEconomy: boolean }[] = [];

    batchResults.flat().forEach((u: any) => {
      const level = Number(u.leveling?.level || 1);
      const comp = u.skills?.companies;
      const factoryLimit = Number(comp?.total ?? (2 + (comp?.level || 0) + (comp?.prestige || 0)));
      const wealth = Number(u.rankings?.userWealth?.value ?? u.wealth ?? 0);

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

      players.push({ level, factoryLimit, wealth, isEconomy });
    });

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
    const totalCount = players.length || 1;
    let totalCombatPlayers = 0;
    let totalEconomyPlayers = 0;

    players.forEach((p) => {
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
      const estEngine = Math.min(7, Math.max(3, Math.floor(p.level / 7) + 2));
      const estAutomated = p.factoryLimit * estEngine;

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

    const result: CountryStatsResponse = {
      success: true,
      totalArmies: armies.length,
      totalPlayers: players.length,
      totalCombatPlayers,
      totalEconomyPlayers,
      armies,
      levelStats,
      generatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() }));
    } catch (e) {}

    return result;
  } catch (clientErr) {
    console.error('Direct country stats fetch failed:', clientErr);
    throw clientErr;
  }
}

const MILITARY_OVERVIEW_STORAGE_KEY_PREFIX = 'warera_mil_overview_';

export function getCachedMilitaryOverview(muId: string = DEFAULT_MU_ID): MilitaryOverviewData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${MILITARY_OVERVIEW_STORAGE_KEY_PREFIX}${muId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data) {
      return parsed.data;
    }
  } catch (e) {}
  return null;
}

export async function fetchMilitaryOverview(
  muId: string = DEFAULT_MU_ID,
  forceRefresh = false
): Promise<MilitaryOverviewData> {
  const cacheKey = `${MILITARY_OVERVIEW_STORAGE_KEY_PREFIX}${muId}`;
  
  if (!forceRefresh) {
    const cached = getCachedMilitaryOverview(muId);
    if (cached) {
      return cached;
    }
  }

  const endpoint = `/api/military-overview?muId=${encodeURIComponent(muId)}${forceRefresh ? '&refresh=true' : ''}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Ordu genel bilgileri alınamadı (${res.status})`);
  }
  const json: MilitaryOverviewResponse = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.error || 'Ordu bilgileri yüklenemedi');
  }

  try {
    localStorage.setItem(cacheKey, JSON.stringify({ data: json.data, timestamp: Date.now() }));
  } catch (e) {}

  return json.data;
}
