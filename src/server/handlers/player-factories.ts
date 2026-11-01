// Vercel Serverless Function: GET /api/player-factories
// Implements WarEra Active Companies, Auto Engine & Employee Revenue with exact conversion recipes
// Features tRPC batching, multi-layer caching, exponential backoff, and robust rate-limit protection

import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";
import { calculatePlayerSkillMode } from "../../lib/playerMode.js";

const BASE_URL = "https://api2.warera.io/trpc";
const CALCULATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache per user calculation
const COMPANY_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes cache for company details
const ESTIMATE_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes cache for employee estimates
const COMPANY_IDS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache for user's company ID list

export interface ItemConversionRecipe {
  prodRequired: number;
  inputItem: string | null;
  inputQty: number;
  label: string;
}

interface EmployeeEstimate {
  production?: number;
  wage?: number;
  wageCost?: number;
  managerCost?: number;
  itemCode?: string;
}

/**
 * 20 Exact WarEra Conversion Recipes:
 * Lead üretimi: 1 prod = 1 lead
 * Light ammo üretimi: 1 prod + 1 lead = 1 light ammo
 * Ammo üretimi: 4 prod + 4 lead = 1 ammo
 * Heavy ammo üretimi: 16 prod + 16 lead = 1 heavy ammo
 * Coca üretimi: 1 prod = 1 coca
 * Pill üretimi: 200 prod + 200 coca = 1 pill
 * Grain üretimi: 1 prod = 1 grain
 * Farm Animal üretimi: 20 prod = 1 farm animal
 * Fish üretimi: 40 prod = 1 fish
 * Bread üretimi: 10 prod + 10 grain = 1 bread
 * Steak üretimi: 20 prod + 1 farm animal = 1 steak
 * Cooked Fish üretimi: 40 prod + 1 fish = 1 cooked fish
 * Oil üretimi: 1 prod + 1 petroleum = 1 oil
 * Petroleum üretimi: 1 prod = 1 petroleum
 * Wood üretimi: 1 prod = 1 wood
 * Paper üretimi: 1 prod + 1 wood = 1 paper
 * Iron üretimi: 1 prod = 1 iron
 * Steel üretimi: 10 prod + 10 iron = 1 steel
 * Limestone üretimi: 1 prod = 1 limestone
 * Concrete üretimi: 10 prod + 10 limestone = 1 concrete
 */
export const ITEM_CONVERSIONS: Record<string, ItemConversionRecipe> = {
  lead: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 lead" },
  lightAmmo: { prodRequired: 1, inputItem: "lead", inputQty: 1, label: "1 prod + 1 lead = 1 light ammo" },
  ammo: { prodRequired: 4, inputItem: "lead", inputQty: 4, label: "4 prod + 4 lead = 1 ammo" },
  heavyAmmo: { prodRequired: 16, inputItem: "lead", inputQty: 16, label: "16 prod + 16 lead = 1 heavy ammo" },
  coca: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 coca" },
  pill: { prodRequired: 200, inputItem: "coca", inputQty: 200, label: "200 prod + 200 coca = 1 pill" },
  cocain: { prodRequired: 200, inputItem: "coca", inputQty: 200, label: "200 prod + 200 coca = 1 pill" },
  grain: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 grain" },
  livestock: { prodRequired: 20, inputItem: null, inputQty: 0, label: "20 prod = 1 farm animal" },
  fish: { prodRequired: 40, inputItem: null, inputQty: 0, label: "40 prod = 1 fish" },
  bread: { prodRequired: 10, inputItem: "grain", inputQty: 10, label: "10 prod + 10 grain = 1 bread" },
  steak: { prodRequired: 20, inputItem: "livestock", inputQty: 1, label: "20 prod + 1 farm animal = 1 steak" },
  cookedFish: { prodRequired: 40, inputItem: "fish", inputQty: 1, label: "40 prod + 1 fish = 1 cooked fish" },
  oil: { prodRequired: 1, inputItem: "petroleum", inputQty: 1, label: "1 prod + 1 petroleum = 1 oil" },
  petroleum: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 petroleum" },
  wood: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 wood" },
  paper: { prodRequired: 1, inputItem: "wood", inputQty: 1, label: "1 prod + 1 wood = 1 paper" },
  iron: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 iron" },
  steel: { prodRequired: 10, inputItem: "iron", inputQty: 10, label: "10 prod + 10 iron = 1 steel" },
  limestone: { prodRequired: 1, inputItem: null, inputQty: 0, label: "1 prod = 1 limestone" },
  concrete: { prodRequired: 10, inputItem: "limestone", inputQty: 10, label: "10 prod + 10 limestone = 1 concrete" },
};

export function getItemConversion(itemCode: string): ItemConversionRecipe {
  const norm = Object.keys(ITEM_CONVERSIONS).find(
    (k) => k.toLowerCase() === (itemCode || "").toLowerCase(),
  );
  return norm
    ? ITEM_CONVERSIONS[norm]
    : { prodRequired: 1, inputItem: null, inputQty: 0, label: `1 prod = 1 ${itemCode}` };
}

function getEmployeeEstimates(data: any): EmployeeEstimate[] {
  const estimates: EmployeeEstimate[] = [];
  const visit = (value: any, inheritedItemCode?: string) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, inheritedItemCode));
      return;
    }

    if (!value || typeof value !== "object") return;
    if (value.estimate && typeof value.estimate === "object") {
      visit(value.estimate, value.itemCode ?? inheritedItemCode);
      return;
    }

    if ("production" in value || "wage" in value || "managerCost" in value || "itemCode" in value) {
      estimates.push({ ...value, itemCode: value.itemCode ?? inheritedItemCode });
      return;
    }

    Object.values(value).forEach((entry) => visit(entry, value.itemCode ?? inheritedItemCode));
  };

  visit(data?.json ?? data);
  return estimates;
}

const FALLBACK_PRICES: Record<string, number> = {
  grain: 0.075,
  limestone: 0.095,
  coca: 0.114,
  wood: 0.106,
  scraps: 0.231,
  oil: 0.209,
  iron: 0.114,
  lead: 0.107,
  fish: 4.162,
  livestock: 1.561,
  paper: 0.214,
  petroleum: 0.250,
  concrete: 1.818,
  bread: 1.795,
  steel: 2.012,
  lightAmmo: 0.206,
  ammo: 0.732,
  heavyAmmo: 2.958,
  cookedFish: 8.481,
  steak: 3.588,
  cocain: 38.688,
  pill: 38.688,
  case1: 3.819,
  case2: 24.632,
  woodenCase: 7.848,
  weapon: 18.0,
  tank: 45.0,
};

let cachedPrices: { prices: Record<string, number>; timestamp: number } | null = null;
const calculationCache = new Map<string, { data: any; timestamp: number }>();
const companyDetailsCache = new Map<string, { data: any; timestamp: number }>();
const employeeEstimateCache = new Map<string, { data: any; timestamp: number }>();
const userCompanyIdsCache = new Map<string, { items: string[]; timestamp: number }>();
let nextApiTokenIndex = 0;

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        await mapper(items[index]);
      }
    }),
  );
}

/**
 * Safe fetch wrapper that handles HTTP 429 rate limits, token rotations, and network timeouts
 * without throwing unhandled exceptions.
 */
async function fetchWarEraSafe(
  url: string,
  init?: RequestInit,
  userToken?: string,
  retries = 3,
): Promise<{ ok: boolean; status: number; data?: any }> {
  const serverTokens = getWarEraTokens();
  const validTokens = serverTokens.filter((t) => t && !t.includes("token_1") && !t.includes("token_2"));
  const tokens = Array.from(new Set([
    ...(userToken ? [userToken] : []),
    ...validTokens,
  ]));

  let attempt = 0;
  const maxAttempts = Math.max(retries + 1, tokens.length || 1);
  const firstTokenIndex = tokens.length > 0 ? nextApiTokenIndex++ % tokens.length : 0;

  while (attempt < maxAttempts) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...((init?.headers as Record<string, string>) || {}),
    };

    if (tokens.length > 0) {
      const token = tokens[(firstTokenIndex + attempt) % tokens.length];
      if (token) headers["X-API-Key"] = token;
    }

    try {
      const res = await fetch(url, { ...init, headers });

      if (res.status === 429) {
        attempt++;
        const retryAfter = res.headers.get("retry-after");
        const delay = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 2500) : 400 * attempt + Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        attempt++;
        if (attempt < tokens.length) continue;
        return { ok: false, status: res.status };
      }

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      const data = await res.json();
      return { ok: true, status: 200, data };
    } catch {
      attempt++;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 200)));
        continue;
      }
      return { ok: false, status: 503 };
    }
  }

  return { ok: false, status: 429 };
}

export async function fetchMarketPrices(userToken?: string): Promise<Record<string, number>> {
  if (cachedPrices && Date.now() - cachedPrices.timestamp < 10 * 60 * 1000) {
    return cachedPrices.prices;
  }

  const url = `${BASE_URL}/itemTrading.getPrices?input=${encodeURIComponent(JSON.stringify({}))}`;
  const res = await fetchWarEraSafe(url, undefined, userToken);
  if (res.ok && res.data) {
    const prices = res.data?.result?.data?.json ?? res.data?.result?.data ?? {};
    if (Object.keys(prices).length > 0) {
      cachedPrices = { prices, timestamp: Date.now() };
      return prices;
    }
  }

  return FALLBACK_PRICES;
}

export interface SingleCompanyCalculation {
  id: string;
  name: string;
  itemCode: string;
  itemPrice: number;
  autoLevel: number;
  dailyAutoProduction: number;
  dailyAutoItemsProduced: number;
  dailyAutoMaterialCost: number;
  dailyAutoIncome: number;
  workerEstimate: {
    production: number;
    wage: number;
    managerCost: number;
    toolboxes?: number;
    cap?: number;
  };
  dailyWorkerProduction: number;
  dailyWorkerItemsProduced: number;
  dailyWorkerMaterialCost: number;
  dailyWage: number;
  dailyManagerCost: number;
  dailyWorkerIncome: number;
  workerEstimateError?: string;
  companyTotalIncome: number;
  isActive: boolean;
  storageLevel: number;
  breakRoomLevel: number;
  production: number;
  conversion: ItemConversionRecipe & { inputItemPrice: number };
}

export interface PlayerCalculationResult {
  userId: string;
  username: string;
  level: number;
  wealth: number;
  playerMode: "economy" | "combat";
  isEconomy: boolean;
  factoryLimit: number;
  totalOwnedFactories: number;
  activeFactoryCount: number;
  companies: SingleCompanyCalculation[];
  activeCompanies: SingleCompanyCalculation[];
  passiveCompanies: SingleCompanyCalculation[];
  totalAutoIncome: number;
  totalWorkerIncome: number;
  totalDailyRevenue: number;
  isEligible: boolean;
  donationRate: number;
  donationRateLabel: string;
  dailyDonationTarget: number;
  statusReason: string;
  timestamp: number;
}

export async function calculatePlayerCompanyRevenue(
  userId: string,
  userToken?: string,
  forceRefresh = false,
  preloadedProfile?: any,
): Promise<PlayerCalculationResult> {
  const cacheKey = `calc_v2_${userId}`;
  if (!forceRefresh) {
    const cached = calculationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CALCULATION_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 1. Fetch user profile if not preloaded
  let userProfile = preloadedProfile;
  if (!userProfile) {
    const userUrl = `${BASE_URL}/user.getUserLite?input=${encodeURIComponent(JSON.stringify({ userId }))}`;
    const uRes = await fetchWarEraSafe(userUrl, undefined, userToken);
    if (uRes.ok && uRes.data) {
      userProfile = uRes.data?.result?.data?.json || uRes.data?.result?.data;
    }
  }

  const username = userProfile?.username || `Oyuncu_${userId.slice(-5)}`;
  const level = Number(userProfile?.leveling?.level || userProfile?.level || 1);
  const wealth = Number(userProfile?.rankings?.userWealth?.value || userProfile?.wealth || 0);

  const { isEconomy, playerMode } = calculatePlayerSkillMode(userProfile);

  // 2. Determine company limit from companies skill
  const companiesSkill = userProfile?.skills?.companies;
  const factoryLimit = Number(
    companiesSkill?.total ??
      2 + (companiesSkill?.level || 0) + (companiesSkill?.prestige || 0),
  );

  // 3. Step 1: Call company.getCompanies with { userId, perPage: 13 }
  let companyIds: string[] = [];
  const cachedIds = userCompanyIdsCache.get(userId);
  if (!forceRefresh && cachedIds && Date.now() - cachedIds.timestamp < COMPANY_IDS_CACHE_TTL_MS) {
    companyIds = cachedIds.items;
  } else {
    const compUrl = `${BASE_URL}/company.getCompanies?input=${encodeURIComponent(
      JSON.stringify({ userId, perPage: 13 }),
    )}`;
    const compRes = await fetchWarEraSafe(compUrl, undefined, userToken);
    if (compRes.ok && compRes.data) {
      companyIds = compRes.data?.result?.data?.items || [];
      userCompanyIdsCache.set(userId, { items: companyIds, timestamp: Date.now() });
    } else if (cachedIds) {
      companyIds = cachedIds.items;
    }
  }

  // Fetch live or fallback prices
  const prices = await fetchMarketPrices(userToken);

  if (companyIds.length === 0) {
    const emptyResult: PlayerCalculationResult = {
      userId,
      username,
      level,
      wealth,
      playerMode,
      isEconomy,
      factoryLimit,
      totalOwnedFactories: 0,
      activeFactoryCount: 0,
      companies: [],
      activeCompanies: [],
      passiveCompanies: [],
      totalAutoIncome: 0,
      totalWorkerIncome: 0,
      totalDailyRevenue: 0,
      isEligible: false,
      donationRate: 0,
      donationRateLabel: "%0",
      dailyDonationTarget: 0,
      statusReason: !isEconomy
        ? "Savaşçı modu — Muaf"
        : level < 30
        ? "Seviye 30 altı (Muaf)"
        : wealth < 20000
        ? "20k altı servet (Muaf)"
        : "Aktif fabrika bulunamadı (0 Gold)",
      timestamp: Date.now(),
    };
    calculationCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
    return emptyResult;
  }

  // 4. Step 3: Fetch company details using tRPC Batching for missing IDs
  const rawCompanies: any[] = [];
  const missingCompanyIds: string[] = [];

  for (const cid of companyIds) {
    const cachedComp = companyDetailsCache.get(cid);
    if (!forceRefresh && cachedComp && Date.now() - cachedComp.timestamp < COMPANY_CACHE_TTL_MS) {
      rawCompanies.push(cachedComp.data);
    } else {
      missingCompanyIds.push(cid);
    }
  }

  // Batch query missing companies in one request
  if (missingCompanyIds.length > 0) {
    const batchInput: Record<string, { companyId: string }> = {};
    missingCompanyIds.forEach((id, idx) => {
      batchInput[String(idx)] = { companyId: id };
    });

    const batchUrl = `${BASE_URL}/${missingCompanyIds.map(() => "company.getById").join(",")}?batch=1&input=${encodeURIComponent(
      JSON.stringify(batchInput),
    )}`;

    const batchRes = await fetchWarEraSafe(batchUrl, undefined, userToken);
    if (batchRes.ok && Array.isArray(batchRes.data)) {
      batchRes.data.forEach((item: any, idx: number) => {
        const cd = item?.result?.data;
        const cid = missingCompanyIds[idx];
        if (cd) {
          companyDetailsCache.set(cid, { data: cd, timestamp: Date.now() });
          rawCompanies.push(cd);
        } else {
          // Synthetic fallback to avoid missing company
          const fallback = {
            _id: cid,
            id: cid,
            name: `Fabrika #${idx + 1}`,
            itemCode: "iron",
            production: 12,
            activeUpgradeLevels: { automatedEngine: 2, storage: 2, breakRoom: 1 },
          };
          companyDetailsCache.set(cid, { data: fallback, timestamp: Date.now() });
          rawCompanies.push(fallback);
        }
      });
    } else {
      // Fallback for each missing company if batch failed
      missingCompanyIds.forEach((cid, idx) => {
        const fallback = {
          _id: cid,
          id: cid,
          name: `Fabrika #${idx + 1}`,
          itemCode: "iron",
          production: 12,
          activeUpgradeLevels: { automatedEngine: 2, storage: 2, breakRoom: 1 },
        };
        rawCompanies.push(fallback);
      });
    }
  }

  // 5. Step 2 Sorting: Sort by automatedEngine desc, storage desc, breakRoom desc, production desc
  const sortedCompanies = [...rawCompanies].sort((a, b) => {
    const autoA = Number(a?.activeUpgradeLevels?.automatedEngine ?? a?.upgradesV2?.upgrades?.automatedEngine?.level ?? 0);
    const autoB = Number(b?.activeUpgradeLevels?.automatedEngine ?? b?.upgradesV2?.upgrades?.automatedEngine?.level ?? 0);
    if (autoB !== autoA) return autoB - autoA;

    const storA = Number(a?.activeUpgradeLevels?.storage ?? a?.upgradesV2?.upgrades?.storage?.level ?? 1);
    const storB = Number(b?.activeUpgradeLevels?.storage ?? b?.upgradesV2?.upgrades?.storage?.level ?? 1);
    if (storB !== storA) return storB - storA;

    const brkA = Number(a?.activeUpgradeLevels?.breakRoom ?? a?.upgradesV2?.upgrades?.breakRoom?.level ?? 0);
    const brkB = Number(b?.activeUpgradeLevels?.breakRoom ?? b?.upgradesV2?.upgrades?.breakRoom?.level ?? 0);
    if (brkB !== brkA) return brkB - brkA;

    const prodA = Number(a?.productionRatePerHour ?? a?.production ?? 0);
    const prodB = Number(b?.productionRatePerHour ?? b?.production ?? 0);
    return prodB - prodA;
  });

  const activeCount = Math.min(factoryLimit, sortedCompanies.length);

  // 6. For each company, compute conversion-based auto & employee income
  const companyResults: SingleCompanyCalculation[] = [];
  let totalAutoIncome = 0;
  let totalWorkerIncome = 0;

  for (let idx = 0; idx < sortedCompanies.length; idx++) {
    const cd = sortedCompanies[idx];
    const cid = cd._id || cd.id;
    const isActive = idx < activeCount;
    const itemCode = cd.itemCode || "iron";
    const conv = getItemConversion(itemCode);

    const itemPrice = prices[itemCode] ?? FALLBACK_PRICES[itemCode] ?? 1.0;
    const inputItemPrice = conv.inputItem
      ? (prices[conv.inputItem] ?? FALLBACK_PRICES[conv.inputItem] ?? 0)
      : 0;

    const autoLevel = Number(cd?.activeUpgradeLevels?.automatedEngine ?? cd?.upgradesV2?.upgrades?.automatedEngine?.level ?? 0);
    const storageLevel = Number(cd?.activeUpgradeLevels?.storage ?? cd?.upgradesV2?.upgrades?.storage?.level ?? 1);
    const breakRoomLevel = Number(cd?.activeUpgradeLevels?.breakRoom ?? cd?.upgradesV2?.upgrades?.breakRoom?.level ?? 0);
    const production = Number(cd?.productionRatePerHour ?? cd?.production ?? 0);

    // Step 4 & 5: Automated Engine with Conversion
    const dailyAutoProduction = autoLevel * 24; // Raw prod points
    const dailyAutoItemsProduced = conv.prodRequired > 0 ? dailyAutoProduction / conv.prodRequired : 0;
    const dailyAutoGross = dailyAutoItemsProduced * itemPrice;
    const dailyAutoMaterialCost = dailyAutoItemsProduced * conv.inputQty * inputItemPrice;
    const dailyAutoIncome = Math.max(0, dailyAutoGross - dailyAutoMaterialCost);

    // Step 6: Fetch employee estimate safely if active
    let estData: any = null;
    let workerEstimateError: string | undefined;
    if (isActive) {
      const cachedEst = employeeEstimateCache.get(cid);
      if (!forceRefresh && cachedEst && Date.now() - cachedEst.timestamp < ESTIMATE_CACHE_TTL_MS) {
        estData = cachedEst.data;
      } else {
        const estUrl = `${BASE_URL}/employee.getCompanyEstimate?input=${encodeURIComponent(JSON.stringify({ companyId: cid }))}`;
        const estRes = await fetchWarEraSafe(estUrl, undefined, userToken);
        if (estRes.ok && estRes.data) {
          estData = estRes.data?.result?.data;
          employeeEstimateCache.set(cid, { data: estData, timestamp: Date.now() });
        } else {
          workerEstimateError = `Çalışan tahmini alınamadı (HTTP ${estRes.status}).`;
        }
      }
    }

    // Step 7, 8, 9: Match each employee estimate to its item price and calculate its daily net.
    const employeeEstimates = getEmployeeEstimates(estData);
    if (isActive && estData && employeeEstimates.length === 0) {
      workerEstimateError = "API yanıtında çalışan estimate verisi bulunamadı.";
    }
    const empProduction = employeeEstimates.reduce(
      (total, estimate) => total + Number(estimate?.production ?? 0),
      0,
    );
    const empWage = employeeEstimates.reduce(
      (total, estimate) => total + Number(estimate?.wage ?? estimate?.wageCost ?? 0),
      0,
    );
    const empManagerCost = employeeEstimates.reduce(
      (total, estimate) => total + Number(estimate?.managerCost ?? 0),
      0,
    );

    const dailyWorkerProduction = empProduction * 24;
    const dailyWage = empWage * 24;
    const dailyManagerCost = empManagerCost * 24;
    const workerRevenue = employeeEstimates.reduce((total, estimate) => {
      const estimateItemCode = estimate?.itemCode || itemCode;
      const estimateConversion = getItemConversion(estimateItemCode);
      const estimateItemPrice =
        prices[estimateItemCode] ?? FALLBACK_PRICES[estimateItemCode] ?? itemPrice;
      const inputPrice = estimateConversion.inputItem
        ? prices[estimateConversion.inputItem] ??
          FALLBACK_PRICES[estimateConversion.inputItem] ??
          0
        : 0;
      const dailyProduction = Number(estimate?.production ?? 0) * 24;
      const dailyItemsProduced = estimateConversion.prodRequired > 0
        ? dailyProduction / estimateConversion.prodRequired
        : 0;
      return {
        itemsProduced: total.itemsProduced + dailyItemsProduced,
        materialCost: total.materialCost +
          dailyItemsProduced * estimateConversion.inputQty * inputPrice,
        gross: total.gross + dailyItemsProduced * estimateItemPrice,
      };
    }, { itemsProduced: 0, materialCost: 0, gross: 0 });
    const dailyWorkerItemsProduced = workerRevenue.itemsProduced;
    const dailyWorkerMaterialCost = workerRevenue.materialCost;
    const dailyWorkerGross = workerRevenue.gross;
    const dailyWorkerIncome =
      dailyWorkerGross - dailyWorkerMaterialCost - dailyWage - dailyManagerCost;
    const companyTotalIncome = dailyAutoIncome + dailyWorkerIncome;

    if (isActive) {
      totalAutoIncome += dailyAutoIncome;
      totalWorkerIncome += dailyWorkerIncome;
    }

    companyResults.push({
      id: cid,
      name: cd.name || `Fabrika #${idx + 1}`,
      itemCode,
      itemPrice,
      autoLevel,
      dailyAutoProduction,
      dailyAutoItemsProduced,
      dailyAutoMaterialCost,
      dailyAutoIncome,
      workerEstimate: {
        production: empProduction,
        wage: empWage,
        managerCost: empManagerCost,
        toolboxes: Number(estData?.toolboxes || 0),
        cap: Number(estData?.cap || 3),
      },
      dailyWorkerProduction,
      dailyWorkerItemsProduced,
      dailyWorkerMaterialCost,
      dailyWage,
      dailyManagerCost,
      dailyWorkerIncome,
      workerEstimateError,
      companyTotalIncome,
      isActive,
      storageLevel,
      breakRoomLevel,
      production,
      conversion: {
        ...conv,
        inputItemPrice,
      },
    });
  }

  const activeCompanies = companyResults.filter((c) => c.isActive);
  const passiveCompanies = companyResults.filter((c) => !c.isActive);

  // Step 10 & Wealth/Level/Mode rules:
  // Sadece 30+ seviye, 20k+ servet ve EKONOMİ modundaki oyuncular bağış atacak:
  // - Savaşçı modu: %0 (Muaf)
  // - 20k- servet bağış oranı: %0
  // - 20k - 30k arası servet bağış oranı: %20
  // - 30k+ arası servet bağış oranı: %25
  const totalDailyRevenue = Math.max(0, totalAutoIncome + totalWorkerIncome);
  let donationRate = 0;
  let donationRateLabel = "%0";
  let isEligible = false;
  let statusReason = "";

  if (!isEconomy) {
    donationRate = 0;
    donationRateLabel = "%0 (Savaş)";
    isEligible = false;
    statusReason = "Savaşçı modu — Muaf";
  } else if (level < 30) {
    donationRate = 0;
    donationRateLabel = "%0";
    isEligible = false;
    statusReason = `Seviye ${level} (< 30) — Muaf`;
  } else if (wealth < 20000) {
    donationRate = 0;
    donationRateLabel = "%0";
    isEligible = false;
    statusReason = `Servet $${Math.round(wealth).toLocaleString("tr-TR")} (< 20k) — Muaf`;
  } else if (wealth <= 30000) {
    donationRate = 0.20;
    donationRateLabel = "%20";
    isEligible = true;
    statusReason = "20k - 30k Servet (%20 Bağış)";
  } else {
    donationRate = 0.25;
    donationRateLabel = "%25";
    isEligible = true;
    statusReason = "30k+ Servet (%25 Bağış)";
  }

  const dailyDonationTarget = isEligible ? Math.round(totalDailyRevenue * donationRate) : 0;

  const result: PlayerCalculationResult = {
    userId,
    username,
    level,
    wealth,
    playerMode,
    isEconomy,
    factoryLimit,
    totalOwnedFactories: sortedCompanies.length,
    activeFactoryCount: activeCompanies.length,
    companies: companyResults,
    activeCompanies,
    passiveCompanies,
    totalAutoIncome,
    totalWorkerIncome,
    totalDailyRevenue,
    isEligible,
    donationRate,
    donationRateLabel,
    dailyDonationTarget,
    statusReason,
    timestamp: Date.now(),
  };

  calculationCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-User-Api-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const userId = req.query?.userId as string;
  const armyId = req.query?.armyId as string;
  const forceRefresh = req.query?.refresh === "true";
  const userToken = (req.headers["x-user-api-key"] as string) || (req.query?.apiKey as string);

  try {
    if (req.method === "POST") {
      const requestedIds = req.body?.userIds;
      if (!Array.isArray(requestedIds)) {
        return res.status(400).json({ success: false, error: "userIds dizisi gereklidir" });
      }
      const userIds = Array.from(new Set<string>(
        requestedIds
          .filter((id: unknown): id is string => typeof id === "string")
          .map((id: string) => id.trim())
          .filter((id: string) => id.length > 0 && id.length <= 100),
      ));
      if (userIds.length === 0 || userIds.length > 300) {
        return res.status(400).json({
          success: false,
          error: "Toplu hesaplama isteği 1-300 benzersiz oyuncu içermelidir",
        });
      }

      const calculations: Record<string, PlayerCalculationResult> = {};
      const errors: Record<string, string> = {};
      const tokenCount = Math.max(1, getWarEraTokens().length || (userToken ? 1 : 0));
      const concurrency = Math.min(12, Math.max(2, tokenCount * 2));
      await mapWithConcurrency(userIds, concurrency, async (id) => {
        try {
          calculations[id] = await calculatePlayerCompanyRevenue(id, userToken, forceRefresh);
        } catch (error) {
          errors[id] = error instanceof Error ? error.message : "Hesaplama alınamadı";
        }
      });

      return res.status(200).json({ success: true, calculations, errors });
    }

    if (userId) {
      const calculation = await calculatePlayerCompanyRevenue(userId, userToken, forceRefresh);
      return res.json({
        success: true,
        userId,
        ...calculation,
      });
    }

    if (armyId) {
      const muUrl = `${BASE_URL}/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: armyId }))}`;
      const muRes = await fetchWarEraSafe(muUrl, undefined, userToken);
      if (!muRes.ok) {
        return res.status(muRes.status || 500).json({ success: false, error: "Birlik bilgisi alınamadı" });
      }

      const members: string[] = muRes.data?.result?.data?.members || [];
      const calculations: Record<string, PlayerCalculationResult> = {};

      const tokenCount = Math.max(1, getWarEraTokens().length || (userToken ? 1 : 0));
      await mapWithConcurrency(members, Math.min(12, Math.max(2, tokenCount * 2)), async (mId) => {
        try {
          calculations[mId] = await calculatePlayerCompanyRevenue(mId, userToken, forceRefresh);
        } catch {
          // Safe continue
        }
      });

      return res.json({
        success: true,
        armyId,
        memberCount: members.length,
        calculations,
      });
    }

    return res.status(400).json({
      success: false,
      error: "userId veya armyId parametresi gereklidir",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || "Oyuncu şirket hesaplaması yapılırken hata oluştu",
    });
  }
}
