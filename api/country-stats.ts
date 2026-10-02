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

async function fetchWarEra(url: string, init?: RequestInit): Promise<Response> {
  const token = getNextToken();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-API-Key': token,
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(url, { ...init, headers });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const COUNTRY_STATS_CACHE_KEY = 'warera_country_stats_6_armies';
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const cached = cache.get(COUNTRY_STATS_CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
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
    const allUserIds: string[] = [];
    const armyInfoList: { id: string; name: string; memberCount: number; avatarUrl?: string }[] = [];

    // 1. Fetch member lists from the 6 military units
    for (const army of armiesConfig) {
      const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: army.id }))}`;
      const muRes = await fetchWarEra(muUrl);
      if (muRes.ok) {
        const muJson = await muRes.json();
        const members: string[] = muJson?.result?.data?.members || [];
        armyInfoList.push({
          id: army.id,
          name: muJson?.result?.data?.name || army.name,
          avatarUrl: muJson?.result?.data?.avatarUrl || army.avatarUrl,
          memberCount: members.length,
        });
        allUserIds.push(...members);
      } else {
        armyInfoList.push({ id: army.id, name: army.name, avatarUrl: army.avatarUrl, memberCount: 20 });
      }
    }

    const uniqueUserIds = Array.from(new Set(allUserIds));
    const playersList: { userId: string; username: string; level: number; factoryLimit: number }[] = [];

    // 2. Fetch user profile batches (25 per batch)
    const chunkSize = 25;
    for (let i = 0; i < uniqueUserIds.length; i += chunkSize) {
      const chunk = uniqueUserIds.slice(i, i + chunkSize);
      const batchInput: Record<string, { userId: string }> = {};
      chunk.forEach((id, idx) => { batchInput[String(idx)] = { userId: id }; });

      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => 'user.getUserLite').join(',')}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
      const bRes = await fetchWarEra(batchUrl);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const items = Array.isArray(bJson) ? bJson : [bJson];
        items.forEach((item: any) => {
          const u = item?.result?.data;
          if (u) {
            const level = Number(u.leveling?.level || 1);
            const compSkill = u.skills?.companies;
            const factoryLimit = Number(compSkill?.total ?? (2 + (compSkill?.level || 0) + (compSkill?.prestige || 0)));
            playersList.push({
              userId: u._id,
              username: u.username || 'Oyuncu',
              level,
              factoryLimit,
            });
          }
        });
      }
      if (i + chunkSize < uniqueUserIds.length) {
        await sleep(40);
      }
    }

    // 3. Aggregate level statistics
    const byLevel: Record<number, { level: number; playerCount: number; totalFactories: number; totalAutomatedLevel: number }> = {};
    const totalCount = playersList.length || 1;

    playersList.forEach((p) => {
      if (!byLevel[p.level]) {
        byLevel[p.level] = { level: p.level, playerCount: 0, totalFactories: 0, totalAutomatedLevel: 0 };
      }
      byLevel[p.level].playerCount++;
      byLevel[p.level].totalFactories += p.factoryLimit;

      const estEnginePerFactory = Math.min(7, Math.max(3, Math.floor(p.level / 7) + 2));
      byLevel[p.level].totalAutomatedLevel += (p.factoryLimit * estEnginePerFactory);
    });

    const levelStats = Object.values(byLevel)
      .sort((a, b) => a.level - b.level)
      .map((item) => {
        const count = item.playerCount;
        return {
          level: item.level,
          playerCount: count,
          percentage: Number(((count / totalCount) * 100).toFixed(1)),
          avgFactories: count > 0 ? Number((item.totalFactories / count).toFixed(2)) : 0,
          totalFactories: item.totalFactories,
          avgAutomatedLevel: count > 0 ? Number((item.totalAutomatedLevel / count).toFixed(1)) : 0,
          totalAutomatedLevel: item.totalAutomatedLevel,
        };
      });

    const payload = {
      success: true,
      totalArmies: armyInfoList.length,
      totalPlayers: playersList.length,
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
