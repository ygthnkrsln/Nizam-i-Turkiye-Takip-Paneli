// Vercel Serverless Function: GET /api/country-stats
// Aggregates military unit & factory statistics across the 6 major Turkish armies

const BUILTIN_WARERA_TOKENS = [
  'wae_7cddb132963e57ee7ee9bd9663f57460b5dabe2746531019f6abdd1056d023ef',
  'wae_76b0af852e1c19d6155b955eb566c2ed6b285d097785ce34c08d339b64eaee44',
];

let tokenIndex = 0;
function getNextToken(): string {
  const token = BUILTIN_WARERA_TOKENS[tokenIndex % BUILTIN_WARERA_TOKENS.length];
  tokenIndex++;
  return token;
}

async function fetchWarEra(url: string, init?: RequestInit, userToken?: string): Promise<Response> {
  const token = (userToken && userToken.trim()) || getNextToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': token,
    ...((init?.headers as Record<string, string>) || {}),
  };
  try {
    const res = await fetch(url, { ...init, headers });
    if ((res.status === 429 || res.status === 403) && userToken) {
      const fallbackToken = getNextToken();
      headers['X-API-Key'] = fallbackToken;
      return fetch(url, { ...init, headers });
    }
    return res;
  } catch (err) {
    if (userToken) {
      const fallbackToken = getNextToken();
      headers['X-API-Key'] = fallbackToken;
      return fetch(url, { ...init, headers });
    }
    throw err;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const COUNTRY_STATS_CACHE_KEY = 'warera_country_stats_6_armies_v5';
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-User-Api-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const forceRefresh = req.query?.refresh === 'true';
  const userApiKey = (req.headers['x-user-api-key'] as string) || (req.query?.apiKey as string);
  const cached = cache.get(COUNTRY_STATS_CACHE_KEY);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.timestamp < CACHE_TTL_MS &&
    cached.data?.levelStats?.[0]?.combatFactories !== undefined
  ) {
    return res.json(cached.data);
  }

  const armiesConfig = [
    { id: '69c229c4449287ea1a26a5b3', name: 'Turkic Tribe', avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png' },
    { id: '689f69064e095b8b9f1b885a', name: 'ASHINA', avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png' },
    { id: '68bc9bcb4870c8e343e42855', name: 'ASHINA Reserve', avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png' },
    { id: '690088ce4864a132a2d92d07', name: 'Legio Panthera', avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png' },
    { id: '6902269a560184d196a6fba8', name: 'BEASTs', avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg' },
    { id: '6a0f1495478fe2a58d2868d6', name: 'Deliler', avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png' },
  ];

  try {
    const armyInfoList: { id: string; name: string; memberCount: number; avatarUrl?: string }[] = [];

    // 1. Fetch member lists from the 6 military units in parallel
    const muPromises = armiesConfig.map(async (army) => {
      try {
        const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: army.id }))}`;
        const muRes = await fetchWarEra(muUrl, undefined, userApiKey);
        if (muRes.ok) {
          const muJson = await muRes.json();
          const members: string[] = muJson?.result?.data?.members || [];
          return {
            info: {
              id: army.id,
              name: muJson?.result?.data?.name || army.name,
              avatarUrl: muJson?.result?.data?.avatarUrl || army.avatarUrl,
              memberCount: members.length,
            },
            members,
          };
        }
      } catch (e) {}
      return {
        info: { id: army.id, name: army.name, avatarUrl: army.avatarUrl, memberCount: 20 },
        members: [] as string[],
      };
    });

    const muResults = await Promise.all(muPromises);
    const allUserIds: string[] = [];
    muResults.forEach((r) => {
      armyInfoList.push(r.info);
      allUserIds.push(...r.members);
    });

    const uniqueUserIds = Array.from(new Set(allUserIds));
    const playersList: { userId: string; username: string; level: number; factoryLimit: number; wealth: number; isEconomy: boolean }[] = [];

    // 2. Fetch user profile batches (25 per batch) in parallel
    const chunkSize = 25;
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueUserIds.length; i += chunkSize) {
      chunks.push(uniqueUserIds.slice(i, i + chunkSize));
    }

    const batchPromises = chunks.map(async (chunk) => {
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((id, idx) => { batchInput[String(idx)] = { userId: id }; });

      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => 'user.getUserLite').join(',')}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      const bRes = await fetchWarEra(batchUrl, undefined, userApiKey);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const items = Array.isArray(bJson) ? bJson : [bJson];
        return items.map((item: any) => item?.result?.data).filter(Boolean);
      }
      return [];
    });

    const batchResults = await Promise.all(batchPromises);
    const allUsers = batchResults.flat();
    allUsers.forEach((u: any) => {
      const level = Number(u.leveling?.level || 1);
      const compSkill = u.skills?.companies;
      const factoryLimit = Number(compSkill?.total ?? (2 + (compSkill?.level || 0) + (compSkill?.prestige || 0)));
      const wealth = Number(u.rankings?.userWealth?.value ?? u.wealth ?? 0);

      // Economy vs Combat mode calculation
      const ecoSkillNames = ['entrepreneurship', 'energy', 'production', 'companies', 'management'];
      let ecoSkillPoints = 0;
      if (u.skills) {
        for (const sName of ecoSkillNames) {
          const sk = u.skills[sName];
          if (sk && sk.level > 0) {
            const lvl = Number(sk.level);
            ecoSkillPoints += (lvl * (lvl + 1)) / 2;
          }
        }
      }
      const totalSkillPoints = Number(
        u.leveling?.spentSkillPoints ??
        u.leveling?.totalSkillPoints ??
        0
      );
      const effectiveTotalSP = totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
      const isEconomy = ecoSkillPoints > (effectiveTotalSP / 2);

      playersList.push({
        userId: u._id,
        username: u.username || 'Oyuncu',
        level,
        factoryLimit,
        wealth,
        isEconomy,
      });
    });

    // 3. Aggregate level statistics
    const byLevel: Record<number, {
      level: number;
      playerCount: number;
      combatCount: number;
      economyCount: number;
      combatFactories: number;
      economyFactories: number;
      combatAutomatedLevel: number;
      economyAutomatedLevel: number;
      combatWealth: number;
      economyWealth: number;
      totalFactories: number;
      totalAutomatedLevel: number;
      totalWealth: number;
    }> = {};
    const totalCount = playersList.length || 1;
    let totalCombatPlayers = 0;
    let totalEconomyPlayers = 0;

    playersList.forEach((p) => {
      if (!byLevel[p.level]) {
        byLevel[p.level] = {
          level: p.level,
          playerCount: 0,
          combatCount: 0,
          economyCount: 0,
          combatFactories: 0,
          economyFactories: 0,
          combatAutomatedLevel: 0,
          economyAutomatedLevel: 0,
          combatWealth: 0,
          economyWealth: 0,
          totalFactories: 0,
          totalAutomatedLevel: 0,
          totalWealth: 0,
        };
      }
      byLevel[p.level].playerCount++;
      const estEnginePerFactory = Math.min(7, Math.max(3, Math.floor(p.level / 7) + 2));
      const estAutomated = p.factoryLimit * estEnginePerFactory;

      if (p.isEconomy) {
        byLevel[p.level].economyCount++;
        byLevel[p.level].economyFactories += p.factoryLimit;
        byLevel[p.level].economyAutomatedLevel += estAutomated;
        byLevel[p.level].economyWealth += (p.wealth || 0);
        totalEconomyPlayers++;
      } else {
        byLevel[p.level].combatCount++;
        byLevel[p.level].combatFactories += p.factoryLimit;
        byLevel[p.level].combatAutomatedLevel += estAutomated;
        byLevel[p.level].combatWealth += (p.wealth || 0);
        totalCombatPlayers++;
      }
      byLevel[p.level].totalFactories += p.factoryLimit;
      byLevel[p.level].totalWealth += (p.wealth || 0);
      byLevel[p.level].totalAutomatedLevel += estAutomated;
    });

    const levelStats = Object.values(byLevel)
      .sort((a, b) => a.level - b.level)
      .map((item) => {
        const count = item.playerCount;
        const cCount = item.combatCount;
        const eCount = item.economyCount;

        return {
          level: item.level,
          playerCount: count,
          percentage: Number(((count / totalCount) * 100).toFixed(1)),
          combatCount: cCount,
          economyCount: eCount,
          combatRatio: count > 0 ? Number(((cCount / count) * 100).toFixed(1)) : 0,
          economyRatio: count > 0 ? Number(((eCount / count) * 100).toFixed(1)) : 0,

          combatFactories: item.combatFactories,
          economyFactories: item.economyFactories,
          avgCombatFactories: cCount > 0 ? Number((item.combatFactories / cCount).toFixed(2)) : 0,
          avgEconomyFactories: eCount > 0 ? Number((item.economyFactories / eCount).toFixed(2)) : 0,

          combatAutomatedLevel: item.combatAutomatedLevel,
          economyAutomatedLevel: item.economyAutomatedLevel,
          avgCombatAutomatedLevel: cCount > 0 ? Number((item.combatAutomatedLevel / cCount).toFixed(1)) : 0,
          avgEconomyAutomatedLevel: eCount > 0 ? Number((item.economyAutomatedLevel / eCount).toFixed(1)) : 0,

          combatWealth: item.combatWealth,
          economyWealth: item.economyWealth,
          avgCombatWealth: cCount > 0 ? Math.round(item.combatWealth / cCount) : 0,
          avgEconomyWealth: eCount > 0 ? Math.round(item.economyWealth / eCount) : 0,

          avgFactories: count > 0 ? Number((item.totalFactories / count).toFixed(2)) : 0,
          totalFactories: item.totalFactories,
          avgAutomatedLevel: count > 0 ? Number((item.totalAutomatedLevel / count).toFixed(1)) : 0,
          totalAutomatedLevel: item.totalAutomatedLevel,
          avgWealth: count > 0 ? Math.round(item.totalWealth / count) : 0,
          totalWealth: item.totalWealth,
        };
      });

    const payload = {
      success: true,
      totalArmies: armyInfoList.length,
      totalPlayers: playersList.length,
      totalCombatPlayers,
      totalEconomyPlayers,
      armies: armyInfoList,
      levelStats,
      generatedAt: new Date().toISOString(),
    };

    cache.set(COUNTRY_STATS_CACHE_KEY, { data: payload, timestamp: Date.now() });
    return res.json(payload);
  } catch (err: any) {
    console.error('Error generating country stats on Vercel:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed fetching country stats' });
  }
}
