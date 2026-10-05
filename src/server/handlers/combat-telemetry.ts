// Vercel Serverless Function: GET /api/combat-telemetry
// Fetches daily combat telemetry: resources (HP, hunger, hourly regen), buffs/pills, skill resets, and real-time live daily damage calculated against 02:55 snapshot.

import { readSnapshotsWithSupabase } from "../../../api/cron/record-daily-damage";

import { getNextWarEraToken } from "../../lib/wareraTokens.js";
import {
  calculateDailyDamageFromSnapshot,
  findBaselineForCurrentCycle as selectDailyDamageBaseline,
  getCurrentWeeklyDamage,
} from "../../lib/dailyDamage.js";

const DEFAULT_MU_ID = "69c229c4449287ea1a26a5b3";

// In-memory cache for serverless execution
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 15 * 1000; // 15 seconds fresh cache for live telemetry

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

// Find the baseline snapshot recorded at the most recent 02:55 TSİ reset
function findBaselineForCurrentCycle(
  snapshots: Record<string, any>,
  targetMuId: string,
) {
  return selectDailyDamageBaseline(snapshots, targetMuId);
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-user-api-key",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const targetMuId = (req.query?.muId as string) || DEFAULT_MU_ID;
  const forceRefresh = req.query?.refresh === "true";

  const cacheKey = `combat_telemetry_${targetMuId}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  try {
    // 1. Fetch MU Data
    const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: targetMuId }))}`;
    const muRes = await fetchWarEra(muUrl);
    if (!muRes.ok) {
      return res
        .status(502)
        .json({ success: false, error: "WarEra MU API call failed" });
    }
    const muJson = await muRes.json();
    const muData = muJson?.result?.data?.json || muJson?.result?.data;
    if (!muData) {
      return res
        .status(404)
        .json({ success: false, error: "Military Unit not found" });
    }

    const members: string[] = muData.members || [];
    const leaderId = muData.user || "";
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
                const uData = item?.result?.data?.json || item?.result?.data;
                if (uData) {
                  allUsers.push(uData);
                }
              }
            }
          }
        } catch (uErr) {
          console.error("Batch user fetch error:", uErr);
        }
      }),
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
        }),
      );
    }

    // 3. Load baseline snapshot from 02:55 cron (from Supabase/disk)
    const snapshots = await readSnapshotsWithSupabase();
    const { baselineDate, baselineArmy, baselineMembers, targetResetDate } =
      findBaselineForCurrentCycle(snapshots, targetMuId);

    // 4. Map member telemetry records with LIVE daily damage (Current Live Weekly - 02:55 Snapshot Weekly)
    const mappedMembers = allUsers.map((u) => {
      const isLeader = u._id === leaderId;
      const isCommander = commanders.includes(u._id);
      const isManager = managers.includes(u._id);
      const role = isLeader
        ? "leader"
        : isCommander
          ? "commander"
          : isManager
            ? "manager"
            : "soldier";

      // Resources
      const healthCurrent = Number(
        (u.skills?.health?.currentBarValue || 0).toFixed(1),
      );
      const healthMax = u.skills?.health?.value || 100;
      const healthRegen = Number(
        (u.skills?.health?.hourlyBarRegen || 0).toFixed(1),
      );

      const hungerCurrent = Number(
        (u.skills?.hunger?.currentBarValue || 0).toFixed(1),
      );
      const hungerMax = u.skills?.hunger?.value || 10;
      const hungerRegen = Number(
        (u.skills?.hunger?.hourlyBarRegen || 0).toFixed(1),
      );

      // Buffs & Pills
      const buffCodes = u.buffs?.buffCodes || [];
      const buffEndAt = u.buffs?.buffEndAt || null;
      const debuffEndAt =
        u.buffs?.debuffEndAt || u.attack?.buffs?.debuffEndAt || null;

      const now = Date.now();
      let pillStatus: "ready" | "buff" | "debuff" = "ready";
      let pillExpiresAt: string | null = null;

      if (buffEndAt && new Date(buffEndAt).getTime() > now) {
        pillStatus = "buff";
        pillExpiresAt = buffEndAt;
      } else if (debuffEndAt && new Date(debuffEndAt).getTime() > now) {
        pillStatus = "debuff";
        pillExpiresAt = debuffEndAt;
      }

      // Skills reset
      const freeReset = u.leveling?.freeReset || 0;
      const lastSkillsResetAt = u.dates?.lastSkillsResetAt || null;

      // Real Live Daily Damage calculation: Current Live Weekly - 02:55 Snapshot Weekly
      const userId = u._id || u.id;
      const currentWeekly = getCurrentWeeklyDamage(u);
      const baselineWeekly = baselineMembers[userId]?.weeklyDamage;
      const dailyDamage = calculateDailyDamageFromSnapshot(
        currentWeekly,
        baselineWeekly,
      );

      return {
        userId,
        username: u.username || "Bilinmeyen Asker",
        avatarUrl: u.avatarUrl || "",
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
        totalDamage:
          u.rankings?.userDamages?.value || u.stats?.damagesCount || 0,
        weeklyDamage: currentWeekly,
        dailyDamage,
      };
    });

    // 5. Compute army resource totals & total daily damage
    const totalHealthCurrent = Number(
      mappedMembers.reduce((sum, m) => sum + m.health.current, 0).toFixed(1),
    );
    const totalHealthMax = mappedMembers.reduce(
      (sum, m) => sum + m.health.max,
      0,
    );
    const totalHungerCurrent = Number(
      mappedMembers.reduce((sum, m) => sum + m.hunger.current, 0).toFixed(1),
    );
    const totalHungerMax = mappedMembers.reduce(
      (sum, m) => sum + m.hunger.max,
      0,
    );

    const readyCount = mappedMembers.filter(
      (m) => m.pillStatus === "ready",
    ).length;
    const buffCount = mappedMembers.filter(
      (m) => m.pillStatus === "buff",
    ).length;
    const debuffCount = mappedMembers.filter(
      (m) => m.pillStatus === "debuff",
    ).length;

    const totalDailyDamage = mappedMembers.reduce(
      (sum, m) => sum + m.dailyDamage,
      0,
    );

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || "Turkic Tribe",
          memberCount: members.length,
          leaderId,
        },
        resources: {
          health: {
            current: totalHealthCurrent,
            max: totalHealthMax,
            percentage:
              totalHealthMax > 0
                ? Number(
                    ((totalHealthCurrent / totalHealthMax) * 100).toFixed(1),
                  )
                : 0,
          },
          hunger: {
            current: totalHungerCurrent,
            max: totalHungerMax,
            percentage:
              totalHungerMax > 0
                ? Number(
                    ((totalHungerCurrent / totalHungerMax) * 100).toFixed(1),
                  )
                : 0,
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
          baselineDate,
          targetResetDate,
          calculationRule:
            "Anlık Canlı Haftalık Hasar - 02:55 Snapshot Haftalık Hasar",
        },
        members: mappedMembers,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.status(200).json(resultData);
  } catch (err: any) {
    console.error("Combat telemetry error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed fetching combat telemetry",
    });
  }
}
