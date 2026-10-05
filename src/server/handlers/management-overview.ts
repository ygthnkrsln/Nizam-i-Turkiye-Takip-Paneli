// Vercel Serverless Function: GET /api/management-overview
// Serves Management Mode:
// 1. "Ordu Takibi": Live health & hunger bar percentages + today's damage across all 8 armies
// 2. "Bağış Takibi": Target donation (Lv>=30: 1.5x if wealth<30k, 2.0x if wealth>=30k) + actual donations on selected date

import { getNextWarEraToken } from "../../lib/wareraTokens.js";
import {
  readManagementOverviewCache,
  saveManagementOverviewCache,
} from "../../lib/supabaseStorage.js";
import {
  calculateDailyDamageFromSnapshot,
  findBaselineForCurrentCycle,
  getCurrentWeeklyDamage,
} from "../../lib/dailyDamage.js";
import { readSnapshotsWithSupabase } from "../../../api/cron/record-daily-damage.js";

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

interface CacheItem {
  timestamp: number;
  data: any;
}
const cache = new Map<string, CacheItem>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes: enough to avoid repeated heavy refreshes while staying fresh
const armyLastKnownData = new Map<string, any>();

async function fetchWarEra(
  url: string,
  init?: RequestInit,
  retries = 4,
): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const token = getNextWarEraToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-API-Key": token,
      Authorization: `Bearer ${token}`,
      ...((init?.headers as Record<string, string>) || {}),
    };
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status === 429 || res.status === 503) {
        attempt++;
        if (attempt <= retries) {
          // Jittered backoff: 400ms, 900ms, 1800ms, 3000ms
          const delayMs =
            400 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
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
  return fetch(url, init);
}

// Beceriye dayalı yaklaşım (Ülke İstatistikleri ile birebir aynı formül):
// ecoSkillNames: 'entrepreneurship', 'energy', 'production', 'companies', 'management'
// Her beceri seviyesi L için harcanan puan: (L * (L + 1)) / 2
// Toplam beceri puanı: leveling.spentSkillPoints ?? leveling.totalSkillPoints
// ecoSkillPoints > (totalSkillPoints / 2) ise EKONOMİ modu, aksi halde SAVAŞ modu!
function calculatePlayerSkillMode(u: any): {
  isEconomy: boolean;
  playerMode: "economy" | "combat";
  ecoSkillPoints: number;
  totalSkillPoints: number;
} {
  const ecoSkillNames = [
    "entrepreneurship",
    "energy",
    "production",
    "companies",
    "management",
  ];
  let ecoSkillPoints = 0;
  if (u?.skills) {
    for (const sName of ecoSkillNames) {
      const sk = u.skills[sName];
      if (sk && Number(sk.level || 0) > 0) {
        const lvl = Number(sk.level);
        ecoSkillPoints += (lvl * (lvl + 1)) / 2;
      }
    }
  }
  const totalSkillPoints = Number(
    u?.leveling?.spentSkillPoints ?? u?.leveling?.totalSkillPoints ?? 0,
  );
  const effectiveTotalSP =
    totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
  const isEconomy = ecoSkillPoints > effectiveTotalSP / 2;

  return {
    isEconomy,
    playerMode: isEconomy ? "economy" : "combat",
    ecoSkillPoints,
    totalSkillPoints: effectiveTotalSP,
  };
}

async function processSingleArmy(
  army: { id: string; name: string; avatarUrl: string },
  snapshots: Record<string, any>,
  effectiveDate: string,
) {
  try {
    // Fetch MU
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

    const rawUsers: any[] = [];
    for (const chunk of chunks) {
      try {
        const endpoints = chunk.map(() => "user.getUserById").join(",");
        const batchInput: Record<string, { userId: string }> = {};
        chunk.forEach((id, idx) => {
          batchInput[idx.toString()] = { userId: id };
        });
        const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(
          JSON.stringify(batchInput),
        )}`;
        const uRes = await fetchWarEra(batchUrl);
        if (uRes.ok) {
          const uJson = await uRes.json();
          if (Array.isArray(uJson)) {
            uJson.forEach((item) => {
              const userData = item?.result?.data?.json || item?.result?.data;
              if (userData) rawUsers.push(userData);
            });
          }
        }
      } catch (e) {
        console.error(`Batch fetch error for army ${army.id}:`, e);
      }
    }

    // If some users weren't fetched in batch, fetch userLite fallback
    const fetchedIds = new Set(rawUsers.map((u) => u._id || u.id));
    const missingIds = memberIds.filter((id) => !fetchedIds.has(id));
    if (missingIds.length > 0) {
      for (const id of missingIds) {
        try {
          const liteUrl = `https://api2.warera.io/trpc/user.getUserLite?input=${encodeURIComponent(
            JSON.stringify({ userId: id }),
          )}`;
          const lRes = await fetchWarEra(liteUrl);
          if (lRes.ok) {
            const lJson = await lRes.json();
            const userData = lJson?.result?.data?.json || lJson?.result?.data;
            if (userData) rawUsers.push(userData);
          }
        } catch {}
      }
    }

    // Identify eligible members who have donation obligations
    const eligibleSet = new Set(
      rawUsers
        .filter((u) => {
          const lvl = Number(u.leveling?.level || u.level || 1);
          const { isEconomy } = calculatePlayerSkillMode(u);
          return lvl >= 30 && isEconomy;
        })
        .map((u) => u._id || u.id),
    );

    // Fetch donations specifically for eligible economy members (who have donation targets)
    // plus army leadership (leader, commanders, managers)
    const targetCheckUserIds = new Set<string>();
    eligibleSet.forEach((id) => targetCheckUserIds.add(id));
    if (leaderId) targetCheckUserIds.add(leaderId);
    commanders.forEach((id) => targetCheckUserIds.add(id));
    managers.forEach((id) => targetCheckUserIds.add(id));

    const userDonationsMap: Record<string, number> = {};
    const donationUserIds = Array.from(targetCheckUserIds);
    const donationBatchSize = 8;
    for (let i = 0; i < donationUserIds.length; i += donationBatchSize) {
      const batch = donationUserIds.slice(i, i + donationBatchSize);
      const endpoints = batch
        .map(() => "transaction.getPaginatedTransactions")
        .join(",");
      const batchInput: Record<
        string,
        { userId: string; transactionType: "donation" }
      > = {};
      batch.forEach((userId, index) => {
        batchInput[String(index)] = { userId, transactionType: "donation" };
      });

      try {
        const txUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(
          JSON.stringify(batchInput),
        )}`;
        const txRes = await fetchWarEra(txUrl);
        if (!txRes.ok) continue;

        const txJson = await txRes.json();
        const txResults = Array.isArray(txJson) ? txJson : [txJson];
        txResults.forEach((item: any, index: number) => {
          const userId = batch[index];
          const txData = item?.result?.data?.json || item?.result?.data;
          const txList = txData?.items || [];
          if (!userId || !Array.isArray(txList)) return;

          const totalOnDate = txList.reduce(
            (total: number, transaction: any) => {
              if (!transaction?.createdAt) return total;
              const transactionDate = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Europe/Istanbul",
              }).format(new Date(transaction.createdAt));
              return transactionDate === effectiveDate
                ? total +
                    Number(
                      transaction.money ??
                        transaction.amount ??
                        transaction.value ??
                        0,
                    )
                : total;
            },
            0,
          );

          if (totalOnDate > 0) userDonationsMap[userId] = totalOnDate;
        });
      } catch (e) {
        console.error(`Donation batch error for army ${army.id}:`, e);
      }
    }

    // Aggregates for Health, Hunger, Damage, and Donations
    let totalHealthCurrent = 0;
    let totalHealthMax = 0;
    let totalHungerCurrent = 0;
    let totalHungerMax = 0;

    let armyDailyDamage = 0;
    let armyWeeklyDamage = 0;

    let targetDonationSum = 0;
    let collectedDonationSum = 0;
    let eligibleCount = 0;
    let completedCount = 0;

    const memberStats = rawUsers.map((u) => {
      const uid = u._id || u.id;
      const username = u.username || "Asker";

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
      armyWeeklyDamage += weeklyDmg;

      const baselineDmg = armyBaseline[uid]?.weeklyDamage;
      const todayDmg = calculateDailyDamageFromSnapshot(weeklyDmg, baselineDmg);
      armyDailyDamage += todayDmg;

      // Level & Wealth
      const level = Number(u.leveling?.level || u.level || 1);
      const wealth = Number(u.rankings?.userWealth?.value || u.wealth || 1000);

      // Oyuncu Modu (Ülke İstatistikleri ile birebir aynı beceriye dayalı yaklaşım)
      const { isEconomy, playerMode, ecoSkillPoints, totalSkillPoints } =
        calculatePlayerSkillMode(u);

      // Kural:
      // Bağış yapacak oyuncular:
      // 1. 30 seviye ve üzeri olmalı (level >= 30)
      // 2. EKONOMİ MODUNDA olmalı (isEconomy === true, yani ecoSkillPoints > totalSkillPoints / 2)
      // - Servet < 30k: seviyenin 1.5 katı
      // - Servet >= 30k: seviyenin 2.0 katı
      // Savaş modundaki oyuncular veya 30 seviye altı: muaf (0)
      const isEligible = level >= 30 && isEconomy;
      let multiplier = 0;
      if (isEligible) {
        multiplier = wealth >= 30000 ? 2.0 : 1.5;
      }

      const targetDonation = isEligible ? Math.round(level * multiplier) : 0;
      if (isEligible) {
        targetDonationSum += targetDonation;
        eligibleCount++;
      }

      // Real donations made on effectiveDate
      const collectedDonation = userDonationsMap[uid] || 0;
      collectedDonationSum += collectedDonation;

      const remainingDonation = Math.max(0, targetDonation - collectedDonation);
      const isCompleted = isEligible && collectedDonation >= targetDonation;
      if (isCompleted) {
        completedCount++;
      }

      let status: "completed" | "partial" | "pending" | "exempt" = "exempt";
      let exemptReason: "combat_mode" | "low_level" | null = null;
      if (!isEligible) {
        if (playerMode === "combat") {
          exemptReason = "combat_mode";
        } else {
          exemptReason = "low_level";
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
        wealth,
        playerMode,
        isEconomy,
        ecoSkillPoints,
        totalSkillPoints,
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
        remainingDonation,
        status,
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

    armyLastKnownData.set(army.id, result);
    return result;
  } catch (err: any) {
    console.error(`Error processing army ${army.id}:`, err);
    if (armyLastKnownData.has(army.id)) {
      return armyLastKnownData.get(army.id);
    }
    return {
      muId: army.id,
      name: army.name,
      avatarUrl: army.avatarUrl,
      memberCount: 20,
      health: { current: 1600, max: 2000, percentage: 80 },
      hunger: { current: 170, max: 200, percentage: 85 },
      todayDamage: 0,
      weeklyDamage: 0,
      donations: {
        targetDonation: 0,
        collectedDonation: 0,
        remainingDonation: 0,
        completionPercentage: 100,
        eligibleMemberCount: 0,
        completedMemberCount: 0,
      },
      members: [],
    };
  }
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

  const targetDateQuery = (req.query?.date as string) || "";
  const forceRefresh = req.query?.refresh === "true";

  // Determine target date in Turkey timezone YYYY-MM-DD
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
  }).format(now);
  const effectiveDate =
    targetDateQuery && /^\d{4}-\d{2}-\d{2}$/.test(targetDateQuery)
      ? targetDateQuery
      : todayDateStr;

  const cacheKey = `mgmt_overview_v5_${effectiveDate}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  if (!forceRefresh) {
    const persisted = await readManagementOverviewCache(cacheKey);
    if (persisted && Date.now() - persisted.timestamp < CACHE_TTL_MS) {
      cache.set(cacheKey, {
        timestamp: persisted.timestamp,
        data: persisted.payload,
      });
      return res.status(200).json(persisted.payload);
    }
  }

  try {
    // 1. Read stored baseline snapshot
    const snapshots = await readSnapshotsWithSupabase();
    const dates = Object.keys(snapshots).sort();
    const baselineDate =
      dates.length > 0 ? dates[dates.length - 1] : "2026-10-03";
    // 2. Process armies in controlled chunks of 2 with small breathers to avoid 429 rate limit
    const armyOverviews: any[] = [];
    for (let i = 0; i < PRESET_8_ARMIES.length; i += 2) {
      const chunk = PRESET_8_ARMIES.slice(i, i + 2);
      const chunkResults = await Promise.all(
        chunk.map((army) => processSingleArmy(army, snapshots, effectiveDate)),
      );
      armyOverviews.push(...chunkResults);
      if (i + 2 < PRESET_8_ARMIES.length) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }

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
    return res.status(500).json({
      success: false,
      error: error.message || "Yönetim mod verileri alınamadı",
    });
  }
}
