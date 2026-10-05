// Vercel Serverless Function: GET /api/military-overview
// Fetches full military unit overview: Troop strength, leadership, MVPs, spectrum, and combat stats

import { getNextWarEraToken } from "../../lib/wareraTokens.js";
import { getMilitaryUnitWeeklyDamage } from "../../lib/dailyDamage.js";

const DEFAULT_MU_ID = "69c229c4449287ea1a26a5b3";

// In-memory cache for serverless execution
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

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

function formatDamageNumber(dmg: number): string {
  if (dmg >= 1e9) return `${(dmg / 1e9).toFixed(2)}B`;
  if (dmg >= 1e6) return `${(dmg / 1e6).toFixed(2)}M`;
  if (dmg >= 1e3) return `${(dmg / 1e3).toFixed(1)}K`;
  return `${dmg.toLocaleString("tr-TR")}`;
}

function formatWealthNumber(w: number): string {
  if (w >= 1e6) return `$${(w / 1e6).toFixed(1)}M`;
  if (w >= 1e3) return `$${(w / 1e3).toFixed(1)}K`;
  return `$${Math.round(w).toLocaleString("tr-TR")}`;
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

  const cacheKey = `mil_overview_${targetMuId}`;
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
    const muData = muJson?.result?.data;
    if (!muData) {
      return res
        .status(404)
        .json({ success: false, error: "Military Unit not found" });
    }

    const members: string[] = muData.members || [];
    const leaderId = muData.user || "";
    const managers: string[] = muData.roles?.managers || [];
    const commanders: string[] = muData.roles?.commanders || [];

    // 2. Fetch Country Info
    let countryInfo = {
      name: "Türkiye",
      code: "TR",
      flagUrl: "https://media.warera.io/images/flags/TR.svg?v=16",
    };
    if (muData.country) {
      try {
        const countryUrl = `https://api2.warera.io/trpc/country.getCountryById?input=${encodeURIComponent(JSON.stringify({ countryId: muData.country }))}`;
        const cRes = await fetchWarEra(countryUrl);
        if (cRes.ok) {
          const cJson = await cRes.json();
          const cData = cJson?.result?.data;
          if (cData) {
            const code = (cData.code || "tr").toUpperCase();
            countryInfo = {
              name: cData.name || "Türkiye",
              code,
              flagUrl:
                cData.flagUrl ||
                `https://media.warera.io/images/flags/${code}.svg?v=16`,
            };
          }
        }
      } catch (cErr) {
        console.warn("Error fetching country info:", cErr);
      }
    }

    // 3. Fetch User Profiles for all members using tRPC batching (chunks of 10)
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
                if (item?.result?.data) {
                  allUsers.push(item.result.data);
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
              if (sJson?.result?.data) {
                allUsers.push(sJson.result.data);
              }
            }
          } catch (_) {}
        }),
      );
    }

    // 4. Compute Statistics
    const memberCount = members.length;
    const totalWeeklyDamage = getMilitaryUnitWeeklyDamage(muData);
    const totalAllTimeDamage = allUsers.reduce(
      (sum, u) => sum + (u.rankings?.userDamages?.value || 0),
      0,
    );
    const totalWealth = allUsers.reduce(
      (sum, u) => sum + (u.rankings?.userWealth?.value || 0),
      0,
    );
    const avgLevel =
      memberCount > 0
        ? Number(
            (
              allUsers.reduce((sum, u) => sum + (u.leveling?.level || 1), 0) /
              memberCount
            ).toFixed(1),
          )
        : 0;
    const avgWealth =
      memberCount > 0 ? Math.round(totalWealth / memberCount) : 0;

    // Unique leadership count
    const leadershipIdSet = new Set<string>();
    if (leaderId) leadershipIdSet.add(leaderId);
    managers.forEach((m) => leadershipIdSet.add(m));
    commanders.forEach((c) => leadershipIdSet.add(c));
    const commanderCount = leadershipIdSet.size;

    // 5. MVPs
    // Weekly Damage Leader
    const sortedWeekly = [...allUsers].sort(
      (a, b) =>
        (b.rankings?.weeklyUserDamages?.value || 0) -
        (a.rankings?.weeklyUserDamages?.value || 0),
    );
    const topWeeklyUser = sortedWeekly[0];
    const topWeeklyDamageVal =
      topWeeklyUser?.rankings?.weeklyUserDamages?.value || 0;

    // All Time Damage Leader
    const sortedAllTime = [...allUsers].sort(
      (a, b) =>
        (b.rankings?.userDamages?.value || 0) -
        (a.rankings?.userDamages?.value || 0),
    );
    const topAllTimeUser = sortedAllTime[0];
    const topAllTimeDamageVal =
      topAllTimeUser?.rankings?.userDamages?.value || 0;

    // Most Experienced (by totalXp or prestige)
    const sortedXp = [...allUsers].sort((a, b) => {
      const aScore =
        (a.leveling?.prestigeLevel || 0) * 1000000 + (a.leveling?.totalXp || 0);
      const bScore =
        (b.leveling?.prestigeLevel || 0) * 1000000 + (b.leveling?.totalXp || 0);
      return bScore - aScore;
    });
    const topXpUser = sortedXp[0];

    // Wealthiest
    const sortedWealth = [...allUsers].sort(
      (a, b) =>
        (b.rankings?.userWealth?.value || 0) -
        (a.rankings?.userWealth?.value || 0),
    );
    const topWealthUser = sortedWealth[0];
    const topWealthVal = topWealthUser?.rankings?.userWealth?.value || 0;

    // 6. Leadership Kadrosu
    const leadership: any[] = [];
    const leaderUser = allUsers.find((u) => u._id === leaderId);
    if (leaderUser) {
      leadership.push({
        userId: leaderUser._id,
        username: leaderUser.username,
        avatarUrl: leaderUser.avatarUrl || "",
        role: "leader",
        roleLabel: "Birlik Lideri / Kurucu",
        level: leaderUser.leveling?.level || 1,
      });
    }

    const addedUserIds = new Set<string>([leaderId]);
    for (const cId of commanders) {
      if (addedUserIds.has(cId)) continue;
      const cUser = allUsers.find((u) => u._id === cId);
      if (cUser) {
        leadership.push({
          userId: cUser._id,
          username: cUser.username,
          avatarUrl: cUser.avatarUrl || "",
          role: "commander",
          roleLabel: "Komutan",
          level: cUser.leveling?.level || 1,
        });
        addedUserIds.add(cId);
      }
    }
    for (const mId of managers) {
      if (addedUserIds.has(mId)) continue;
      const mUser = allUsers.find((u) => u._id === mId);
      if (mUser) {
        leadership.push({
          userId: mUser._id,
          username: mUser.username,
          avatarUrl: mUser.avatarUrl || "",
          role: "manager",
          roleLabel: "Yönetici",
          level: mUser.leveling?.level || 1,
        });
        addedUserIds.add(mId);
      }
    }

    // 7. Level Spectrum (Kademelere göre dağılım)
    const spectrumTiers = [
      { range: "Lv. 41 - 50", min: 41, max: 50 },
      { range: "Lv. 31 - 40", min: 31, max: 40 },
      { range: "Lv. 21 - 30", min: 21, max: 30 },
      { range: "Lv. 11 - 20", min: 11, max: 20 },
      { range: "Lv. 1 - 10", min: 1, max: 10 },
    ];
    const levelSpectrum = spectrumTiers.map((tier) => {
      const count = allUsers.filter((u) => {
        const lvl = u.leveling?.level || 1;
        return lvl >= tier.min && lvl <= tier.max;
      }).length;
      const percentage =
        memberCount > 0 ? Math.round((count / memberCount) * 100) : 0;
      return {
        ...tier,
        count,
        percentage,
      };
    });

    // 8. Member Items
    const memberItems = allUsers.map((u) => ({
      userId: u._id,
      username: u.username,
      avatarUrl: u.avatarUrl || "",
      level: u.leveling?.level || 1,
      totalXp: u.leveling?.totalXp || 0,
      prestigeLevel: u.leveling?.prestigeLevel || 0,
      weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
      allTimeDamage: u.rankings?.userDamages?.value || 0,
      wealth: u.rankings?.userWealth?.value || 0,
    }));

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || "Turkic Tribe",
          avatarUrl: muData.avatarUrl || "",
          description:
            muData.description ||
            "Orduya ait temel operasyonel göstergeler, üye gücü, haftalık ve kümülatif hasar istatistikleri ve toplam varlık özeti.",
          countryId: muData.country || "",
          leaderId,
        },
        countryInfo,
        stats: {
          memberCount,
          commanderCount,
          totalWeeklyDamage,
          totalAllTimeDamage,
          averageLevel: avgLevel,
          totalWealth,
          averageWealth: avgWealth,
        },
        mvps: {
          weeklyDamageLeader: topWeeklyUser
            ? {
                userId: topWeeklyUser._id,
                username: topWeeklyUser.username,
                avatarUrl: topWeeklyUser.avatarUrl || "",
                value: topWeeklyDamageVal,
                formattedValue: formatDamageNumber(topWeeklyDamageVal),
                level: topWeeklyUser.leveling?.level || 1,
              }
            : null,
          allTimeDamageLeader: topAllTimeUser
            ? {
                userId: topAllTimeUser._id,
                username: topAllTimeUser.username,
                avatarUrl: topAllTimeUser.avatarUrl || "",
                value: topAllTimeDamageVal,
                formattedValue: formatDamageNumber(topAllTimeDamageVal),
                level: topAllTimeUser.leveling?.level || 1,
              }
            : null,
          mostExperienced: topXpUser
            ? {
                userId: topXpUser._id,
                username: topXpUser.username,
                avatarUrl: topXpUser.avatarUrl || "",
                value: topXpUser.leveling?.totalXp || 0,
                formattedValue: `${((topXpUser.leveling?.totalXp || 0) / 1000).toFixed(1)}K XP`,
                level: topXpUser.leveling?.level || 1,
                prestigeLevel: topXpUser.leveling?.prestigeLevel || 0,
              }
            : null,
          wealthiest: topWealthUser
            ? {
                userId: topWealthUser._id,
                username: topWealthUser.username,
                avatarUrl: topWealthUser.avatarUrl || "",
                value: topWealthVal,
                formattedValue: formatWealthNumber(topWealthVal),
                level: topWealthUser.leveling?.level || 1,
              }
            : null,
        },
        leadership,
        levelSpectrum,
        members: memberItems,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.status(200).json(resultData);
  } catch (err: any) {
    console.error("Military overview error:", err);
    return res
      .status(500)
      .json({
        success: false,
        error: err.message || "Failed fetching military overview",
      });
  }
}
