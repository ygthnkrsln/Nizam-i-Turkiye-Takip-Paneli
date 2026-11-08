import { TRACKED_ARMIES } from "../../config/trackedArmies.js";
// Vercel Serverless Function: GET /api/management-overview
// Serves Management Mode:
// 1. "Ordu Takibi": Live health & hunger bar percentages + today's damage across all tracked armies
// 2. "Bağış Takibi": Target donation (Lv>=30: 1.5x if wealth<30k, 2.0x if wealth>=30k) + actual donations on selected date

import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";
import {
  readManagementOverviewCache,
  saveManagementOverviewCache,
  saveSnapshotToSupabase,
} from "../../lib/supabaseStorage.js";
import {
  calculateDailyDamageFromSnapshot,
  findBaselineForCurrentCycle,
  getCurrentWeeklyDamage,
  getMilitaryUnitWeeklyDamage,
  getSnapshotPlayer,
  getSnapshotPlayers,
} from "../../lib/dailyDamage.js";
import {
  readSnapshotsWithSupabase,
  writeSnapshotsToDisk,
} from "../services/daily-damage.js";
import { calculatePotentialDamage, isCombatBuild } from "../../lib/potentialDamage.js";
import { calculatePlayerSkillMode, PlayerMode } from "../../lib/playerMode.js";
import { calculatePlayerCompanyRevenue } from "./player-factories.js";

export const PRESET_TRACKED_ARMIES = TRACKED_ARMIES;
const GAME_DAY_RESET_MS = 3 * 60 * 60 * 1000;
const PLAYER_ACTIVE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const DONATION_COUNTRIES: Record<string, { name: string; code: string }> = {
  "683ddd2c24b5a2e114af15b5": { name: "Birleşik Arap Emirlikleri", code: "AE" },
  "6813b6d446e731854c7ac7eb": { name: "Türkiye", code: "TR" },
  "6813b6d546e731854c7ac8d1": { name: "Azerbaycan", code: "AZ" },
  "6873d0ea1758b40e712b5ef5": { name: "Kamerun", code: "CM" },
};

function getGameWeekDates(anchorDate: string) {
  const anchor = new Date(`${anchorDate}T03:00:00.000Z`);
  const mondayOffset = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function getDonationHistoryDates(anchorDate: string) {
  const currentWeek = getGameWeekDates(anchorDate);
  const previousMonday = new Date(`${currentWeek[0]}T03:00:00.000Z`);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);
  return [
    ...getGameWeekDates(previousMonday.toISOString().slice(0, 10)),
    ...currentWeek,
  ];
}

interface CacheItem {
  timestamp: number;
  data: any;
}
interface DonationTargetRefreshResult {
  success: boolean;
  weekStart: string;
  weekEnd: string;
  updatedUsers: number;
  updatedDays: number;
  failedUsers: number;
  errors: Record<string, string>;
  error?: string;
}
const cache = new Map<string, CacheItem>();
const donationTargetRefreshes = new Map<string, {
  timestamp: number;
  result: DonationTargetRefreshResult;
}>();
const activeDonationTargetRefreshes = new Map<
  string,
  Promise<DonationTargetRefreshResult>
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes: enough to avoid repeated heavy refreshes while staying fresh

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let hasError = false;
  let firstError: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length && !hasError) {
        const index = nextIndex++;
        try {
          results[index] = await mapper(items[index]);
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
          break;
        }
      }
    }),
  );
  if (hasError) throw firstError;
  return results;
}

function upstreamError(response: Response, message: string) {
  return Object.assign(new Error(`${message} (${response.status})`), {
    statusCode: response.status,
    retryAfter: response.headers.get("Retry-After"),
  });
}

function getPlayerActivity(user: any, now = Date.now()) {
  const rawLastActive = user?.dates?.lastConnectionAt;
  const timestamp = rawLastActive ? new Date(rawLastActive).getTime() : Number.NaN;
  const isActive =
    Number.isFinite(timestamp) &&
    timestamp <= now &&
    now - timestamp <= PLAYER_ACTIVE_WINDOW_MS;

  return {
    lastActive: Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null,
    isActive,
  };
}

async function fetchWarEra(
  url: string,
  init?: RequestInit,
  retries = 4,
  userApiKey = "",
): Promise<Response> {
  let attempt = 0;
  const serverTokens = getWarEraTokens();
  const tokens = serverTokens.length > 0 ? serverTokens : userApiKey ? [userApiKey] : [];
  if (tokens.length === 0) {
    throw new Error("WarEra API anahtarı yapılandırılmamış");
  }
  const maxAttempts = Math.max(retries + 1, tokens.length);
  let lastResponse: Response | null = null;
  const firstToken = serverTokens.length > 0 ? getNextWarEraToken() : tokens[0];
  const firstTokenIndex = Math.max(0, tokens.indexOf(firstToken));
  while (attempt < maxAttempts) {
    const token = tokens[(firstTokenIndex + attempt) % tokens.length];
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-API-Key": token,
      ...((init?.headers as Record<string, string>) || {}),
    };
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429) {
        lastResponse = res;
        attempt++;
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        lastResponse = res;
        attempt++;
        if (attempt < tokens.length) continue;
        return res;
      }
      if (res.status === 503 && attempt + 1 < maxAttempts) {
        attempt++;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      attempt++;
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw e;
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error("WarEra API isteği tamamlanamadı");
}

function collectPlayerModesByDate(
  snapshots: Record<string, any>,
): Record<string, Record<string, PlayerMode>> {
  const modesByUser: Record<string, Record<string, PlayerMode>> = {};
  for (const [snapshotDate, snapshot] of Object.entries(snapshots)) {
    const timestamp = Number(snapshot?.timestamp);
    const gameDate = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp - GAME_DAY_RESET_MS).toISOString().slice(0, 10)
      : snapshotDate;

    for (const [userId, player] of Object.entries(getSnapshotPlayers(snapshot)) as [string, any][]) {
      const mode = player?.playerMode ??
        (typeof player?.isEconomy === "boolean"
          ? player.isEconomy ? "economy" : "combat"
          : null);
      if (mode !== "economy" && mode !== "combat") continue;
      modesByUser[userId] ||= {};
      modesByUser[userId][gameDate] = mode;
    }
  }
  return modesByUser;
}

function collectDonationTargetsByDate(
  snapshots: Record<string, any>,
): Record<string, Record<string, any>> {
  const targetsByUser: Record<string, Record<string, any>> = {};
  for (const [snapshotDate, snapshot] of Object.entries(snapshots)) {
    const timestamp = Number(snapshot?.timestamp);
    const gameDate = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp - GAME_DAY_RESET_MS).toISOString().slice(0, 10)
      : snapshotDate;

    for (const [userId, player] of Object.entries(getSnapshotPlayers(snapshot)) as [string, any][]) {
      const target = player?.donationTargetSnapshot;
      if (
        !target ||
        !Number.isFinite(Number(target.target)) ||
        (target.playerMode !== "economy" && target.playerMode !== "combat")
      ) continue;
      targetsByUser[userId] ||= {};
      targetsByUser[userId][gameDate] = target;
    }
  }
  return targetsByUser;
}

function collectDonationBalancesBeforeDate(
  snapshots: Record<string, any>,
  beforeDate: string,
): Record<string, { date: string; balance: number }> {
  const balancesByUser: Record<string, { date: string; balance: number }> = {};
  for (const snapshot of Object.values(snapshots)) {
    for (const [userId, player] of Object.entries(getSnapshotPlayers(snapshot)) as [string, any][]) {
      const date = String(player?.donationBalanceDate || "");
      const balance = Number(player?.donationBalance);
      if (!date || date >= beforeDate || !Number.isFinite(balance)) continue;
      if (!balancesByUser[userId] || date >= balancesByUser[userId].date) {
        balancesByUser[userId] = { date, balance };
      }
    }
  }
  return balancesByUser;
}

async function recalculateDonationTargetsForWeek(
  weekStart: string,
  userApiKey: string,
): Promise<DonationTargetRefreshResult> {
  const weekDates = getGameWeekDates(weekStart);
  if (weekDates[0] !== weekStart) {
    throw new Error("Hedefleri güncellemek için haftanın pazartesi tarihini seçin.");
  }
  const currentGameDate = new Date(Date.now() - GAME_DAY_RESET_MS)
    .toISOString()
    .slice(0, 10);
  const endDate = weekDates.at(-1) || weekStart;
  if (weekStart > currentGameDate || endDate < currentGameDate) {
    throw new Error("Yalnızca içinde bulunulan haftanın hedefleri güncellenebilir.");
  }

  const snapshots = await readSnapshotsWithSupabase();
  const snapshotDatesByGameDate = new Map<string, string>();
  const usersToUpdate = new Set<string>();
  for (const [snapshotDate, snapshot] of Object.entries(snapshots)) {
    const timestamp = Number(snapshot?.timestamp);
    const gameDate = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp - GAME_DAY_RESET_MS).toISOString().slice(0, 10)
      : snapshotDate;
    if (!weekDates.includes(gameDate) || gameDate > currentGameDate) continue;

    snapshotDatesByGameDate.set(gameDate, snapshotDate);
    for (const [userId, player] of Object.entries(getSnapshotPlayers(snapshot)) as [string, any][]) {
      const target = player?.donationTargetSnapshot;
      if (
        !target ||
        !target.eligible ||
        Number(target.rate) <= 0 ||
        (target.incomeCalculated && target.calculationVersion === 2)
      ) continue;
      usersToUpdate.add(userId);
    }
  }

  if (usersToUpdate.size > 300) {
    throw new Error("Seçili haftada 300'den fazla eski hedef var; güncellemeyi daha küçük bir zaman aralığına bölün.");
  }

  const calculationsByUser = new Map<string, Awaited<ReturnType<typeof calculatePlayerCompanyRevenue>>>();
  const errors: Record<string, string> = {};
  await mapWithConcurrency(Array.from(usersToUpdate), 8, async (userId) => {
    try {
      const calculation = await calculatePlayerCompanyRevenue(
        userId,
        userApiKey,
        true,
      );
      if (!Number.isFinite(calculation.totalDailyRevenue)) {
        throw new Error("Günlük fabrika geliri doğrulanamadı.");
      }
      const estimateError = calculation.companies.find(
        (company) => company.isActive && company.workerEstimateError,
      )?.workerEstimateError;
      if (estimateError) throw new Error(estimateError);
      calculationsByUser.set(userId, calculation);
    } catch (error) {
      errors[userId] = error instanceof Error ? error.message : "Fabrika geliri hesaplanamadı.";
    }
  });

  const updatedUsers = new Set<string>();
  const affectedSnapshotDates = new Set<string>();
  for (const [gameDate, snapshotDate] of snapshotDatesByGameDate) {
    const snapshot = snapshots[snapshotDate];
    for (const [userId, player] of Object.entries(getSnapshotPlayers(snapshot)) as [string, any][]) {
      const calculation = calculationsByUser.get(userId);
      const target = player?.donationTargetSnapshot;
      if (
        !calculation ||
        !target ||
        !target.eligible ||
        Number(target.rate) <= 0 ||
        (target.incomeCalculated && target.calculationVersion === 2)
      ) continue;

      snapshot.players ||= {};
      snapshot.players[userId] = {
        ...getSnapshotPlayer(snapshot, userId),
        donationTargetSnapshot: {
          ...target,
          target: Math.round(calculation.totalDailyRevenue * Number(target.rate)),
          revenue: calculation.totalDailyRevenue,
          autoIncome: calculation.totalAutoIncome,
          workerIncome: calculation.totalWorkerIncome,
          incomeCalculated: true,
          calculationVersion: 2,
          source: "companies",
          capturedAt: new Date().toISOString(),
        },
      };
      updatedUsers.add(userId);
      affectedSnapshotDates.add(snapshotDate);
    }
  }

  for (const snapshotDate of affectedSnapshotDates) {
    const saved = await saveSnapshotToSupabase(snapshots[snapshotDate]);
    if (!saved) {
      throw new Error(`Hedefler hesaplandı ancak ${snapshotDate} tarihli snapshot Supabase'e kaydedilemedi.`);
    }
  }
  if (affectedSnapshotDates.size > 0) writeSnapshotsToDisk(snapshots);

  return {
    success: true,
    weekStart,
    weekEnd: endDate,
    updatedUsers: updatedUsers.size,
    updatedDays: affectedSnapshotDates.size,
    failedUsers: Object.keys(errors).length,
    errors,
  };
}

async function getOrRecalculateDonationTargets(
  weekStart: string,
  userApiKey: string,
) {
  const cached = donationTargetRefreshes.get(weekStart);
  if (cached && Date.now() - cached.timestamp < 5 * 60_000) return cached.result;

  const active = activeDonationTargetRefreshes.get(weekStart);
  if (active) return active;

  const refresh = recalculateDonationTargetsForWeek(weekStart, userApiKey);
  activeDonationTargetRefreshes.set(weekStart, refresh);
  try {
    const result = await refresh;
    donationTargetRefreshes.set(weekStart, { timestamp: Date.now(), result });
    return result;
  } finally {
    activeDonationTargetRefreshes.delete(weekStart);
  }
}

async function processSingleArmy(
  army: { id: string; name: string; avatarUrl: string },
  snapshots: Record<string, any>,
  playerModesByUserDate: Record<string, Record<string, PlayerMode>>,
  donationTargetsByUserDate: Record<string, Record<string, any>>,
  donationBalancesByUser: Record<string, { date: string; balance: number }>,
  effectiveDate: string,
  currentGameDate: string,
  donationHistoryDates: string[],
  includeDonations: boolean,
  userApiKey = "",
) {
  try {
    // Fetch MU
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(
      JSON.stringify({ muId: army.id }),
    )}`;
    const muRes = await fetchWarEra(muUrl, undefined, 4, userApiKey);
    if (!muRes.ok) throw upstreamError(muRes, `Ordu bilgisi alınamadı`);

    const muJson = await muRes.json();
    const muData = muJson?.result?.data?.json || muJson?.result?.data;
    const memberIds: string[] = Array.isArray(muData?.members)
      ? muData.members
      : [];
    const leaderId: string = muData?.user || "";
    const commanders: string[] = muData?.roles?.commanders || [];
    const managers: string[] = muData?.roles?.managers || [];

    const { baselineMembers: armyBaseline } = findBaselineForCurrentCycle(
      snapshots,
      army.id,
    );

    // Fetch member user profiles in batches of 10
    const chunks: string[][] = [];
    for (let i = 0; i < memberIds.length; i += 10) {
      chunks.push(memberIds.slice(i, i + 10));
    }

    const profileBatches = await mapWithConcurrency(chunks, 2, async (chunk) => {
      const endpoints = chunk.map(() => "user.getUserById").join(",");
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((id, idx) => {
        batchInput[idx.toString()] = { userId: id };
      });
      const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(
        JSON.stringify(batchInput),
      )}`;
      const response = await fetchWarEra(batchUrl, undefined, 4, userApiKey);
      if (!response.ok) throw upstreamError(response, "Üye profilleri alınamadı");
      const payload = await response.json();
      if (!Array.isArray(payload) || payload.length !== chunk.length) {
        throw new Error(`Ordu ${army.name}: Üye profili yanıtı eksik`);
      }
      const users = payload.map((item: any) =>
        item?.result?.data?.json || item?.result?.data,
      );
      if (users.some((user: any) => !user?._id && !user?.id)) {
        throw new Error(`Ordu ${army.name}: Üye profili yanıtı eksik`);
      }
      return users;
    });
    const rawUsers = profileBatches.flat();
    const fetchedIds = new Set(rawUsers.map((u) => u._id || u.id));
    if (memberIds.some((id) => !fetchedIds.has(id))) {
      throw new Error(`Ordu ${army.name}: Tüm üye profilleri alınamadı`);
    }

    // Read every member's recent donation pages. This lets voluntary payments
    // count toward the weekly pool and avoids missing payments after the first page.
    const userDonationsMap: Record<
      string,
      Record<string, { country: number; mu: number; total: number }>
    > = {};
    const recentDonationsMap: Record<string, any[]> = {};
    const donationUserIds = Array.from(new Set(memberIds));
    const donationBatchSize = 8;
    const donationBatches: string[][] = [];
    for (let i = 0; i < donationUserIds.length; i += donationBatchSize) {
      donationBatches.push(donationUserIds.slice(i, i + donationBatchSize));
    }
    if (includeDonations) {
      const rangeStart = new Date(`${donationHistoryDates[0]}T03:00:00.000Z`).getTime();
      const rangeEnd = rangeStart + 14 * 24 * 60 * 60 * 1000;
      await mapWithConcurrency(donationBatches, 2, async (batch) => {
        const cursors = new Map<string, string | null>();
        batch.forEach((id) => cursors.set(id, null));
        for (let page = 0; page < 12 && cursors.size > 0; page++) {
          const pageUserIds = Array.from(cursors.keys());
          const endpoints = pageUserIds
            .map(() => "transaction.getPaginatedTransactions")
            .join(",");
          const batchInput: Record<string, { userId: string; transactionType: "donation"; limit: number; cursor?: string }> = {};
          pageUserIds.forEach((userId, index) => {
            const cursor = cursors.get(userId);
            batchInput[String(index)] = {
              userId,
              transactionType: "donation",
              limit: 100,
              ...(cursor ? { cursor } : {}),
            };
          });

          const txUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
          const txRes = await fetchWarEra(txUrl, undefined, 4, userApiKey);
          if (!txRes.ok) throw upstreamError(txRes, "Bağış işlemleri alınamadı");
          const txJson = await txRes.json();
          const txResults = Array.isArray(txJson) ? txJson : [txJson];
          if (txResults.length !== pageUserIds.length) {
            throw new Error(`Ordu ${army.name}: Bağış yanıtı eksik`);
          }

          txResults.forEach((item: any, index: number) => {
            const userId = pageUserIds[index];
            const txData = item?.result?.data?.json || item?.result?.data;
            const txList = txData?.items;
            if (!userId || !Array.isArray(txList)) {
              throw new Error(`Ordu ${army.name}: Bağış yanıtı eksik`);
            }

            const dates = donationHistoryDates;
            for (const transaction of txList) {
              if (!transaction?.createdAt || (transaction.buyerId && transaction.buyerId !== userId)) continue;
              const createdAt = new Date(transaction.createdAt).getTime();
              if (!Number.isFinite(createdAt)) continue;
              const amount = Number(transaction.money ?? transaction.amount ?? transaction.value ?? 0);
              if (!Number.isFinite(amount) || amount <= 0) continue;

              const sellerMuId = String(transaction.sellerMuId || "");
              const sellerCountryId = String(transaction.sellerCountryId || "");
              const targetArmy = TRACKED_ARMIES.find((trackedArmy) => trackedArmy.id === sellerMuId);
              const targetCountry = DONATION_COUNTRIES[sellerCountryId];
              const recentDonations = recentDonationsMap[userId] || (recentDonationsMap[userId] = []);
              const transactionId = String(transaction._id || `${userId}-${createdAt}-${sellerMuId || sellerCountryId}`);
              if (!recentDonations.some((item) => item.id === transactionId)) {
                recentDonations.push({
                  id: transactionId,
                  amount,
                  currency: "Gold",
                  timestamp: transaction.createdAt,
                  target: sellerMuId ? "mu" : "country",
                  targetName: sellerMuId ? targetArmy?.name || "Askeri Birlik" : targetCountry?.name || "Ülke",
                  targetAvatarUrl: sellerMuId ? targetArmy?.avatarUrl : undefined,
                  countryCode: sellerMuId ? undefined : targetCountry?.code,
                });
              }

              if (createdAt < rangeStart || createdAt >= rangeEnd) continue;
              const day = new Date(createdAt - GAME_DAY_RESET_MS).toISOString().slice(0, 10);
              if (!dates.includes(day)) continue;
              const byDay = userDonationsMap[userId] || (userDonationsMap[userId] = {});
              const totals = byDay[day] || (byDay[day] = { country: 0, mu: 0, total: 0 });
              if (sellerMuId) {
                totals.mu += amount;
              } else if (sellerCountryId) {
                totals.country += amount;
                totals.total += amount;
              }
            }

            const nextCursor = txData?.nextCursor ? String(txData.nextCursor) : null;
            const oldest = txList.reduce((min: number, transaction: any) => {
              const at = new Date(transaction?.createdAt || 0).getTime();
              return Number.isFinite(at) ? Math.min(min, at) : min;
            }, Number.POSITIVE_INFINITY);
            if (!nextCursor || !txList.length || oldest < rangeStart) cursors.delete(userId);
            else cursors.set(userId, nextCursor);
          });
        }
      });
    }

    // Aggregates for Health, Hunger, Damage, and Donations
    let totalHealthCurrent = 0;
    let totalHealthMax = 0;
    let totalHungerCurrent = 0;
    let totalHungerMax = 0;

    let armyDailyDamage = 0;
    let armyPotentialDamage = 0;
    const armyWeeklyDamage = getMilitaryUnitWeeklyDamage(muData);

    let targetDonationSum = 0;
    let collectedDonationSum = 0;
    let eligibleCount = 0;
    let completedCount = 0;

    // Pre-calculate company revenues for eligible members (level >= 30, wealth >= 20000, and economy mode)
    const companyCalcsMap = new Map<string, any>();
    if (includeDonations) {
      const eligibleUsers = rawUsers.filter((u) => {
        if (!getPlayerActivity(u).isActive) return false;
        const lvl = Number(u.leveling?.level || u.level || 1);
        const prestigeLevel = Number(u.leveling?.prestigeLevel || 0);
        const w = Number(u.rankings?.userWealth?.value || u.wealth || 0);
        const userId = u._id || u.id;
        const recordedTarget = donationTargetsByUserDate[userId]?.[effectiveDate];
        const legacyPrestigeTarget =
          effectiveDate === currentGameDate &&
          prestigeLevel > 0 &&
          recordedTarget?.prestigeLevel == null &&
          !recordedTarget?.eligible;
        if (recordedTarget && !legacyPrestigeTarget) return false;
        if (effectiveDate !== currentGameDate) return false;
        const mode = donationTargetsByUserDate[userId]?.[effectiveDate]?.playerMode ??
          playerModesByUserDate[userId]?.[effectiveDate] ??
          (effectiveDate === currentGameDate
            ? calculatePlayerSkillMode(u).playerMode
            : "combat");
        const isEconomy = mode === "economy";
        return (lvl >= 30 || prestigeLevel > 0) && w >= 20000 && isEconomy;
      });

      await mapWithConcurrency(eligibleUsers, 2, async (u) => {
        const uid = u._id || u.id;
        try {
          const calc = await calculatePlayerCompanyRevenue(uid, userApiKey, false, u);
          if (calc) companyCalcsMap.set(uid, calc);
        } catch {
          // silently continue
        }
      });
    }

    const memberStats = rawUsers.map((u) => {
      const uid = u._id || u.id;
      const username = u.username || "Asker";
      const { lastActive, isActive } = getPlayerActivity(u);

      // Health & Hunger
      const hCurrent = Number(
        (u.skills?.health?.currentBarValue || 0).toFixed(1),
      );
      const hMax = Number(u.skills?.health?.value || 100);
      const hungerCur = Number(
        (u.skills?.hunger?.currentBarValue || 0).toFixed(1),
      );
      const hungerMx = Number(u.skills?.hunger?.value || 10);

      totalHealthCurrent += hCurrent;
      totalHealthMax += hMax;
      totalHungerCurrent += hungerCur;
      totalHungerMax += hungerMx;

      // Damage
      const weeklyDmg = getCurrentWeeklyDamage(u);

      const baselineDmg = armyBaseline[uid]?.weeklyDamage;
      const todayDmg = calculateDailyDamageFromSnapshot(weeklyDmg, baselineDmg);
      armyDailyDamage += todayDmg;

      // Level & Wealth
      const level = Number(u.leveling?.level || u.level || 1);
      const prestigeLevel = Number(u.leveling?.prestigeLevel || 0);
      const meetsLevelRequirement = level >= 30 || prestigeLevel > 0;
      const wealth = Number(u.rankings?.userWealth?.value || u.wealth || 1000);

      // Oyuncu Modu
      const { isEconomy, playerMode, ecoSkillPoints, totalSkillPoints } =
        calculatePlayerSkillMode(u);
      const playerModeByDate = playerModesByUserDate[uid] || {};
      const allDonationTargetsByDate = donationTargetsByUserDate[uid] || {};
      const recordedDonationTarget = allDonationTargetsByDate[effectiveDate];
      const donationTargetsByDate = Object.fromEntries(
        donationHistoryDates.flatMap((date) =>
          allDonationTargetsByDate[date]
            ? [[date, allDonationTargetsByDate[date]]]
            : [],
        ),
      );
      const isEffectiveEconomy = recordedDonationTarget?.playerMode
        ? recordedDonationTarget.playerMode === "economy"
        : playerModeByDate[effectiveDate]
          ? playerModeByDate[effectiveDate] === "economy"
          : effectiveDate === currentGameDate && isEconomy;
      const legacyPrestigeTarget =
        effectiveDate === currentGameDate &&
        prestigeLevel > 0 &&
        recordedDonationTarget?.prestigeLevel == null &&
        !recordedDonationTarget?.eligible &&
        isActive &&
        isEffectiveEconomy &&
        wealth >= 20000;
      const savedDonationTarget = legacyPrestigeTarget
        ? undefined
        : recordedDonationTarget;
      const isFighter = isCombatBuild(u);
      const potentialDamage = calculatePotentialDamage(
        level,
        hCurrent,
        hMax,
        hungerCur,
        hungerMx,
        isFighter,
        u.leveling?.prestigeLevel || 0,
        u.dates?.lastConnectionAt,
      );
      armyPotentialDamage += potentialDamage;

      // Kural (Yeni Sistem):
      // Sadece 30+ seviye, 20k+ servet ve EKONOMİ modundaki oyuncular bağış atacak:
      // - 20k- servet bağış oranı: %0
      // - 20k - 30k arası servet bağış oranı: %20
      // - 30k+ arası servet bağış oranı: %25
      const calc = companyCalcsMap.get(uid);
      let donationRate = !isActive
        ? 0
        : savedDonationTarget
        ? Number(savedDonationTarget.rate) || 0
        : 0;
      if (isActive && !savedDonationTarget && isEffectiveEconomy && meetsLevelRequirement) {
        if (wealth < 20000) donationRate = 0;
        else if (wealth <= 30000) donationRate = 0.20;
        else donationRate = 0.25;
      }

      const isEligible = isActive && (savedDonationTarget
        ? Boolean(savedDonationTarget.eligible)
        : isEffectiveEconomy && meetsLevelRequirement && wealth >= 20000 && donationRate > 0);
      const multiplier = donationRate;

      const targetDonation = !isEligible
        ? 0
        : savedDonationTarget
          ? Number(savedDonationTarget.target)
          : calc
            ? Math.round((calc.totalDailyRevenue || 0) * donationRate)
            : Math.round(level * (wealth >= 30000 ? 2.0 : 1.5));

      if (isEligible && targetDonation > 0) {
        targetDonationSum += targetDonation;
        eligibleCount++;
      }

      // Real donations made on effectiveDate
      const donationsByDate = userDonationsMap[uid] || {};
      const collectedDonation = donationsByDate[effectiveDate]?.total || 0;
      collectedDonationSum += collectedDonation;

      const remainingDonation = Math.max(0, targetDonation - collectedDonation);
      const isCompleted = isEligible && collectedDonation >= targetDonation;
      if (isCompleted) {
        completedCount++;
      }

      let status: "completed" | "partial" | "pending" | "exempt" = "exempt";
      let exemptReason: "inactive" | "combat_mode" | "low_level" | null = null;
      if (!isEligible) {
        if (!isActive) {
          exemptReason = "inactive";
        } else if (!isEffectiveEconomy) {
          exemptReason = "combat_mode";
        } else if (!meetsLevelRequirement) {
          exemptReason = "low_level";
        } else {
          exemptReason = "combat_mode";
        }
      } else {
        if (collectedDonation >= targetDonation && targetDonation > 0)
          status = "completed";
        else if (collectedDonation > 0) status = "partial";
        else status = "pending";
      }

      let role = "soldier";
      if (uid === leaderId) role = "leader";
      else if (commanders.includes(uid)) role = "commander";
      else if (managers.includes(uid)) role = "manager";

      return {
        userId: uid,
        username,
        role,
        level,
        prestigeLevel,
        wealth,
        lastActive,
        isActive,
        playerMode,
        playerModeByDate,
        donationTargetsByDate,
        ...(donationBalancesByUser[uid] !== undefined
          ? {
              donationBalanceBeforeWeek: donationBalancesByUser[uid].balance,
              donationBalanceDateBeforeWeek: donationBalancesByUser[uid].date,
            }
          : {}),
        isFighter,
        potentialDamage,
        isEconomy,
        ecoSkillPoints,
        totalSkillPoints,
        latestDonations: (recentDonationsMap[uid] || [])
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 7),
        exemptReason,
        health: {
          current: hCurrent,
          max: hMax,
          percentage:
            hMax > 0 ? Number(((hCurrent / hMax) * 100).toFixed(1)) : 0,
        },
        hunger: {
          current: hungerCur,
          max: hungerMx,
          percentage:
            hungerMx > 0
              ? Number(((hungerCur / hungerMx) * 100).toFixed(1))
              : 0,
        },
        todayDamage: todayDmg,
        weeklyDamage: weeklyDmg,
        isEligible,
        multiplier,
        targetDonation,
        collectedDonation,
        donationsByDate,
        remainingDonation,
        status,
        autoIncome: savedDonationTarget?.autoIncome ?? calc?.totalAutoIncome ?? 0,
        workerIncome: savedDonationTarget?.workerIncome ?? calc?.totalWorkerIncome ?? 0,
        totalDailyRevenue: savedDonationTarget?.revenue ?? calc?.totalDailyRevenue ?? 0,
        incomeCalculated:
          savedDonationTarget?.incomeCalculated === true ||
          Boolean(
            calc &&
            !calc.companies.some(
              (company: any) => company.isActive && company.workerEstimateError,
            ),
          ),
        donationRate,
        factoryCalculation: calc || undefined,
      };
    });

    // Sort members: eligible members first, then by target donation descending
    memberStats.sort((a, b) => {
      if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
      return b.targetDonation - a.targetDonation;
    });

    const healthPct =
      totalHealthMax > 0
        ? Number(((totalHealthCurrent / totalHealthMax) * 100).toFixed(1))
        : 0;
    const hungerPct =
      totalHungerMax > 0
        ? Number(((totalHungerCurrent / totalHungerMax) * 100).toFixed(1))
        : 0;
    const donationPct =
      targetDonationSum > 0
        ? Number(((collectedDonationSum / targetDonationSum) * 100).toFixed(1))
        : 100;

    const result = {
      muId: army.id,
      name: army.name,
      avatarUrl: army.avatarUrl,
      dataAvailable: true,
      memberCount: memberIds.length || memberStats.length,
      health: {
        current: Number(totalHealthCurrent.toFixed(1)),
        max: totalHealthMax,
        percentage: healthPct,
      },
      hunger: {
        current: Number(totalHungerCurrent.toFixed(1)),
        max: totalHungerMax,
        percentage: hungerPct,
      },
      todayDamage: armyDailyDamage,
      potentialDamage: armyPotentialDamage,
      weeklyDamage: armyWeeklyDamage,
      donations: {
        targetDonation: targetDonationSum,
        collectedDonation: collectedDonationSum,
        remainingDonation: Math.max(
          0,
          targetDonationSum - collectedDonationSum,
        ),
        completionPercentage: donationPct,
        eligibleMemberCount: eligibleCount,
        completedMemberCount: completedCount,
      },
      members: memberStats,
    };

    return result;
  } catch (err: any) {
    console.warn(`Could not load management data for army ${army.name} (${army.id}):`, err);
    return {
      muId: army.id,
      name: army.name,
      avatarUrl: army.avatarUrl,
      dataAvailable: false,
      dataError: err instanceof Error ? err.message : "Birlik verisi alınamadı",
      memberCount: 0,
      health: { current: 0, max: 0, percentage: 0 },
      hunger: { current: 0, max: 0, percentage: 0 },
      todayDamage: 0,
      potentialDamage: 0,
      weeklyDamage: 0,
      donations: {
        targetDonation: 0,
        collectedDonation: 0,
        remainingDonation: 0,
        completionPercentage: 0,
        eligibleMemberCount: 0,
        completedMemberCount: 0,
      },
      members: [],
    };
  }
}

export default async function handler(req: any, res: any) {
  if (["citizens", "country-tracker", "alliance-damage"].includes(String(req.query?.view || ""))) {
    const { default: intelligenceHandler } = await import("./management-intelligence.js");
    return intelligenceHandler(req, res);
  }

  if (req.query?.view === "treasury") {
    const { default: treasuryHandler } = await import("./management-treasury.js");
    return treasuryHandler(req, res);
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-User-API-Key",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const targetDateQuery = (req.query?.date as string) || "";
  const forceRefresh = req.query?.refresh === "true";
  const includeDonations = req.query?.donations !== "false";
  const userApiKey = typeof req.headers?.["x-user-api-key"] === "string"
    ? req.headers["x-user-api-key"]
    : "";

  // WarEra's day/week boundary is 03:00 UTC (06:00 in Türkiye).
  const now = new Date();
  const todayDateStr = new Date(now.getTime() - GAME_DAY_RESET_MS)
    .toISOString()
    .slice(0, 10);
  const isValidDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const effectiveDate =
    isValidDate(targetDateQuery)
      ? targetDateQuery
      : todayDateStr;
  const currentWeekStart = getGameWeekDates(todayDateStr)[0];
  let donationTargetsRefresh: DonationTargetRefreshResult | undefined;
  if (
    includeDonations &&
    getGameWeekDates(effectiveDate)[0] === currentWeekStart
  ) {
    try {
      donationTargetsRefresh = await getOrRecalculateDonationTargets(
        currentWeekStart,
        userApiKey,
      );
    } catch (error) {
      console.error("Automatic donation target refresh failed:", error);
      donationTargetsRefresh = {
        success: false,
        weekStart: currentWeekStart,
        weekEnd: getGameWeekDates(currentWeekStart).at(-1) || currentWeekStart,
        updatedUsers: 0,
        updatedDays: 0,
        failedUsers: 0,
        errors: {},
        error: error instanceof Error ? error.message : "Hedefler güncellenemedi.",
      };
    }
  }
  const cacheTtlMs =
    effectiveDate === todayDateStr ? 30 * 1000 : CACHE_TTL_MS;

  const donationHistoryDates = getDonationHistoryDates(effectiveDate);
  const cacheKey = `mgmt_overview_v22_${includeDonations ? "full" : "armies"}_${effectiveDate}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < cacheTtlMs) {
    return res.status(200).json({
      ...cached.data,
      ...(donationTargetsRefresh ? { donationTargetsRefresh } : {}),
    });
  }

  if (!forceRefresh) {
    const persisted = await readManagementOverviewCache(cacheKey);
    if (persisted && Date.now() - persisted.timestamp < cacheTtlMs) {
      cache.set(cacheKey, {
        timestamp: persisted.timestamp,
        data: persisted.payload,
      });
      return res.status(200).json({
        ...persisted.payload,
        ...(donationTargetsRefresh ? { donationTargetsRefresh } : {}),
      });
    }
  }

  try {
    // 1. Read stored baseline snapshot
    const snapshots = await readSnapshotsWithSupabase();
    const playerModesByUserDate = collectPlayerModesByDate(snapshots);
    const donationTargetsByUserDate = collectDonationTargetsByDate(snapshots);
    const donationBalancesByUser = collectDonationBalancesBeforeDate(
      snapshots,
      getGameWeekDates(effectiveDate)[0],
    );
    const dates = Object.keys(snapshots).sort();
    const baselineDate =
      dates.length > 0 ? dates[dates.length - 1] : "2026-10-03";
    // Distribute each parallel request across the configured API keys.
    const armyOverviews = await mapWithConcurrency(
      PRESET_TRACKED_ARMIES,
      4,
      (army) => processSingleArmy(
        army,
        snapshots,
        playerModesByUserDate,
        donationTargetsByUserDate,
        donationBalancesByUser,
        effectiveDate,
        todayDateStr,
        donationHistoryDates,
        includeDonations,
        userApiKey,
      ),
    );

    // Alliance Aggregates
    const totalAllHealthCurrent = Number(
      armyOverviews.reduce((s, a) => s + a.health.current, 0).toFixed(1),
    );
    const totalAllHealthMax = armyOverviews.reduce(
      (s, a) => s + a.health.max,
      0,
    );
    const totalAllHungerCurrent = Number(
      armyOverviews.reduce((s, a) => s + a.hunger.current, 0).toFixed(1),
    );
    const totalAllHungerMax = armyOverviews.reduce(
      (s, a) => s + a.hunger.max,
      0,
    );

    const allianceHealthPct =
      totalAllHealthMax > 0
        ? Number(((totalAllHealthCurrent / totalAllHealthMax) * 100).toFixed(1))
        : 0;
    const allianceHungerPct =
      totalAllHungerMax > 0
        ? Number(((totalAllHungerCurrent / totalAllHungerMax) * 100).toFixed(1))
        : 0;

    const totalAllTodayDamage = armyOverviews.reduce(
      (s, a) => s + a.todayDamage,
      0,
    );
    const totalAllPotentialDamage = armyOverviews.reduce(
      (s, a) => s + a.potentialDamage,
      0,
    );
    const totalAllTargetDonation = armyOverviews.reduce(
      (s, a) => s + a.donations.targetDonation,
      0,
    );
    const totalAllCollectedDonation = armyOverviews.reduce(
      (s, a) => s + a.donations.collectedDonation,
      0,
    );
    const totalAllRemainingDonation = Math.max(
      0,
      totalAllTargetDonation - totalAllCollectedDonation,
    );
    const allianceDonationPct =
      totalAllTargetDonation > 0
        ? Number(
            (
              (totalAllCollectedDonation / totalAllTargetDonation) *
              100
            ).toFixed(1),
          )
        : 100;
    const totalAllMembers = armyOverviews.reduce(
      (s, a) => s + a.memberCount,
      0,
    );

    const payload = {
      success: true,
      timestamp: Date.now(),
      effectiveDate,
      baselineDate,
      ...(donationTargetsRefresh ? { donationTargetsRefresh } : {}),
      alliance: {
        totalMembers: totalAllMembers,
        totalHealth: {
          current: totalAllHealthCurrent,
          max: totalAllHealthMax,
          percentage: allianceHealthPct,
        },
        totalHunger: {
          current: totalAllHungerCurrent,
          max: totalAllHungerMax,
          percentage: allianceHungerPct,
        },
        totalTodayDamage: totalAllTodayDamage,
        totalPotentialDamage: totalAllPotentialDamage,
        donations: {
          totalTarget: totalAllTargetDonation,
          totalCollected: totalAllCollectedDonation,
          totalRemaining: totalAllRemainingDonation,
          completionPercentage: allianceDonationPct,
        },
      },
      armies: armyOverviews,
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: payload });
    await saveManagementOverviewCache(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (error: any) {
    console.error("API Error in /api/management-overview:", error);
    const statusCode = error.statusCode === 429 ? 429 : 502;
    if (statusCode === 429) res.setHeader("Retry-After", error.retryAfter || "60");
    return res.status(statusCode).json({
      success: false,
      error:
        statusCode === 429
          ? "WarEra API istek sınırına ulaşıldı. Limit sıfırlanınca tekrar deneyin."
          : error.message || "Yönetim mod verileri alınamadı",
    });
  }
}
