// Vercel Serverless Function: GET /api/military-details
// Fetches full military unit details, building upgrades, 6 strategic rankings, and member roster with live War Era API

import { getNextWarEraToken } from "../../lib/wareraTokens.js";

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

  const cacheKey = `mil_details_${targetMuId}`;
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

    // 3. Resolve Leader username
    const leaderUser = allUsers.find((u) => u._id === leaderId);
    const leaderUsername = leaderUser?.username || "Muhtarr";

    // 4. Map and rank members (sorted by weeklyDamage descending)
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

      return {
        userId: u._id,
        username: u.username || "Bilinmeyen Asker",
        avatarUrl: u.avatarUrl || "",
        level: u.leveling?.level || 1,
        prestigeLevel: u.leveling?.prestigeLevel || 0,
        totalXp: u.leveling?.totalXp || 0,
        weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
        weeklyTier: u.rankings?.weeklyUserDamages?.tier || "bronze",
        weeklyRank: u.rankings?.weeklyUserDamages?.rank || 0,
        allTimeDamage: u.rankings?.userDamages?.value || 0,
        allTimeTier: u.rankings?.userDamages?.tier || "bronze",
        allTimeRank: u.rankings?.userDamages?.rank || 0,
        wealth: u.rankings?.userWealth?.value || 0,
        role,
        roleBadge: isLeader ? "L" : isCommander ? "C" : isManager ? "M" : "",
        roleLabel: isLeader
          ? "Birlik Sahibi / Kurucu"
          : isCommander
            ? "Komutan"
            : isManager
              ? "Yönetici"
              : "Asker",
      };
    });

    // Sort descending by weekly damage
    mappedMembers.sort((a, b) => b.weeklyDamage - a.weeklyDamage);

    // 5. Structure Final Output
    const rankings = muData.rankings || {};
    const overallTier =
      rankings.muDamages?.tier || rankings.muWeeklyDamages?.tier || "platinum";

    const resultData = {
      success: true,
      data: {
        muInfo: {
          id: targetMuId,
          name: muData.name || "Turkic Tribe",
          avatarUrl: muData.avatarUrl || "",
          level: muData.leveling?.level || 1,
          leaderId,
          leaderUsername,
          reputation: Number(
            (
              muData.mercenaryReputation ||
              rankings.muReputation?.value ||
              11.91
            ).toFixed(2),
          ),
          memberCount: members.length,
          createdAt: muData.createdAt || "2026-03-24T06:05:56.824Z",
          overallTier,
          activeUpgradeLevels: {
            headquarters: muData.activeUpgradeLevels?.headquarters || 4,
            dormitories: muData.activeUpgradeLevels?.dormitories || 5,
          },
          rankings: {
            muWeeklyDamages: {
              value: rankings.muWeeklyDamages?.value || 47136427,
              rank: rankings.muWeeklyDamages?.rank || 191,
              tier: rankings.muWeeklyDamages?.tier || "platinum",
            },
            muDamages: {
              value: rankings.muDamages?.value || 1028447657,
              rank: rankings.muDamages?.rank || 135,
              tier: rankings.muDamages?.tier || "platinum",
            },
            muBounty: {
              value: rankings.muBounty?.value || 17441,
              rank: rankings.muBounty?.rank || 205,
              tier: rankings.muBounty?.tier || "platinum",
            },
            muReputation: {
              value: Number(
                (
                  rankings.muReputation?.value ||
                  muData.mercenaryReputation ||
                  11.91
                ).toFixed(2),
              ),
              rank: rankings.muReputation?.rank || 68,
              tier: rankings.muReputation?.tier || "platinum",
            },
            muTerrain: {
              value: rankings.muTerrain?.value || 23899,
              rank: rankings.muTerrain?.rank || 243,
              tier: rankings.muTerrain?.tier || "platinum",
            },
            muWealth: {
              value: Number((rankings.muWealth?.value || 679.97).toFixed(2)),
              rank: rankings.muWealth?.rank || 661,
              tier: rankings.muWealth?.tier || "silver",
            },
          },
        },
        members: mappedMembers,
        commanderCount: commanders.length,
        managerCount: managers.length,
        generatedAt: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: resultData, timestamp: Date.now() });
    return res.status(200).json(resultData);
  } catch (err: any) {
    console.error("Military details error:", err);
    return res
      .status(500)
      .json({
        success: false,
        error: err.message || "Failed fetching military details",
      });
  }
}
