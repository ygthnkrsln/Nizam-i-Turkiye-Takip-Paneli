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
import { calculateDailyDamageFromSnapshot } from "../../lib/dailyDamage.js";
import { calculatePlayerSkillMode } from "../../lib/playerMode.js";
import { calculatePlayerCompanyRevenue } from "../handlers/player-factories.js";
import type { DailySnapshotRecord } from "../../lib/supabaseStorage.js";
export { isSupabaseConnected };

const PRESET_MILITARY_UNITS = TRACKED_ARMIES;
const GAME_DAY_RESET_MS = 3 * 60 * 60 * 1000;

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
      const wealth = Number(user?.rankings?.userWealth?.value ?? user?.wealth ?? 0);
      const eligible = mode.isEconomy && level >= 30 && wealth >= 20000;
      const rate = wealth <= 30000 ? 0.2 : 0.25;
      const common = {
        rate: eligible ? rate : 0,
        eligible,
        playerMode: mode.playerMode,
        level,
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
      // Batch fetch users
      const chunks: string[][] = [];
      for (let i = 0; i < members.length; i += 10) {
        chunks.push(members.slice(i, i + 10));
      }

      const memberDamages: Record<string, {
        username: string;
        weeklyDamage: number;
        wealth?: number;
        dailyDamage?: number;
        playerMode?: "economy" | "combat";
        isEconomy?: boolean;
        ecoSkillPoints?: number;
        totalSkillPoints?: number;
        donationTargetSnapshot?: NonNullable<
          DailySnapshotRecord["armies"][string]["members"][string]["donationTargetSnapshot"]
        >;
      }> = {};

      const profileBatches = await mapWithConcurrency(chunks, 2, async (chunk) => {
        try {
          const endpoints = chunk.map(() => "user.getUserById").join(",");
          const batchInput: Record<string, { userId: string }> = {};
          chunk.forEach((id, idx) => {
            batchInput[idx.toString()] = { userId: id };
          });
          const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
          const uRes = await fetchWarEra(batchUrl);
          if (!uRes.ok) throw new Error(`Üye profilleri alınamadı (${uRes.status})`);
          const uJson = await uRes.json();
          if (!Array.isArray(uJson) || uJson.length !== chunk.length) {
            throw new Error("Üye profili yanıtı eksik");
          }
          const users = uJson.map((item: any) =>
            item?.result?.data?.json || item?.result?.data,
          );
          if (users.some((user: any) => !user?._id && !user?.id)) {
            throw new Error("Üye profili yanıtında kullanıcı kimliği eksik");
          }
          return users;
        } catch (error) {
          console.warn(`Could not snapshot member profiles for MU ${mu.name}:`, error);
          return [];
        }
      });
      const users = profileBatches.flat();
      const userSnapshots = await mapWithConcurrency(users, 2, async (user) => {
        const userId = user._id || user.id;
        const existingMember = currentStore[dateStr]?.armies?.[mu.id]?.members?.[userId];
        const existingDonationTarget = existingMember?.donationTargetSnapshot;
        const liveMode = calculatePlayerSkillMode(user);
        const mode = !captureDonationTargets && existingMember?.playerMode
          ? {
              isEconomy: existingMember.isEconomy ?? existingMember.playerMode === "economy",
              playerMode: existingMember.playerMode,
              ecoSkillPoints: existingMember.ecoSkillPoints ?? liveMode.ecoSkillPoints,
              totalSkillPoints: existingMember.totalSkillPoints ?? liveMode.totalSkillPoints,
            }
          : existingDonationTarget
            ? {
                isEconomy: existingDonationTarget.playerMode === "economy",
                playerMode: existingDonationTarget.playerMode,
                ecoSkillPoints: liveMode.ecoSkillPoints,
                totalSkillPoints: liveMode.totalSkillPoints,
              }
            : liveMode;
        return {
          userId,
          mode,
          donationTargetSnapshot: existingDonationTarget ??
            (captureDonationTargets ? await getDonationTargetSnapshot(user) : undefined),
        };
      });
      const snapshotsByUser = new Map(userSnapshots.map((item) => [item.userId, item]));
      for (const user of users) {
        const userId = user._id || user.id;
        const item = snapshotsByUser.get(userId);
        if (!item) continue;
        memberDamages[userId] = {
          username: user.username || "Bilinmeyen Asker",
          weeklyDamage: user.rankings?.weeklyUserDamages?.value || 0,
          wealth: Number(user.rankings?.userWealth?.value ?? user.wealth ?? 0),
          playerMode: item.mode.playerMode,
          isEconomy: item.mode.isEconomy,
          ecoSkillPoints: item.mode.ecoSkillPoints,
          totalSkillPoints: item.mode.totalSkillPoints,
          ...(item.donationTargetSnapshot
            ? { donationTargetSnapshot: item.donationTargetSnapshot }
            : {}),
          dailyDamage: previousSnapshot?.armies?.[mu.id]?.members?.[userId]
            ? calculateDailyDamageFromSnapshot(
                Number(user.rankings?.weeklyUserDamages?.value || 0),
                Number(previousSnapshot.armies[mu.id].members[userId].weeklyDamage || 0),
              )
            : undefined,
        };
      }

      const armyTotalWeekly = Object.values(memberDamages).reduce(
        (total, member) => total + member.weeklyDamage,
        0,
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
