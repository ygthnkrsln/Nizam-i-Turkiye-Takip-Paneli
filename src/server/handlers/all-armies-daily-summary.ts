// Vercel Serverless Function: GET /api/all-armies-daily-summary
// Aggregates today's live damage across all 8 major Turkish armies and ranks them 1 to 8

import { getNextWarEraToken } from "../../lib/wareraTokens.js";
import {
  calculateDailyDamageFromSnapshot,
  findBaselineForCurrentCycle,
  getCurrentWeeklyDamage,
  getMilitaryUnitWeeklyDamage,
} from "../../lib/dailyDamage.js";
import { readSnapshotsWithSupabase } from "../services/daily-damage.js";

export const PRESET_8_ARMIES = [
  {
    id: "69c229c4449287ea1a26a5b3",
    name: "Turkic Tribe",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png",
  },
  {
    id: "689f69064e095b8b9f1b885a",
    name: "ASHINA",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png",
  },
  {
    id: "68bc9bcb4870c8e343e42855",
    name: "ASHINA Reserve",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png",
  },
  {
    id: "690088ce4864a132a2d92d07",
    name: "Legio Panthera",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png",
  },
  {
    id: "6902269a560184d196a6fba8",
    name: "BEASTs",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg",
  },
  {
    id: "6a0f1495478fe2a58d2868d6",
    name: "Deliler",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png",
  },
  {
    id: "68e0f3b86351b310a982d79e",
    name: "WAVVE",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-68e0f3b86351b310a982d79e-1786113114746-rr3s4yb3.png",
  },
  {
    id: "693d20605669127e9d45f9b8",
    name: "DTX",
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-693d20605669127e9d45f9b8-1777019037251-2qmzl25l.png",
  },
];

let summaryCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL_MS = 20 * 1000; // 20 seconds fresh cache

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

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const forceRefresh = req.query?.refresh === "true";
  if (
    !forceRefresh &&
    summaryCache &&
    Date.now() - summaryCache.timestamp < CACHE_TTL_MS
  ) {
    return res.status(200).json(summaryCache.data);
  }

  try {
    // 1. Read stored snapshots (with Supabase sync)
    const snapshots = await readSnapshotsWithSupabase();
    const dates = Object.keys(snapshots).sort();
    const baselineDate =
      dates.length > 0 ? dates[dates.length - 1] : "2026-10-03";

    // 2. Fetch live data for all 8 armies in parallel
    const armyResults = await Promise.all(
      PRESET_8_ARMIES.map(async (army) => {
        const { baselineArmy, baselineMembers: armyBaseline } =
          findBaselineForCurrentCycle(snapshots, army.id);
        try {
          const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(
            JSON.stringify({ muId: army.id }),
          )}`;
          const muRes = await fetchWarEra(muUrl);
          if (!muRes.ok) throw new Error(`Status ${muRes.status}`);

          const muJson = await muRes.json();
          const muData = muJson?.result?.data?.json || muJson?.result?.data;
          const memberIds: string[] = Array.isArray(muData?.members)
            ? muData.members
            : [];

          // Baseline for this army
          // Fetch member userLite for current weekly damages in parallel batches
          const armyWeeklyDamage = getMilitaryUnitWeeklyDamage(muData);
          let armyTodayDamage = 0;
          let topStriker = { username: "Yok", damage: 0, weeklyDamage: 0 };
          const batchSize = 6;
          const memberStats: Array<{
            userId: string;
            username: string;
            todayDamage: number;
            weeklyDamage: number;
          }> = [];

          for (let i = 0; i < memberIds.length; i += batchSize) {
            const batch = memberIds.slice(i, i + batchSize);
            const userLitePromises = batch.map(async (userId) => {
              try {
                const uUrl = `https://api2.warera.io/trpc/user.getUserLite?input=${encodeURIComponent(
                  JSON.stringify({ userId }),
                )}`;
                const uRes = await fetchWarEra(uUrl);
                if (uRes.ok) {
                  const uJson = await uRes.json();
                  return uJson?.result?.data?.json || uJson?.result?.data;
                }
              } catch {}
              return null;
            });

            const users = await Promise.all(userLitePromises);
            for (const user of users) {
              if (!user) continue;
              const userData =
                user?.result?.data?.json || user?.result?.data || user;
              const uid = userData.id || userData._id;
              const username = userData.username || "Asker";
              const weeklyDmg = getCurrentWeeklyDamage(userData);

              const baselineDmg = armyBaseline[uid]?.weeklyDamage;
              const todayDmg = calculateDailyDamageFromSnapshot(
                weeklyDmg,
                baselineDmg,
              );
              armyTodayDamage += todayDmg;

              memberStats.push({
                userId: uid,
                username,
                todayDamage: todayDmg,
                weeklyDamage: weeklyDmg,
              });

              if (todayDmg > topStriker.damage) {
                topStriker = {
                  username,
                  damage: todayDmg,
                  weeklyDamage: weeklyDmg,
                };
              }
            }
          }

          // Fallback if topStriker had 0 today damage, use top weekly striker
          if (topStriker.damage === 0 && memberStats.length > 0) {
            const sortedByWeekly = [...memberStats].sort(
              (a, b) => b.weeklyDamage - a.weeklyDamage,
            );
            if (sortedByWeekly[0]) {
              topStriker = {
                username: sortedByWeekly[0].username,
                damage: sortedByWeekly[0].todayDamage,
                weeklyDamage: sortedByWeekly[0].weeklyDamage,
              };
            }
          }

          const memberCount = memberIds.length || 1;
          const avgDamagePerMember = Math.round(armyTodayDamage / memberCount);

          return {
            muId: army.id,
            name: army.name,
            avatarUrl: army.avatarUrl,
            memberCount,
            todayDamage: armyTodayDamage,
            weeklyDamage: armyWeeklyDamage,
            avgDamagePerMember,
            topStriker,
          };
        } catch (err: any) {
          // If fetch fails, return baseline fallback
          const memberCount = baselineArmy?.memberCount || 20;
          const weeklyDmg = baselineArmy?.armyTotalWeeklyDamage || 0;
          return {
            muId: army.id,
            name: army.name,
            avatarUrl: army.avatarUrl,
            memberCount,
            todayDamage: 0,
            weeklyDamage: weeklyDmg,
            avgDamagePerMember: 0,
            topStriker: { username: "Bilinmiyor", damage: 0, weeklyDamage: 0 },
          };
        }
      }),
    );

    // 3. Sort all 8 armies by todayDamage descending (or weeklyDamage as secondary sort)
    armyResults.sort((a, b) => {
      if (b.todayDamage !== a.todayDamage) {
        return b.todayDamage - a.todayDamage;
      }
      return b.weeklyDamage - a.weeklyDamage;
    });

    const rankedArmies = armyResults.map((army, idx) => ({
      rank: idx + 1,
      ...army,
    }));

    const totalTodayDamage = rankedArmies.reduce(
      (sum, a) => sum + a.todayDamage,
      0,
    );
    const totalWeeklyDamage = rankedArmies.reduce(
      (sum, a) => sum + a.weeklyDamage,
      0,
    );
    const totalMembers = rankedArmies.reduce(
      (sum, a) => sum + a.memberCount,
      0,
    );

    const now = new Date();
    const todayStr = new Intl.DateTimeFormat("tr-TR", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const responsePayload = {
      success: true,
      timestamp: Date.now(),
      dateStr: todayStr,
      baselineDate,
      totalTodayDamage,
      totalWeeklyDamage,
      totalMembers,
      armies: rankedArmies,
    };

    summaryCache = { data: responsePayload, timestamp: Date.now() };
    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error("Error generating all armies daily summary:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Tüm orduların günlük hasar özeti alınamadı",
    });
  }
}
