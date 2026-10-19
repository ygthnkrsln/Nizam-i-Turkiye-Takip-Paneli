// Vercel Serverless Function / Cron Job: GET /api/cron/record-daily-damage
// Runs daily at 02:55 to snapshot weekly damage for all 8 armies and their members.

import fs from "fs";
import path from "path";
import {
  saveSnapshotToSupabase,
  fetchSnapshotsFromSupabase,
  isSupabaseConnected,
} from "../../lib/supabaseStorage.js";
import { TRACKED_ARMIES } from "../../config/trackedArmies.js";
import { calculateDailyDamageFromSnapshot } from "../../lib/dailyDamage.js";
export { isSupabaseConnected };

const PRESET_MILITARY_UNITS = TRACKED_ARMIES;

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

export async function snapshotAllArmies() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(now);
  const timestamp = now.getTime();

  let currentStore = await readSnapshotsWithSupabase();
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

      const memberDamages: Record<string, { username: string; weeklyDamage: number; wealth?: number; dailyDamage?: number }> = {};

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const endpoints = chunk.map(() => "user.getUserById").join(",");
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
                      username: u.username || "Bilinmeyen Asker",
                      weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
                      wealth: Number(u.rankings?.userWealth?.value ?? u.wealth ?? 0),
                      dailyDamage: previousSnapshot?.armies?.[mu.id]?.members?.[u._id]
                        ? calculateDailyDamageFromSnapshot(
                            Number(u.rankings?.weeklyUserDamages?.value || 0),
                            Number(previousSnapshot.armies[mu.id].members[u._id].weeklyDamage || 0),
                          )
                        : undefined,
                    };
                  }
                }
              }
            }
          } catch (_) {}
        }),
      );

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
