// Vercel Serverless Function / Cron Job: GET /api/cron/record-daily-damage
// Runs daily at 02:55 to snapshot army damage, player modes, and donation targets.

import fs from "fs";
import path from "path";
import {
  saveSnapshotToSupabase,
  fetchSnapshotsFromSupabase,
  isSupabaseConnected,
} from "../../lib/supabaseStorage.js";
import { TRACKED_ARMIES } from "../../config/trackedArmies.js";
import {
  calculateDailyDamageFromSnapshot,
  getSnapshotArmyMemberIds,
  getSnapshotPlayer,
} from "../../lib/dailyDamage.js";
import { calculatePlayerSkillMode } from "../../lib/playerMode.js";
import { calculatePlayerCompanyRevenue } from "../handlers/player-factories.js";
import type { DailySnapshotRecord } from "../../lib/supabaseStorage.js";
export { isSupabaseConnected };

const PRESET_MILITARY_UNITS = TRACKED_ARMIES;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await mapper(items[index]);
      }
    }),
  );
  return results;
}

import { getNextWarEraToken } from "../../lib/wareraTokens.js";

async function fetchWarEra(url: string) {
  const token = getNextWarEraToken();
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
}

// In-memory global store as well as file backup
declare global {
  var __DAILY_DAMAGE_SNAPSHOTS__: Record<string, any> | undefined;
}

export function getSnapshotsFilePath(): string {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
  return path.join(dir, "daily_snapshots.json");
}

export function readSnapshotsFromDisk(): Record<string, any> {
  if (global.__DAILY_DAMAGE_SNAPSHOTS__) {
    return global.__DAILY_DAMAGE_SNAPSHOTS__;
  }
  try {
    const filePath = getSnapshotsFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(content);
      global.__DAILY_DAMAGE_SNAPSHOTS__ = parsed;
      return parsed;
    }
  } catch (err) {
    console.error("Error reading snapshots from disk:", err);
  }
  return {};
}

export function writeSnapshotsToDisk(data: Record<string, any>) {
  global.__DAILY_DAMAGE_SNAPSHOTS__ = data;
  try {
    const filePath = getSnapshotsFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing snapshots to disk:", err);
  }
}

export async function readSnapshotsWithSupabase(): Promise<
  Record<string, any>
> {
  let diskStore = readSnapshotsFromDisk();

  try {
    const supabaseStore = await fetchSnapshotsFromSupabase(30);
    if (supabaseStore && Object.keys(supabaseStore).length > 0) {
      const merged = { ...diskStore, ...supabaseStore };
      const dates = Object.keys(merged).sort().slice(-30);
      const retained = Object.fromEntries(dates.map((date) => [date, merged[date]]));
      global.__DAILY_DAMAGE_SNAPSHOTS__ = retained;
      return retained;
    } else if (
      isSupabaseConnected() &&
      diskStore &&
      Object.keys(diskStore).length > 0
    ) {
      // Supabase is empty: auto-sync local reference baseline to Supabase
      for (const d of Object.keys(diskStore)) {
        try {
          await saveSnapshotToSupabase(diskStore[d]);
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error("Error fetching snapshots from Supabase:", err);
  }

  const dates = Object.keys(diskStore || {}).sort().slice(-30);
  diskStore = Object.fromEntries(dates.map((date) => [date, diskStore[date]]));
  global.__DAILY_DAMAGE_SNAPSHOTS__ = diskStore;
  return diskStore;
}

export async function snapshotAllArmies(
  options: { captureDonationTargets?: boolean } = {},
) {
  const captureDonationTargets = options.captureDonationTargets === true;
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(now);
  const timestamp = now.getTime();
  const capturedAt = now.toISOString();

  let currentStore = await readSnapshotsWithSupabase();
  const donationSnapshotsByUser = new Map<
    string,
    Promise<NonNullable<DailySnapshotRecord["armies"][string]["members"][string]["donationTargetSnapshot"]>>
  >();
  const getDonationTargetSnapshot = (user: any) => {
    const userId = String(user?._id || user?.id || "");
    const existing = donationSnapshotsByUser.get(userId);
    if (existing) return existing;

    const snapshotPromise = (async () => {
      const mode = calculatePlayerSkillMode(user);
      const level = Number(user?.leveling?.level || user?.level || 1);
      const prestigeLevel = Number(user?.leveling?.prestigeLevel || 0);
      const wealth = Number(user?.rankings?.userWealth?.value ?? user?.wealth ?? 0);
      const eligible = mode.isEconomy && (level >= 30 || prestigeLevel > 0) && wealth >= 20000;
      const rate = wealth <= 30000 ? 0.2 : 0.25;
      const common = {
        rate: eligible ? rate : 0,
        eligible,
        playerMode: mode.playerMode,
        level,
        prestigeLevel,
        wealth,
        capturedAt,
      };

      if (!eligible) {
        return {
          ...common,
          target: 0,
          revenue: null,
          autoIncome: null,
          workerIncome: null,
          source: "policy" as const,
        };
      }

      try {
        const calculation = await calculatePlayerCompanyRevenue(
          userId,
          undefined,
          true,
          user,
        );
        if (
          !Number.isFinite(calculation.dailyDonationTarget) ||
          !Number.isFinite(calculation.totalDailyRevenue) ||
          !calculation.isEligible
        ) {
          throw new Error("Şirket geliri veya bağış uygunluğu doğrulanamadı");
        }
        const estimateError = calculation.companies.find(
          (company) => company.isActive && company.workerEstimateError,
        )?.workerEstimateError;
        if (estimateError) {
          throw new Error(estimateError);
        }
        return {
          ...common,
          target: calculation.dailyDonationTarget,
          revenue: calculation.totalDailyRevenue,
          autoIncome: calculation.totalAutoIncome,
          workerIncome: calculation.totalWorkerIncome,
          rate: calculation.donationRate,
          eligible: calculation.isEligible,
          playerMode: calculation.playerMode,
          level: calculation.level,
          wealth: calculation.wealth,
          source: "companies" as const,
        };
      } catch (error) {
        console.warn(
          `Could not calculate donation target for ${user?.username || userId}; saving the established level-based fallback:`,
          error,
        );
        return {
          ...common,
          target: Math.round(level * (wealth >= 30000 ? 2 : 1.5)),
          revenue: null,
          autoIncome: null,
          workerIncome: null,
          source: "fallback" as const,
        };
      }
    })();

    donationSnapshotsByUser.set(userId, snapshotPromise);
    return snapshotPromise;
  };

  const previousDate = Object.keys(currentStore).filter((date) => date < dateStr).sort().at(-1);
  const previousSnapshot = previousDate ? currentStore[previousDate] : undefined;
  if (!currentStore[dateStr]) {
    currentStore[dateStr] = {
      date: dateStr,
      timestamp,
      iso: now.toISOString(),
      players: {},
      armies: {},
    };
  }

  const armySnapshots = await mapWithConcurrency(
    PRESET_MILITARY_UNITS,
    4,
    async (mu) => {
      try {
        const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: mu.id }))}`;
        const muRes = await fetchWarEra(muUrl);
        if (!muRes.ok) throw new Error(`Army request failed (${muRes.status})`);
        const muJson = await muRes.json();
        const muData = muJson?.result?.data?.json || muJson?.result?.data;
        if (!muData) throw new Error("Army response is empty");
        const memberIds: string[] = Array.from(new Set<string>(
          Array.isArray(muData.members) ? muData.members : [],
        ));
        return {
          id: mu.id,
          name: mu.name,
          memberIds,
        };
      } catch (error) {
        console.error(`Error reading tracked MU ${mu.name}:`, error);
        return null;
      }
    },
  );

  const validArmySnapshots = armySnapshots.filter(
    (army): army is NonNullable<typeof army> => army !== null,
  );
  const currentArmyIdsByUser = new Map<string, string[]>();
  for (const army of validArmySnapshots) {
    for (const userId of army.memberIds) {
      const armyIds = currentArmyIdsByUser.get(userId) || [];
      armyIds.push(army.id);
      currentArmyIdsByUser.set(userId, armyIds);
    }
  }

  const cutoffDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" })
    .format(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const recentlyTrackedUserIds = new Set<string>(currentArmyIdsByUser.keys());
  for (const [snapshotDate, snapshot] of Object.entries(currentStore)) {
    if (snapshotDate < cutoffDate || snapshotDate > dateStr) continue;
    for (const army of PRESET_MILITARY_UNITS) {
      getSnapshotArmyMemberIds(snapshot, army.id).forEach((userId) =>
        recentlyTrackedUserIds.add(userId),
      );
    }
  }

  const userIds = Array.from(recentlyTrackedUserIds);
  const userChunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 10) {
    userChunks.push(userIds.slice(i, i + 10));
  }
  const profileBatches = await mapWithConcurrency(userChunks, 4, async (chunk) => {
    try {
      const endpoints = chunk.map(() => "user.getUserById").join(",");
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((userId, index) => {
        batchInput[String(index)] = { userId };
      });
      const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      const response = await fetchWarEra(batchUrl);
      if (!response.ok) throw new Error(`User batch request failed (${response.status})`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("User batch response is invalid");
      return payload
        .map((item: any) => item?.result?.data?.json || item?.result?.data)
        .filter((user: any) => (user?._id || user?.id) && recentlyTrackedUserIds.has(user._id || user.id));
    } catch (error) {
      console.warn("Could not fetch a batch of tracked player profiles:", error);
      return [];
    }
  });

  const usersById = new Map<string, any>();
  for (const user of profileBatches.flat()) {
    usersById.set(user._id || user.id, user);
  }

  const previousPlayers = new Map<string, any>();
  for (const userId of userIds) {
    const previousPlayer = getSnapshotPlayer(previousSnapshot, userId);
    if (previousPlayer) previousPlayers.set(userId, previousPlayer);
  }

  const playerEntries = await mapWithConcurrency(
    Array.from(usersById.entries()),
    2,
    async ([userId, user]) => {
      const existingToday = getSnapshotPlayer(currentStore[dateStr], userId);
      const previousPlayer = previousPlayers.get(userId);
      const liveMode = calculatePlayerSkillMode(user);
      const existingTarget = existingToday?.donationTargetSnapshot;
      const mode = captureDonationTargets
        ? existingTarget
          ? {
              isEconomy: existingTarget.playerMode === "economy",
              playerMode: existingTarget.playerMode,
              ecoSkillPoints: liveMode.ecoSkillPoints,
              totalSkillPoints: liveMode.totalSkillPoints,
            }
          : liveMode
        : existingToday?.playerMode
          ? {
              isEconomy: existingToday.isEconomy ?? existingToday.playerMode === "economy",
              playerMode: existingToday.playerMode,
              ecoSkillPoints: existingToday.ecoSkillPoints ?? liveMode.ecoSkillPoints,
              totalSkillPoints: existingToday.totalSkillPoints ?? liveMode.totalSkillPoints,
            }
          : liveMode;
      const donationTargetSnapshot = existingTarget ??
        (captureDonationTargets ? await getDonationTargetSnapshot(user) : undefined);
      const weeklyDamage = Number(user.rankings?.weeklyUserDamages?.value || 0);

      return [userId, {
        username: user.username || existingToday?.username || previousPlayer?.username || "Bilinmeyen Asker",
        weeklyDamage,
        wealth: Number(user.rankings?.userWealth?.value ?? user.wealth ?? 0),
        dailyDamage: previousPlayer
          ? calculateDailyDamageFromSnapshot(
              weeklyDamage,
              Number(previousPlayer.weeklyDamage || 0),
            )
          : undefined,
        playerMode: mode.playerMode,
        isEconomy: mode.isEconomy,
        ecoSkillPoints: mode.ecoSkillPoints,
        totalSkillPoints: mode.totalSkillPoints,
        armyIds: currentArmyIdsByUser.get(userId) || [],
        ...(donationTargetSnapshot ? { donationTargetSnapshot } : {}),
      }] as const;
    },
  );

  const players: NonNullable<DailySnapshotRecord["players"]> = {
    ...currentStore[dateStr].players,
  };
  for (const [userId, player] of playerEntries) players[userId] = player;
  for (const [userId, player] of Object.entries(players)) {
    if (recentlyTrackedUserIds.has(userId)) {
      player.armyIds = currentArmyIdsByUser.get(userId) || [];
    } else {
      delete players[userId];
    }
  }
  currentStore[dateStr].players = players;

  for (const army of validArmySnapshots) {
    const armyWeeklyDamage = army.memberIds.reduce(
      (total, userId) => total + Number(players[userId]?.weeklyDamage || 0),
      0,
    );
    currentStore[dateStr].armies[army.id] = {
      name: army.name,
      muId: army.id,
      armyTotalWeeklyDamage: armyWeeklyDamage,
      memberCount: army.memberIds.length,
      memberIds: army.memberIds,
      members: {},
    };
  }

  const retainedDates = Object.keys(currentStore).sort().slice(-30);
  currentStore = Object.fromEntries(retainedDates.map((date) => [date, currentStore[date]]));

  // 1. Write to local file/memory
  writeSnapshotsToDisk(currentStore);

  // 2. Persist to Supabase Database
  let supabaseSaved = false;
  try {
    supabaseSaved = await saveSnapshotToSupabase(currentStore[dateStr]);
  } catch (err) {
    console.warn("Could not persist snapshot to Supabase:", err);
  }

  return {
    ...currentStore[dateStr],
    supabaseSaved,
    supabaseConnected: isSupabaseConnected(),
  };
}
