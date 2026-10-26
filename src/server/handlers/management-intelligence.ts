import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";
import {
  readManagementOverviewCache,
  saveManagementOverviewCache,
} from "../../lib/supabaseStorage.js";

const TURKEY_ID = "6813b6d446e731854c7ac7eb";
const COUNTRY_HISTORY_KEY = "nizam_country_tracker_history_v1";
const COUNTRY_HISTORY_DAYS = 30;
const USER_PROFILE_LIMIT = 2_000;
const VIEW_TTL_MS = 5 * 60 * 1000;
const QUERY_TTL_MS = 2 * 60 * 1000;
type AnyRecord = Record<string, any>;

type CacheEntry = { timestamp: number; data: any };
const viewCache = new Map<string, CacheEntry>();
const queryCache = new Map<string, CacheEntry>();
let countryHistoryFallback: any[] = [];

function unpack(payload: any): any {
  if (payload?.error) {
    const message = payload.error?.json?.message || payload.error?.message;
    if (message) throw new Error(String(message));
  }
  const data = payload?.result?.data;
  if (data && typeof data === "object" && "json" in data) return data.json;
  if (data && typeof data === "object" && "data" in data) return data.data;
  return data ?? payload;
}

function finite(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function listOf(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.countries)) return value.countries;
  if (Array.isArray(value?.regions)) return value.regions;
  return [];
}

function turkeyDate(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(at);
}

function inputUrl(procedure: string, input?: Record<string, any>) {
  const url = new URL(`https://api2.warera.io/trpc/${procedure}`);
  if (input && Object.keys(input).length) url.searchParams.set("input", JSON.stringify(input));
  return url.toString();
}

async function fetchWarEra(url: string, retries = 3): Promise<Response> {
  const tokens = getWarEraTokens();
  if (!tokens.length) throw new Error("WarEra API anahtarı yapılandırılmamış.");
  const first = getNextWarEraToken();
  const start = Math.max(0, tokens.indexOf(first));
  let lastResponse: Response | null = null;
  let lastError: unknown;
  const maxAttempts = Math.max(retries + 1, tokens.length);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const token = tokens[(start + attempt) % tokens.length];
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "X-API-Key": token },
      });
      if (![401, 403, 429].includes(response.status)) return response;
      lastResponse = response;
      if (response.status === 429 && attempt + 1 < maxAttempts) continue;
      if ([401, 403].includes(response.status) && attempt + 1 < maxAttempts) continue;
      return response;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("WarEra API isteği tamamlanamadı.");
}

async function query(procedure: string, input?: Record<string, any>, force = false, ttl = QUERY_TTL_MS): Promise<any> {
  const key = `${procedure}:${JSON.stringify(input || {})}`;
  const cached = queryCache.get(key);
  if (!force && cached && Date.now() - cached.timestamp < ttl) return cached.data;
  const response = await fetchWarEra(inputUrl(procedure, input));
  if (!response.ok) throw Object.assign(new Error(`${procedure} verisi alınamadı (${response.status}).`), { statusCode: response.status });
  const data = unpack(await response.json());
  queryCache.set(key, { timestamp: Date.now(), data });
  return data;
}

async function queryBatchUsers(ids: string[]): Promise<any[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 25) chunks.push(ids.slice(i, i + 25));
  const batches = await mapWithConcurrency(chunks, 4, async (chunk) => {
    const procedure = "user.getUserLite";
    const url = new URL(`https://api2.warera.io/trpc/${chunk.map(() => procedure).join(",")}`);
    url.searchParams.set("batch", "1");
    url.searchParams.set("input", JSON.stringify(Object.fromEntries(chunk.map((userId, index) => [String(index), { userId }]))));
    const response = await fetchWarEra(url.toString());
    if (!response.ok) return chunk.map(() => null);
    const raw = await response.json();
    if (!Array.isArray(raw)) return chunk.map(() => null);
    return chunk.map((_, index) => {
      try {
        return unpack(raw[index]);
      } catch {
        return null;
      }
    });
  });
  return batches.flat();
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

function countryId(country: any): string {
  return String(country?._id || country?.id || "");
}

function findHomeCountry(countries: any[]): any | null {
  return countries.find((country) => countryId(country) === TURKEY_ID)
    || countries.find((country) => String(country?.code || "").toUpperCase() === "TR")
    || countries.find((country) => /turkiye|türkiye|turkey/i.test(String(country?.name || "")))
    || null;
}

async function getCountries(force = false): Promise<{ raw: any[]; home: any }> {
  const raw = listOf(await query("country.getAllCountries", undefined, force, 60_000));
  const home = findHomeCountry(raw);
  if (!home) throw new Error("Türkiye ülke verisi WarEra API yanıtında bulunamadı.");
  return { raw, home };
}

async function getGameConfig(force = false): Promise<any> {
  return query("gameConfig.getGameConfig", undefined, force, 10 * 60 * 1000);
}

function metricCountry(raw: any) {
  const rankings = raw?.rankings || {};
  const taxes = raw?.taxes || {};
  return {
    id: countryId(raw),
    name: String(raw?.name || "Bilinmeyen ülke"),
    code: String(raw?.code || ""),
    wealth: finite(rankings?.countryWealth?.value ?? raw?.wealth),
    population: finite(raw?.currentPopulation ?? raw?.population),
    activePopulation: finite(rankings?.countryActivePopulation?.value),
    development: finite(raw?.currentDevelopment ?? raw?.development),
    weeklyDamage: finite(rankings?.weeklyCountryDamages?.value),
    totalDamage: finite(rankings?.countryDamages?.value),
    taxRate: finite(taxes?.income),
    marketTax: finite(taxes?.market),
  };
}

async function readCountryHistory(): Promise<any[]> {
  try {
    const stored = await readManagementOverviewCache(COUNTRY_HISTORY_KEY);
    const snapshots = stored?.payload?.snapshots;
    if (Array.isArray(snapshots)) {
      countryHistoryFallback = snapshots;
      return snapshots;
    }
  } catch {}
  return countryHistoryFallback;
}

async function persistCountrySnapshot(countries: any[], at = new Date()): Promise<{ snapshots: any[]; saved: boolean }> {
  const date = turkeyDate(at);
  const entry = {
    date,
    timestamp: at.getTime(),
    countries: countries.map(metricCountry),
  };
  const previous = await readCountryHistory();
  const byDate = new Map<string, any>(previous.map((snapshot): [string, any] => [String(snapshot?.date), snapshot]));
  byDate.set(date, entry);
  const snapshots = Array.from(byDate.values())
    .filter((snapshot) => snapshot?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-COUNTRY_HISTORY_DAYS);
  countryHistoryFallback = snapshots;
  let saved = false;
  try {
    saved = await saveManagementOverviewCache(COUNTRY_HISTORY_KEY, { snapshots, updatedAt: at.toISOString() });
  } catch {}
  return { snapshots, saved };
}

/** Called by the existing daily damage cron so country history does not require a new Vercel function. */
export async function recordCountryTrackerSnapshot() {
  const { raw } = await getCountries(true);
  const result = await persistCountrySnapshot(raw);
  return { date: turkeyDate(), countryCount: raw.length, supabaseSaved: result.saved };
}

async function countryTrackerData(force = false) {
  const { raw, home } = await getCountries(force);
  const saved = await persistCountrySnapshot(raw);
  const countries = raw.map(metricCountry).sort((a, b) => (b.wealth || 0) - (a.wealth || 0));
  return {
    success: true,
    country: metricCountry(home),
    homeCountryId: countryId(home),
    countries,
    snapshots: saved.snapshots,
    fetchedAt: new Date().toISOString(),
    historyDays: saved.snapshots.length,
    historySavedToSupabase: saved.saved,
    source: "country.getAllCountries · country rankings",
    note: "Kişi başı servet ve vergi geliri API tarafından verilmediği için bu ekranda hesaplanmıyor. Ülke geçmişi günlük mevcut cron üzerinden tutulur.",
  };
}

function asCountryMap(rows: any[]) {
  return new Map<string, any>(rows.map((row): [string, any] => [countryId(row), row]));
}

function battleSide(battle: any, countryIdToFind: string): "attacker" | "defender" | null {
  if (String(battle?.attacker?.country || "") === countryIdToFind) return "attacker";
  if (String(battle?.defender?.country || "") === countryIdToFind) return "defender";
  return null;
}

function battleCard(battle: any, side: "attacker" | "defender", countryNames: Map<string, string>, regionNames: Map<string, string>, targetPoints: number, allied = false) {
  const opposite = side === "attacker" ? "defender" : "attacker";
  const round = battle?.currentRound || {};
  const mine = round?.[side] || {};
  const theirs = round?.[opposite] || {};
  const mineRounds = Number(battle?.[side]?.wonRoundsCount || 0);
  const theirRounds = Number(battle?.[opposite]?.wonRoundsCount || 0);
  const roundsToWin = Number(battle?.roundsToWin || 2);
  const minePoints = Number(mine?.points || 0);
  const theirPoints = Number(theirs?.points || 0);
  const mineDamage = Number(mine?.damages || 0);
  const theirDamage = Number(theirs?.damages || 0);
  let state = "Başa baş";
  let tone = "warn";
  if (mineRounds >= roundsToWin || battle?.wonBy === side) { state = "Kazandık"; tone = "good"; }
  else if (theirRounds >= roundsToWin || battle?.wonBy === opposite) { state = "Kaybettik"; tone = "bad"; }
  else if (minePoints > theirPoints * 1.12) { state = "Öndeyiz"; tone = "good"; }
  else if (theirPoints > minePoints * 1.12) { state = "Gerideyiz"; tone = "bad"; }
  const defenderRegion = String(battle?.defender?.region || "");
  const attackerRegion = String(battle?.attacker?.region || "");
  const opponentId = String(battle?.[opposite]?.country || "");
  const battleId = String(battle?._id || battle?.id || "");
  return {
    id: battleId,
    url: battleId ? `https://app.warera.io/battle/${battleId}` : null,
    type: String(battle?.type || "war"),
    typeLabel: ({ war: "Savaş", resistance: "Direniş", revolution: "Devrim" } as Record<string, string>)[String(battle?.type)] || "Muharebe",
    side,
    sideLabel: side === "attacker" ? "Saldıran" : "Savunan",
    opponent: countryNames.get(opponentId) || opponentId || "Bilinmiyor",
    opponentId,
    region: regionNames.get(defenderRegion) || defenderRegion || regionNames.get(attackerRegion) || attackerRegion || "Bölge bilgisi yok",
    attackerRegion: regionNames.get(attackerRegion) || attackerRegion,
    defenderRegion: regionNames.get(defenderRegion) || defenderRegion,
    round: Number(round?.number || 0),
    roundsToWin,
    roundsOurs: mineRounds,
    roundsTheirs: theirRounds,
    pointsOurs: minePoints,
    pointsTheirs: theirPoints,
    pointsTarget: targetPoints,
    damageOurs: mineDamage,
    damageTheirs: theirDamage,
    state,
    tone,
    allied,
    startedAt: battle?.createdAt || round?.createdAt || null,
    nextTickAt: round?.live?.nextTickAt || null,
  };
}

function normalizeRegions(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.entries(raw).map(([id, value]) => ({ _id: id, ...(value as object) }));
  return [];
}

async function warRoomData(force = false) {
  const [{ raw: countries, home }, config] = await Promise.all([getCountries(force), getGameConfig(force).catch(() => ({}))]);
  const homeId = countryId(home);
  const homeAllies = new Set<string>([
    ...(Array.isArray(home?.allies) ? home.allies : []),
    ...(Array.isArray(home?.defensivePacts) ? home.defensivePacts : []),
  ].map(String));
  const allianceId = String(home?.allianceId || "");
  const countryMap = asCountryMap(countries);
  const countryNames = new Map<string, string>(countries.map((country): [string, string] => [countryId(country), String(country?.name || countryId(country))]));
  if (allianceId) {
    for (const country of countries) if (countryId(country) !== homeId && String(country?.allianceId || "") === allianceId) homeAllies.add(countryId(country));
  }
  const friendly = new Set([homeId, ...homeAllies]);
  const [mineResult, allResult, historyResult, regionResult] = await Promise.allSettled([
    query("battle.getBattles", { countryId: homeId, isActive: true, limit: 50 }, force, 60_000),
    query("battle.getBattles", { isActive: true, limit: 100 }, force, 60_000),
    query("battle.getBattles", { countryId: homeId, isActive: false, limit: 40 }, force, 5 * 60_000),
    query("region.getRegionsObject", undefined, force, 5 * 60_000),
  ]);
  const mineRaw = mineResult.status === "fulfilled" ? listOf(mineResult.value) : [];
  const globalRaw = allResult.status === "fulfilled" ? listOf(allResult.value) : [];
  if (!mineRaw.length && !globalRaw.length && mineResult.status === "rejected" && allResult.status === "rejected") {
    throw mineResult.reason || allResult.reason || new Error("Aktif muharebe verisi alınamadı.");
  }
  const regionRows = regionResult.status === "fulfilled" ? normalizeRegions(regionResult.value) : [];
  const regionNames = new Map<string, string>(regionRows.map((region): [string, string] => [String(region?._id || region?.id || ""), String(region?.name || "")]));
  const targetPoints = Number(config?.battle?.pointsToWinRound || config?.battle?.pointsToWin || 300);
  const battleById = new Map<string, any>();
  for (const battle of [...mineRaw, ...globalRaw]) battleById.set(String(battle?._id || battle?.id || JSON.stringify(battle)), battle);
  const relevant = Array.from(battleById.values()).filter((battle) => {
    const attacker = String(battle?.attacker?.country || "");
    const defender = String(battle?.defender?.country || "");
    return friendly.has(attacker) || friendly.has(defender);
  });
  const active = relevant.map((battle) => {
    const homeSide = battleSide(battle, homeId);
    const friendSide = homeSide || (friendly.has(String(battle?.attacker?.country || "")) ? "attacker" : "defender");
    return battleCard(battle, friendSide, countryNames, regionNames, targetPoints, !homeSide);
  }).sort((a, b) => ({ bad: 0, warn: 1, good: 2 }[a.tone as "bad" | "warn" | "good"] - ({ bad: 0, warn: 1, good: 2 }[b.tone as "bad" | "warn" | "good"])));
  const historyRaw = historyResult.status === "fulfilled" ? listOf(historyResult.value) : [];
  const history = historyRaw.map((battle) => {
    const side = battleSide(battle, homeId);
    if (!side) return null;
    const card = battleCard(battle, side, countryNames, regionNames, targetPoints);
    const won = battle?.wonBy ? battle.wonBy === side : card.roundsOurs > card.roundsTheirs;
    return { ...card, won, result: won ? "Kazandık" : "Kaybettik", endedAt: battle?.endedAt || battle?.updatedAt || null };
  }).filter(Boolean);
  const attackedRegions = new Set(active.filter((battle) => battle.side === "defender").map((battle) => battle.defenderRegion));
  const cfgUpgrades = config?.upgradesConfig || config?.upgrades || {};
  const homeRegions = regionRows.filter((region) => String(region?.country || "") === homeId);
  const regions = homeRegions.map((region) => {
    const rid = String(region?._id || region?.id || "");
    const foreignNeighbors = (Array.isArray(region?.neighbors) ? region.neighbors : [])
      .map((id: any) => regionRows.find((candidate) => String(candidate?._id || candidate?.id || "") === String(id)))
      .filter((candidate: any) => candidate && String(candidate?.country || "") !== homeId);
    const neighborIds = Array.from(new Set(foreignNeighbors.map((candidate: any) => String(candidate?.country || "")).filter(Boolean)));
    const hostile = neighborIds.filter((id) => {
      const neighbor = countryMap.get(id);
      return id === String(home?.enemy || "") || (Array.isArray(home?.warsWith) && home.warsWith.includes(id)) || neighbor?.enemy === homeId;
    });
    const upgrades = region?.activeUpgradeLevels || {};
    const bunkerLevel = Number(upgrades?.bunker || 0);
    const bunkerConfig = cfgUpgrades?.bunker?.levels?.[String(bunkerLevel)] || {};
    const attacked = attackedRegions.has(String(region?.name || rid)) || active.some((battle) => battle.side === "defender" && battle.defenderRegion === (region?.name || rid));
    const risk = attacked ? "Saldırı altında" : hostile.length ? "Düşman sınırı" : neighborIds.length ? "Sınır bölgesi" : "İç bölge";
    return {
      id: rid,
      name: String(region?.name || rid),
      capital: Boolean(region?.isCapital),
      linkedToCapital: region?.isLinkedToCapital !== false,
      development: finite(region?.development),
      population: finite(region?.currentPopulation ?? region?.population),
      resistance: finite(region?.resistance),
      resistanceMax: finite(region?.resistanceMax),
      neighbors: neighborIds.map((id) => countryNames.get(id) || id),
      hostileNeighbors: hostile.map((id) => countryNames.get(id) || id),
      bunkerLevel,
      defenseBonus: finite(bunkerConfig?.stats?.defense ?? bunkerConfig?.stats?.defence),
      risk,
      tone: attacked ? "bad" : hostile.length ? "warn" : "info",
    };
  }).sort((a, b) => ({ bad: 0, warn: 1, info: 2 }[a.tone as "bad" | "warn" | "info"] - ({ bad: 0, warn: 1, info: 2 }[b.tone as "bad" | "warn" | "info"]) || (b.population || 0) - (a.population || 0));
  return {
    success: true,
    country: metricCountry(home),
    activeBattles: active.filter((battle) => !battle.allied),
    alliedBattles: active.filter((battle) => battle.allied),
    history,
    regions,
    counts: { active: active.filter((battle) => !battle.allied).length, allied: active.filter((battle) => battle.allied).length, underAttack: regions.filter((region) => region.risk === "Saldırı altında").length },
    fetchedAt: new Date().toISOString(),
    source: "battle.getBattles · country.getAllCountries · region.getRegionsObject · gameConfig",
    warnings: [
      ...(mineResult.status === "rejected" ? ["Ülkenin kendi aktif savaş sorgusu alınamadı; genel savaş listesi kullanıldı."] : []),
      ...(regionResult.status === "rejected" ? ["Bölge savunma verisi şu an alınamadı."] : []),
    ],
  };
}

const MILITARY_SKILLS = ["attack", "precision", "criticalChance", "criticalDamages", "armor", "dodge", "lootChance", "health", "hunger"];
const ECONOMY_SKILLS = ["production", "entrepreneurship", "companies", "energy", "management"];
const MINISTRY_NAMES: Record<string, string> = {
  minOfWar: "Savaş Bakanı", minOfForeignAffairs: "Dışişleri Bakanı", minOfEconomy: "Ekonomi Bakanı",
  minOfInterior: "İçişleri Bakanı", minOfEducation: "Eğitim Bakanı", minOfDevelopment: "Kalkınma Bakanı",
};

function skillTotal(skills: any, keys: string[]): number {
  return keys.reduce((total, key) => total + Number(skills?.[key]?.level || 0), 0);
}

function profileRow(profile: any, joinedAt: string | null, governmentRoles: string[], voteMin: number, minDays: number, now: number) {
  const dates = profile?.dates || {};
  const skills = profile?.skills || {};
  const level = Number(profile?.leveling?.level || profile?.level || 0);
  const militaryPoints = skillTotal(skills, MILITARY_SKILLS);
  const economyPoints = skillTotal(skills, ECONOMY_SKILLS);
  const lastConnectionAt = dates?.lastConnectionAt || null;
  const lastConnection = lastConnectionAt ? new Date(lastConnectionAt).getTime() : NaN;
  const hoursSinceConnection = Number.isFinite(lastConnection) ? Math.max(0, (now - lastConnection) / 3_600_000) : null;
  const joined = joinedAt || profile?.createdAt || null;
  const joinedTime = joined ? new Date(joined).getTime() : NaN;
  const hoursSinceJoined = Number.isFinite(joinedTime) ? Math.max(0, (now - joinedTime) / 3_600_000) : null;
  let status = "Bilinmiyor";
  let tone = "info";
  if (hoursSinceConnection !== null && hoursSinceConnection <= 24) { status = "Aktif"; tone = "good"; }
  else if (hoursSinceConnection !== null && hoursSinceConnection <= 72) { status = "Uykuda"; tone = "warn"; }
  else if (hoursSinceConnection !== null) { status = "İnaktif"; tone = "bad"; }
  const build = level < 30 ? "Acemi" : militaryPoints > economyPoints * 1.3 ? "Asker" : economyPoints > militaryPoints * 1.3 ? "Ekonomist" : "Karma";
  const citizenshipChangedAt = dates?.citizenshipChangedAt || dates?.countryChangedAt || null;
  const citizenshipChangedTime = citizenshipChangedAt ? new Date(citizenshipChangedAt).getTime() : NaN;
  const daysSinceChange = Number.isFinite(citizenshipChangedTime) ? (now - citizenshipChangedTime) / 86_400_000 : null;
  const canVote = level >= voteMin && (minDays <= 0 || daysSinceChange === null || daysSinceChange >= minDays);
  const id = String(profile?._id || profile?.id || "");
  return {
    id,
    name: String(profile?.username || id.slice(0, 8) || "Bilinmeyen oyuncu"),
    url: id ? `https://app.warera.io/user/${id}` : null,
    avatarUrl: profile?.avatarUrl || null,
    level,
    status,
    tone,
    hoursSinceConnection,
    joinedAt: joined,
    isNew: hoursSinceJoined !== null && hoursSinceJoined <= 7 * 24,
    build,
    militaryPoints,
    economyPoints,
    weeklyDamage: finite(profile?.rankings?.weeklyUserDamages?.value),
    totalDamage: finite(profile?.rankings?.userDamages?.value),
    wealth: finite(profile?.rankings?.userWealth?.value ?? profile?.wealth),
    militaryRank: finite(profile?.militaryRank),
    lastWorkAt: dates?.lastWorkAt || null,
    roles: governmentRoles,
    canVote,
  };
}

function idsInRoles(government: any): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const add = (id: any, role: string) => {
    if (!id || typeof id !== "string") return;
    result.set(id, [...(result.get(id) || []), role]);
  };
  add(government?.president, "Devlet Başkanı");
  add(government?.vicePresident, "Başkan Yardımcısı");
  for (const [key, value] of Object.entries(government || {})) if (key.startsWith("minOf") && typeof value === "string") add(value, MINISTRY_NAMES[key] || key);
  for (const member of government?.congressMembers || []) add(member, "Kongre üyesi");
  return result;
}

function countdownRows(dates: any, now: number) {
  const labels: Record<string, string> = {
    nextDayAt: "Yeni gün", nextCongressElectionsAt: "Kongre seçimi", nextPresidentialElectionsAt: "Başkanlık seçimi", nextMonthAt: "Yeni ay",
  };
  return Object.entries(labels).flatMap(([key, name]) => {
    const value = dates?.[key];
    const timestamp = value ? new Date(String(value)).getTime() : NaN;
    if (!Number.isFinite(timestamp)) return [];
    return [{ key, name, at: String(value), hoursLeft: Math.max(0, (timestamp - now) / 3_600_000) }];
  }).sort((a, b) => a.hoursLeft - b.hoursLeft);
}

async function citizensData(force = false) {
  const [{ raw: countries, home }, config, dates, government] = await Promise.all([
    getCountries(force),
    getGameConfig(force).catch(() => ({})),
    query("gameConfig.getDates", undefined, force, 5 * 60_000).catch(() => ({})),
    query("government.getByCountryId", { countryId: TURKEY_ID }, force, 3 * 60_000).catch(() => ({})),
  ]);
  const homeId = countryId(home);
  const ids: string[] = [];
  const joinedAt = new Map<string, string | null>();
  let cursor: string | null = null;
  let complete = false;
  const maxPages = Math.ceil(USER_PROFILE_LIMIT / 100);
  for (let page = 0; page < maxPages; page++) {
    const input: Record<string, any> = { countryId: homeId, limit: 100 };
    if (cursor) input.cursor = cursor;
    const response = await query("user.getUsersByCountry", input, force, 3 * 60_000);
    const items = listOf(response);
    for (const row of items) {
      const id = String(row?._id || row?.id || (typeof row === "string" ? row : ""));
      if (!id) continue;
      ids.push(id);
      joinedAt.set(id, typeof row === "object" ? row.createdAt || null : null);
    }
    cursor = response?.nextCursor ? String(response.nextCursor) : null;
    if (!cursor || !items.length) { complete = true; break; }
  }
  const rolesById = idsInRoles(government);
  const extraGovernmentIds = Array.from(rolesById.keys()).filter((id) => !joinedAt.has(id));
  const [profiles, extraGovernmentProfiles] = await Promise.all([
    queryBatchUsers(ids),
    queryBatchUsers(extraGovernmentIds),
  ]);
  const election = config?.election || {};
  const voteMin = Number(election.voteMinLevel || 20);
  const candidateMin = Number(election.candidateMinLevel || 15);
  const minVoteDays = Number(election.voteMinDaysSinceCitizenshipChange || 0);
  const now = Date.now();
  const rows = profiles.flatMap((profile, index) => {
    if (!profile || typeof profile !== "object") return [];
    const id = String(profile?._id || profile?.id || ids[index] || "");
    const copy = { ...profile, _id: id };
    return [profileRow(copy, joinedAt.get(id) || null, rolesById.get(id) || [], voteMin, minVoteDays, now)];
  }).sort((a, b) => (b.level - a.level) || String(a.name).localeCompare(b.name, "tr"));
  const counts = {
    total: ids.length,
    profiled: rows.length,
    active: rows.filter((row) => row.status === "Aktif").length,
    sleeping: rows.filter((row) => row.status === "Uykuda").length,
    inactive: rows.filter((row) => row.status === "İnaktif").length,
    unknownStatus: rows.filter((row) => row.status === "Bilinmiyor").length,
    new: rows.filter((row) => row.isNew).length,
    soldiers: rows.filter((row) => row.build === "Asker").length,
    economists: rows.filter((row) => row.build === "Ekonomist").length,
    mixed: rows.filter((row) => row.build === "Karma").length,
    novices: rows.filter((row) => row.build === "Acemi").length,
    voters: rows.filter((row) => row.canVote).length,
  };
  const governmentRows = rows;
  const peopleById = new Map<string, AnyRecord>();
  for (const row of governmentRows) peopleById.set(row.id, row);
  extraGovernmentProfiles.forEach((profile, index) => {
    if (!profile || typeof profile !== "object") return;
    const id = String(profile?._id || profile?.id || extraGovernmentIds[index] || "");
    if (id) peopleById.set(id, { id, name: profile?.username || id.slice(0, 8), level: finite(profile?.leveling?.level), status: "Görevli", tone: "info" });
  });
  const person = (id: any, role: string) => {
    if (!id || typeof id !== "string") return null;
    const row = peopleById.get(id);
    return { id, name: row?.name || id.slice(0, 8), role, url: `https://app.warera.io/user/${id}`, level: row?.level ?? null, status: row?.status || "Bilinmiyor", tone: row?.tone || "info" };
  };
  const offices = [
    person(government?.president, "Devlet Başkanı"),
    person(government?.vicePresident, "Başkan Yardımcısı"),
    ...Object.entries(government || {}).filter(([key, value]) => key.startsWith("minOf") && typeof value === "string").map(([key, value]) => person(value, MINISTRY_NAMES[key] || key)),
  ].filter(Boolean);
  const congress = (government?.congressMembers || []).map((id: any) => person(id, "Kongre üyesi")).filter(Boolean);
  const countdowns = countdownRows(dates, now);
  const actions: Array<{ tone: string; text: string }> = [];
  if (!complete) actions.push({ tone: "warn", text: `Vatandaş listesi ilk ${ids.length} kişiyle sınırlı; kalan profiller sonraki sayfalarda.` });
  if (counts.inactive > 0) actions.push({ tone: counts.inactive > counts.active ? "bad" : "warn", text: `${counts.inactive} vatandaş 3 günden uzun süredir giriş yapmamış görünüyor.` });
  for (const countdown of countdowns.filter((item) => item.key.includes("Election") && item.hoursLeft <= 48)) actions.push({ tone: "warn", text: `${countdown.name} ${countdown.hoursLeft.toFixed(0)} saat sonra; ${counts.voters} uygun seçmen görünüyor.` });
  for (const office of offices as any[]) if (office.status === "İnaktif") actions.push({ tone: "bad", text: `${office.role} ${office.name} inaktif görünüyor.` });
  const partyId = typeof home?.rulingParty === "string" ? home.rulingParty : home?.rulingParty?._id;
  const partyName = typeof home?.rulingParty === "object" ? home.rulingParty?.name : home?.rulingPartyName;
  return {
    success: true,
    country: metricCountry(home),
    total: ids.length,
    complete,
    profileLimit: USER_PROFILE_LIMIT,
    counts,
    rows,
    government: {
      president: offices.find((office: any) => office.role === "Devlet Başkanı") || null,
      offices,
      congress,
      party: { id: partyId || null, name: partyName || (partyId ? `Parti ${String(partyId).slice(0, 8)}` : "Parti bilgisi yok") },
      voters: { eligible: counts.voters, minLevel: voteMin, candidateMinLevel: candidateMin, minDaysSinceCitizenshipChange: minVoteDays },
      countdowns,
    },
    actions,
    fetchedAt: new Date().toISOString(),
    source: "user.getUsersByCountry · user.getUserLite · government.getByCountryId · gameConfig",
    note: `Asker/ekonomist sınıfı, askeri ve ekonomi beceri seviyeleri karşılaştırılarak hesaplanır. Profil alınabilen kişi: ${rows.length}/${ids.length}.`,
    warnings: profiles.filter((profile) => !profile).length ? [`${profiles.filter((profile) => !profile).length} vatandaş profil verisi alınamadı.`] : [],
    countries,
  };
}

async function taxMetadata(force = false) {
  const [{ home }, config] = await Promise.all([getCountries(force), getGameConfig(force).catch(() => ({}))]);
  const taxes = home?.taxes || {};
  const maxTax = finite(config?.country?.maxTaxAmount ?? config?.tax?.maxIncomeTax) ?? 45;
  return {
    success: true,
    country: metricCountry(home),
    currentTaxPct: finite(taxes?.income) ?? 0,
    maxTaxPct: Math.max(0, Math.min(100, maxTax)),
    fetchedAt: new Date().toISOString(),
    source: "country.getAllCountries.taxes.income · gameConfig.country.maxTaxAmount",
    note: "WarEra API günlük gelir vergisi toplamını Nizam ekranlarında sunmuyor. Günlük brüt ücret matrahı kullanıcı tarafından girilir; davranışsal elde tutma oranı varsayımdır.",
  };
}

async function dailyDashboard(force = false) {
  const [warResult, citizenResult, countryResult, configResult] = await Promise.allSettled([
    warRoomData(force),
    citizensData(force),
    getCountries(force),
    getGameConfig(force),
  ]);
  const war = warResult.status === "fulfilled" ? warResult.value : null;
  const people = citizenResult.status === "fulfilled" ? citizenResult.value : null;
  const countryBundle = countryResult.status === "fulfilled" ? countryResult.value : null;
  const config = configResult.status === "fulfilled" ? configResult.value : {};
  const home = countryBundle?.home;
  const currentCountry = home ? metricCountry(home) : null;
  const dates = await query("gameConfig.getDates", undefined, force, 5 * 60_000).catch(() => ({}));
  const countdowns = countdownRows(dates, Date.now());
  const actions: Array<{ domain: string; tone: string; text: string; tab: string }> = [];
  for (const battle of war?.activeBattles || []) {
    if (battle.tone === "bad") actions.push({ domain: "Savaş", tone: "bad", text: `${battle.region}: ${battle.opponent} karşısında gerideyiz.`, tab: "mgmtWarRoom" });
  }
  if (war && !war.activeBattles.length) actions.push({ domain: "Savaş", tone: "good", text: "Türkiye için aktif bir muharebe görünmüyor.", tab: "mgmtWarRoom" });
  if (people?.counts?.inactive) actions.push({ domain: "Vatandaşlar", tone: people.counts.inactive > people.counts.active ? "bad" : "warn", text: `${people.counts.inactive} vatandaş inaktif; seçmen ve görev listelerini gözden geçir.`, tab: "mgmtCitizens" });
  for (const election of countdowns.filter((item) => item.key.includes("Election") && item.hoursLeft <= 48)) actions.push({ domain: "Hükümet", tone: "warn", text: `${election.name} ${election.hoursLeft.toFixed(0)} saat sonra.`, tab: "mgmtCitizens" });
  const currentTax = finite(home?.taxes?.income);
  const maxTax = finite(config?.country?.maxTaxAmount ?? config?.tax?.maxIncomeTax) ?? 45;
  if (currentTax !== null && currentTax > maxTax) actions.push({ domain: "Ekonomi", tone: "bad", text: `API verisindeki vergi oranı oyun sınırı olan %${maxTax} değerini aşıyor; vergi verisini kontrol et.`, tab: "mgmtTax" });
  if (!people) actions.push({ domain: "Vatandaşlar", tone: "warn", text: "Vatandaş özeti alınamadı.", tab: "mgmtCitizens" });
  if (!war) actions.push({ domain: "Savaş", tone: "warn", text: "Savaş durumu alınamadı.", tab: "mgmtWarRoom" });
  actions.sort((a, b) => ({ bad: 0, warn: 1, good: 2 }[a.tone as "bad" | "warn" | "good"] - ({ bad: 0, warn: 1, good: 2 }[b.tone as "bad" | "warn" | "good"])));
  return {
    success: true,
    country: currentCountry,
    domains: [
      { key: "war", label: "Savaş", value: war?.counts?.active ?? null, detail: war ? `${war.counts.allied} müttefik muharebesi` : "Veri alınamadı", tone: war?.activeBattles?.some((battle: any) => battle.tone === "bad") ? "bad" : "good", tab: "mgmtWarRoom" },
      { key: "people", label: "Vatandaş", value: people?.counts?.active ?? null, detail: people ? `${people.counts.total} toplam · ${people.counts.new} yeni · ${people.counts.inactive} inaktif` : "Veri alınamadı", tone: people && people.counts.active / Math.max(1, people.counts.total) >= 0.6 ? "good" : "warn", tab: "mgmtCitizens" },
      { key: "government", label: "Seçmen", value: people?.government?.voters?.eligible ?? null, detail: people?.government?.countdowns?.find((item: any) => item.key.includes("Election"))?.name || "Yaklaşan seçim bilgisi yok", tone: "info", tab: "mgmtCitizens" },
      { key: "tax", label: "Gelir vergisi", value: currentTax, detail: currentTax === null ? "Veri alınamadı" : `Oyun sınırı %${maxTax}`, tone: "info", tab: "mgmtTax" },
      { key: "tracking", label: "Ülke takibi", value: currentCountry?.weeklyDamage, detail: "Haftalık ülke hasarı", tone: "info", tab: "mgmtCountryTracker" },
    ],
    actions: actions.slice(0, 12),
    countdowns: countdowns.slice(0, 4),
    warnings: [
      ...(warResult.status === "rejected" ? ["Savaş verisi alınamadı."] : []),
      ...(citizenResult.status === "rejected" ? ["Vatandaş verisi alınamadı."] : []),
      ...(countryResult.status === "rejected" ? ["Ülke verisi alınamadı."] : []),
    ],
    fetchedAt: new Date().toISOString(),
    source: "Türkiye ülke verisi · aktif muharebeler · vatandaş ve hükümet verisi",
  };
}

async function loadView(view: string, force: boolean) {
  switch (view) {
    case "war-room": return warRoomData(force);
    case "citizens": return citizensData(force);
    case "country-tracker": return countryTrackerData(force);
    case "daily-dashboard": return dailyDashboard(force);
    case "tax-simulator": return taxMetadata(force);
    default: throw Object.assign(new Error("Geçersiz yönetim görünümü."), { statusCode: 400 });
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
  const view = String(req.query?.view || "");
  const allowed = new Set(["war-room", "citizens", "country-tracker", "daily-dashboard", "tax-simulator"]);
  if (!allowed.has(view)) return res.status(400).json({ success: false, error: "Geçersiz yönetim görünümü." });
  const force = req.query?.refresh === "true";
  const key = `nizam_management_${view}_v1`;
  const ttl = view === "citizens" ? 10 * 60_000 : VIEW_TTL_MS;
  try {
    const cached = viewCache.get(key);
    if (!force && cached && Date.now() - cached.timestamp < ttl) return res.status(200).json(cached.data);
    if (!force) {
      const persisted = await readManagementOverviewCache(key);
      if (persisted && Date.now() - persisted.timestamp < ttl) {
        viewCache.set(key, { timestamp: persisted.timestamp, data: persisted.payload });
        return res.status(200).json(persisted.payload);
      }
    }
    const payload = await loadView(view, force);
    viewCache.set(key, { timestamp: Date.now(), data: payload });
    await saveManagementOverviewCache(key, payload);
    return res.status(200).json(payload);
  } catch (error: any) {
    const status = Number(error?.statusCode) === 429 ? 429 : Number(error?.statusCode) === 400 ? 400 : 502;
    if (status === 429) res.setHeader("Retry-After", "60");
    return res.status(status).json({
      success: false,
      error: error?.message || "Yönetim verileri alınamadı.",
    });
  }
}
