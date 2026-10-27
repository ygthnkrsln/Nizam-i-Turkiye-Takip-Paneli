import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";
import {
  readManagementOverviewCache,
  saveManagementOverviewCache,
} from "../../lib/supabaseStorage.js";

const TURKEY_ID = "6813b6d446e731854c7ac7eb";
const COUNTRY_HISTORY_KEY = "nizam_country_tracker_history_v1";
const COUNTRY_HISTORY_DAYS = 30;
const ACTIVE_CITIZEN_PROFILE_LIMIT = 5_000;
const ACTIVE_CITIZEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const COUNTRY_WEALTH_TRACKING_LIMIT = 4;
const USER_PROFILE_LIMIT = 2_000;
const VIEW_TTL_MS = 5 * 60 * 1000;
const QUERY_TTL_MS = 2 * 60 * 1000;
type AnyRecord = Record<string, any>;

type CacheEntry = { timestamp: number; data: any };
const viewCache = new Map<string, CacheEntry>();
const queryCache = new Map<string, CacheEntry>();
let countryHistoryFallback: any[] = [];
let countryWealthTrackedIdsFallback: string[] = [];
let countryWealthTrackedIdsKnown = false;

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

function inputUrl(procedure: string, input?: Record<string, any>, apiHost = "api2.warera.io") {
  const url = new URL(`https://${apiHost}/trpc/${procedure}`);
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

async function query(procedure: string, input?: Record<string, any>, force = false, ttl = QUERY_TTL_MS, publicApi3 = false): Promise<any> {
  const key = `${procedure}:${JSON.stringify(input || {})}`;
  const cached = queryCache.get(key);
  if (!force && cached && Date.now() - cached.timestamp < ttl) return cached.data;
  let response: Response;
  if (publicApi3) {
    response = await fetch(inputUrl(procedure, input, "api3.warera.io"), { headers: { Accept: "application/json" } });
    if (response.status === 429 || response.status >= 500) {
      response = await fetchWarEra(inputUrl(procedure, input));
    }
  } else {
    response = await fetchWarEra(inputUrl(procedure, input));
  }
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

async function fetchActiveCitizenWealth(countries: any[], force = false): Promise<Record<string, AnyRecord>> {
  if (!countries.length) return {};
  const rosters = await mapWithConcurrency(countries, 2, async (country) => {
    const ids: string[] = [];
    let cursor: string | null = null;
    let complete = false;
    const maxPages = Math.ceil(ACTIVE_CITIZEN_PROFILE_LIMIT / 100);
    for (let page = 0; page < maxPages; page++) {
      const input: Record<string, any> = { countryId: countryId(country), limit: 100 };
      if (cursor) input.cursor = cursor;
      const result = await query("user.getUsersByCountry", input, force, 3 * 60_000);
      const items = listOf(result);
      for (const row of items) {
        const id = String(row?._id || row?.id || (typeof row === "string" ? row : ""));
        if (id) ids.push(id);
      }
      cursor = result?.nextCursor ? String(result.nextCursor) : null;
      if (!cursor || !items.length) { complete = true; break; }
    }
    return { id: countryId(country), ids: Array.from(new Set(ids)), complete };
  });
  const allIds = Array.from(new Set(rosters.flatMap((roster) => roster.ids)));
  const profiles = await queryBatchUsers(allIds);
  const profilesById = new Map<string, any>();
  profiles.forEach((profile, index) => {
    const id = String(profile?._id || profile?.id || allIds[index] || "");
    if (id && profile && typeof profile === "object") profilesById.set(id, profile);
  });
  const now = Date.now();
  const result: Record<string, AnyRecord> = {};
  for (const roster of rosters) {
    const profiledCount = roster.ids.filter((id) => profilesById.has(id)).length;
    let activeCount = 0;
    let activeWealthProfiledCount = 0;
    let wealth = 0;
    for (const id of roster.ids) {
      const profile = profilesById.get(id);
      if (!profile) continue;
      const lastConnectionAt = profile?.dates?.lastConnectionAt;
      const lastConnection = lastConnectionAt ? new Date(lastConnectionAt).getTime() : NaN;
      const hoursSinceConnection = Number.isFinite(lastConnection) ? Math.max(0, (now - lastConnection) / 3_600_000) : null;
      if (hoursSinceConnection === null || hoursSinceConnection * 3_600_000 > ACTIVE_CITIZEN_WINDOW_MS) continue;
      activeCount++;
      const playerWealth = finite(profile?.rankings?.userWealth?.value ?? profile?.wealth);
      if (playerWealth !== null) {
        wealth += playerWealth;
        activeWealthProfiledCount++;
      }
    }
    result[roster.id] = {
      activeCitizenWealth: wealth,
      activeCitizenCount: activeCount,
      activeCitizenRosterCount: roster.ids.length,
      activeCitizenProfiledCount: profiledCount,
      activeCitizenWealthProfiledCount: activeWealthProfiledCount,
      activeCitizenWealthComplete: roster.complete && profiledCount === roster.ids.length && activeWealthProfiledCount === activeCount,
      activeCitizenWealthTrackedAt: new Date(now).toISOString(),
    };
  }
  return result;
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
  // The official API3 docs expose country.getAllCountries as a public GET endpoint.
  const raw = listOf(await query("country.getAllCountries", undefined, force, 60_000, true));
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
    treasury: finite(raw?.money),
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
    const savedTrackedIds = stored?.payload?.trackedWealthCountryIds;
    if (Array.isArray(savedTrackedIds)) {
      countryWealthTrackedIdsFallback = savedTrackedIds.map(String).slice(0, COUNTRY_WEALTH_TRACKING_LIMIT);
      countryWealthTrackedIdsKnown = true;
    }
    const snapshots = stored?.payload?.snapshots;
    if (Array.isArray(snapshots)) {
      countryHistoryFallback = snapshots;
      if (!countryWealthTrackedIdsKnown) {
        const latest = [...snapshots].sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))[0];
        countryWealthTrackedIdsFallback = (latest?.countries || [])
          .filter((country: AnyRecord) => country.activeCitizenWealth !== undefined)
          .map((country: AnyRecord) => String(country.id))
          .filter(Boolean)
          .slice(0, COUNTRY_WEALTH_TRACKING_LIMIT);
      }
      return snapshots;
    }
  } catch {}
  return countryHistoryFallback;
}

async function readTrackedCountryWealthIds(): Promise<string[]> {
  await readCountryHistory();
  return [...countryWealthTrackedIdsFallback];
}

async function persistCountrySnapshot(
  countries: any[],
  at = new Date(),
  wealthMetrics?: Record<string, AnyRecord>,
  trackedIds?: string[],
): Promise<{ snapshots: any[]; saved: boolean }> {
  const date = turkeyDate(at);
  if (trackedIds !== undefined) {
    countryWealthTrackedIdsFallback = Array.from(new Set(trackedIds)).slice(0, COUNTRY_WEALTH_TRACKING_LIMIT);
    countryWealthTrackedIdsKnown = true;
  }
  const previous = await readCountryHistory();
  const todaySnapshot = previous.find((snapshot) => String(snapshot?.date) === date);
  const entry = {
    date,
    timestamp: at.getTime(),
    countries: countries.map((country) => {
      const mapped = metricCountry(country);
      const prior = todaySnapshot?.countries?.find((row: AnyRecord) => row.id === mapped.id);
      const wealth = wealthMetrics?.[mapped.id] || prior;
      return wealth ? { ...mapped, ...wealth } : mapped;
    }),
  };
  const byDate = new Map<string, any>(previous.map((snapshot): [string, any] => [String(snapshot?.date), snapshot]));
  byDate.set(date, entry);
  const snapshots = Array.from(byDate.values())
    .filter((snapshot) => snapshot?.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-COUNTRY_HISTORY_DAYS);
  countryHistoryFallback = snapshots;
  let saved = false;
  try {
    saved = await saveManagementOverviewCache(COUNTRY_HISTORY_KEY, {
      snapshots,
      trackedWealthCountryIds: countryWealthTrackedIdsFallback,
      updatedAt: at.toISOString(),
    });
  } catch {}
  return { snapshots, saved };
}

/** Called by the existing daily damage cron so country history does not require a new Vercel function. */
export async function recordCountryTrackerSnapshot() {
  const { raw } = await getCountries(true);
  const trackedIds = await readTrackedCountryWealthIds();
  const trackedCountries = raw.filter((country) => trackedIds.includes(countryId(country)));
  let wealthMetrics: Record<string, AnyRecord> | undefined;
  if (trackedCountries.length) {
    try {
      wealthMetrics = await fetchActiveCitizenWealth(trackedCountries, true);
    } catch (error) {
      console.warn("Active citizen wealth snapshot failed:", error);
    }
  }
  const result = await persistCountrySnapshot(raw, new Date(), wealthMetrics, trackedIds);
  return { date: turkeyDate(), countryCount: raw.length, supabaseSaved: result.saved };
}

async function countryTrackerData(force = false, requestedCountryIds?: string[]) {
  const { raw, home } = await getCountries(force);
  const requestedIds = requestedCountryIds === undefined
    ? await readTrackedCountryWealthIds()
    : Array.from(new Set(requestedCountryIds)).slice(0, COUNTRY_WEALTH_TRACKING_LIMIT);
  const validCountryIds = new Set(raw.map(countryId));
  const validRequestedIds = requestedIds.filter((id) => validCountryIds.has(id));
  const trackedCountries = raw.filter((country) => validRequestedIds.includes(countryId(country)));
  let wealthMetrics: Record<string, AnyRecord> | undefined;
  if (trackedCountries.length) wealthMetrics = await fetchActiveCitizenWealth(trackedCountries, force);
  const saved = await persistCountrySnapshot(raw, new Date(), wealthMetrics, requestedCountryIds === undefined ? undefined : validRequestedIds);
  const todaySnapshot = saved.snapshots.find((snapshot) => snapshot.date === turkeyDate());
  const savedCountries = new Map<string, AnyRecord>((todaySnapshot?.countries || []).map((country: AnyRecord): [string, AnyRecord] => [country.id, country]));
  const countries = raw.map((country) => ({ ...metricCountry(country), ...(savedCountries.get(countryId(country)) || {}) }))
    .sort((a, b) => (b.wealth || 0) - (a.wealth || 0));
  return {
    success: true,
    country: metricCountry(home),
    homeCountryId: countryId(home),
    countries,
    snapshots: saved.snapshots,
    fetchedAt: new Date().toISOString(),
    historyDays: saved.snapshots.length,
    historySavedToSupabase: saved.saved,
    trackedWealthCountryIds: validRequestedIds,
    source: "api3.warera.io/trpc · country.getAllCountries · country rankings",
    note: "Ülke servet sıralama değeri ve hazine bakiyesi ayrıdır. Aktif vatandaş serveti, son 24 saatte giriş yapan vatandaş profillerinden hesaplanır ve seçili ülkeler için günlük snapshot olarak tutulur.",
  };
}

async function allianceDamageData(force = false) {
  const { raw, home } = await getCountries(force);
  const homeId = countryId(home);
  const allianceId = String(home?.allianceId || "");
  const allianceInfo = allianceId
    ? await query("alliance.getById", { allianceId }, force, 60_000).catch(() => null)
    : null;
  const unionCountryIds = new Set([
    homeId,
    "6813b6d546e731854c7ac8d1", // Azerbaijan
    "6873d0ea1758b40e712b5ef5", // Cameroon
  ]);
  const unionNames = /^(turkiye|türkiye|turkey|azerbaijan|azerbaycan|cameroon|kamerun)$/i;
  const members = raw.filter((country) =>
    countryId(country) === homeId ||
    (allianceId && String(country?.allianceId || "") === allianceId) ||
    unionNames.test(String(country?.name || "")),
  );
  const { snapshots } = await persistCountrySnapshot(raw, new Date());
  const today = turkeyDate();
  const todayTime = new Date(`${today}T12:00:00`).getTime();
  const previousTarget = todayTime - 7 * 86_400_000;
  const previousSnapshot = [...snapshots]
    .filter((snapshot) => {
      const diff = previousTarget - new Date(`${snapshot.date}T12:00:00`).getTime();
      return diff >= 0 && diff <= 2 * 86_400_000;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const previousById = new Map<string, any>((previousSnapshot?.countries || []).map((country: AnyRecord): [string, AnyRecord] => [String(country.id), country]));
  const previousAvailable = Boolean(previousSnapshot);
  const countryMetrics = members.map((country) => {
    const current = metricCountry(country);
    return {
      ...current,
      previousWeeklyDamage: finite(previousById.get(current.id)?.weeklyDamage),
      allianceId: String(country?.allianceId || ""),
    };
  }).sort((a, b) => (b.weeklyDamage || 0) - (a.weeklyDamage || 0));
  const unionMembers = countryMetrics.filter((country) => unionCountryIds.has(country.id) || unionNames.test(country.name));
  const otherMembers = countryMetrics.filter((country) => !unionMembers.includes(country));
  const unionCurrent = unionMembers.reduce((sum, country) => sum + (country.weeklyDamage || 0), 0);
  const unionPreviousAvailable = previousAvailable && unionMembers.every((country) => country.previousWeeklyDamage !== null);
  const unionPrevious = unionPreviousAvailable
    ? unionMembers.reduce((sum, country) => sum + (country.previousWeeklyDamage || 0), 0)
    : null;
  const countries = [
    {
      id: "turkish-union",
      name: "Turkish Union",
      code: "TU",
      weeklyDamage: unionCurrent,
      previousWeeklyDamage: unionPreviousAvailable
        ? unionMembers.reduce((sum, country) => sum + (country.previousWeeklyDamage || 0), 0)
        : null,
      memberCountries: unionMembers.map((country) => country.name),
    },
    ...otherMembers,
  ].sort((a, b) => (b.weeklyDamage || 0) - (a.weeklyDamage || 0));
  return {
    success: true,
    alliance: { id: allianceId || null, name: String(allianceInfo?.name || "İttifak bilgisi alınamadı") },
    countries,
    currentTotal: unionCurrent,
    previousTotal: unionPrevious,
    previousSnapshotDate: previousSnapshot?.date || null,
    currentSnapshotDate: today,
    previousAvailable,
    fetchedAt: new Date().toISOString(),
    note: previousAvailable
      ? "Haftalık hasar, WarEra ülke sıralamasındaki son 7 günlük değerdir. Geçen hafta karşılaştırması 7 gün önceki günlük snapshot ile yapılır."
      : "Geçen hafta karşılaştırması için en az 5 günlük snapshot geçmişi gerekir; günlük ülke snapshotları mevcut hasar cron'u tarafından kaydedilir.",
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
    const neighborIds: string[] = Array.from(new Set<string>(foreignNeighbors.map((candidate: any) => String(candidate?.country || "")).filter(Boolean)));
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
  }).sort((a, b) => ({ bad: 0, warn: 1, info: 2 }[a.tone as "bad" | "warn" | "info"] - ({ bad: 0, warn: 1, info: 2 }[b.tone as "bad" | "warn" | "info"]) || (b.population || 0) - (a.population || 0)));
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

const CITIZEN_COUNTRY_FILTERS = [
  { key: "tr", label: "Türkiye", matches: (code: string, name: string) => code === "tr" || code === "tur" || name.includes("turkiye") || name.includes("turkey") },
  { key: "az", label: "Azerbaycan", matches: (code: string, name: string) => code === "az" || name.includes("azerbaycan") || name.includes("azerbaijan") },
  { key: "cm", label: "Kamerun", matches: (code: string, name: string) => code === "cm" || code === "cmr" || name.includes("kamerun") || name.includes("cameroon") },
];

function citizenCounts(rows: AnyRecord[], total = rows.length) {
  return {
    total,
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
}

async function citizensData(force = false, countryFilter = "all") {
  const [{ raw: countries }, config, dates] = await Promise.all([
    getCountries(force),
    getGameConfig(force).catch(() => ({})),
    query("gameConfig.getDates", undefined, force, 5 * 60_000).catch(() => ({})),
  ]);
  const normalizedCountries = countries.map((country) => ({
    country,
    code: String(country?.code || "").toLowerCase(),
    name: String(country?.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLowerCase(),
  }));
  const availableCountries = CITIZEN_COUNTRY_FILTERS.flatMap((filter) => {
    const match = normalizedCountries.find((item) => filter.matches(item.code, item.name))
      || (filter.key === "tr" ? normalizedCountries.find((item) => countryId(item.country) === TURKEY_ID) : undefined);
    return match ? [{ ...metricCountry(match.country), raw: match.country, key: filter.key, label: filter.label }] : [];
  });
  const requestedFilter = CITIZEN_COUNTRY_FILTERS.some((filter) => filter.key === countryFilter) ? countryFilter : "all";
  const selectedCountries = requestedFilter === "all"
    ? availableCountries
    : availableCountries.filter((country) => country.key === requestedFilter);
  if (!selectedCountries.length) throw new Error("Türkiye, Azerbaycan ve Kamerun ülke bilgileri WarEra API yanıtında bulunamadı.");

  const election = config?.election || {};
  const voteMin = Number(election.voteMinLevel || 20);
  const candidateMin = Number(election.candidateMinLevel || 15);
  const minVoteDays = Number(election.voteMinDaysSinceCitizenshipChange || 0);
  const now = Date.now();
  const countryData = await mapWithConcurrency(selectedCountries, 3, async (country) => {
    const government = await query("government.getByCountryId", { countryId: country.id }, force, 3 * 60_000).catch(() => ({}));
    const ids: string[] = [];
    const joinedAt = new Map<string, string | null>();
    let cursor: string | null = null;
    let complete = false;
    const maxPages = Math.ceil(USER_PROFILE_LIMIT / 100);
    for (let page = 0; page < maxPages; page++) {
      const input: Record<string, any> = { countryId: country.id, limit: 100 };
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
    return { country, government, ids, joinedAt, complete };
  });

  const allIds = Array.from(new Set(countryData.flatMap((item) => item.ids)));
  const rolesByCountry = countryData.map((item) => idsInRoles(item.government));
  const extraGovernmentIds = Array.from(new Set(countryData.flatMap((item, index) =>
    Array.from(rolesByCountry[index].keys()).filter((id) => !item.ids.includes(id)),
  )));
  const [profiles, extraGovernmentProfiles] = await Promise.all([
    queryBatchUsers(allIds),
    queryBatchUsers(extraGovernmentIds),
  ]);
  const profilesById = new Map<string, any>();
  profiles.forEach((profile, index) => {
    const id = String(profile?._id || profile?.id || allIds[index] || "");
    if (id && profile && typeof profile === "object") profilesById.set(id, profile);
  });
  const extraProfilesById = new Map<string, any>();
  extraGovernmentProfiles.forEach((profile, index) => {
    const id = String(profile?._id || profile?.id || extraGovernmentIds[index] || "");
    if (id && profile && typeof profile === "object") extraProfilesById.set(id, profile);
  });

  const governments = countryData.map((item, index) => {
    const rolesById = rolesByCountry[index];
    const localRows = item.ids.flatMap((id) => {
      const profile = profilesById.get(id);
      if (!profile) return [];
      const row = profileRow({ ...profile, _id: id }, item.joinedAt.get(id) || null, rolesById.get(id) || [], voteMin, minVoteDays, now);
      return [{ ...row, countryKey: item.country.key, countryName: item.country.label }];
    });
    const peopleById = new Map<string, AnyRecord>(localRows.map((row): [string, AnyRecord] => [row.id, row]));
    for (const id of rolesById.keys()) {
      const profile = extraProfilesById.get(id);
      if (profile) peopleById.set(id, { id, name: profile?.username || id.slice(0, 8), level: finite(profile?.leveling?.level), status: "Görevli", tone: "info" });
    }
    const person = (id: any, role: string) => {
      if (!id || typeof id !== "string") return null;
      const row = peopleById.get(id);
      return { id, name: row?.name || id.slice(0, 8), role, url: "https://app.warera.io/user/" + id, level: row?.level ?? null, status: row?.status || "Bilinmiyor", tone: row?.tone || "info" };
    };
    const government = item.government;
    const offices = [
      person(government?.president, "Devlet Başkanı"),
      person(government?.vicePresident, "Başkan Yardımcısı"),
      ...Object.entries(government || {}).filter(([key, value]) => key.startsWith("minOf") && typeof value === "string").map(([key, value]) => person(value, MINISTRY_NAMES[key] || key)),
    ].filter(Boolean);
    const congress = (government?.congressMembers || []).map((id: any) => person(id, "Kongre üyesi")).filter(Boolean);
    const partyId = typeof item.country.raw?.rulingParty === "string" ? item.country.raw.rulingParty : item.country.raw?.rulingParty?._id;
    const partyName = typeof item.country.raw?.rulingParty === "object" ? item.country.raw.rulingParty?.name : item.country.raw?.rulingPartyName;
    const counts = citizenCounts(localRows, item.ids.length);
    return {
      country: item.country,
      rows: localRows,
      counts,
      complete: item.complete,
      government: {
        president: offices.find((office: any) => office.role === "Devlet Başkanı") || null,
        offices,
        congress,
        party: { id: partyId || null, name: partyName || (partyId ? "Parti " + String(partyId).slice(0, 8) : "Parti bilgisi yok") },
        voters: { eligible: counts.voters, minLevel: voteMin, candidateMinLevel: candidateMin, minDaysSinceCitizenshipChange: minVoteDays },
        countdowns: countdownRows(dates, now),
      },
    };
  });
  const rows = governments.flatMap((item) => item.rows).sort((a, b) => (b.level - a.level) || String(a.name).localeCompare(b.name, "tr"));
  const countKeys = ["total", "profiled", "active", "sleeping", "inactive", "unknownStatus", "new", "soldiers", "economists", "mixed", "novices", "voters"] as const;
  const counts = Object.fromEntries(countKeys.map((key) => [key, governments.reduce((sum, item) => sum + item.counts[key], 0)]));
  const complete = governments.every((item) => item.complete);
  const activeCountry = requestedFilter === "all"
    ? governments.find((item) => item.country.key === "tr") || governments[0]
    : governments.find((item) => item.country.key === requestedFilter);
  const actions: Array<{ tone: string; text: string }> = [];
  if (!complete) actions.push({ tone: "warn", text: "Bir veya daha fazla vatandaş listesi API sayfalama sınırına ulaştı; bazı profiller eksik olabilir." });
  if (counts.inactive > 0) actions.push({ tone: counts.inactive > counts.active ? "bad" : "warn", text: counts.inactive + " vatandaş 3 günden uzun süredir giriş yapmamış görünüyor." });
  for (const item of governments) {
    for (const countdown of item.government.countdowns.filter((row: AnyRecord) => row.key.includes("Election") && row.hoursLeft <= 48)) {
      actions.push({ tone: "warn", text: item.country.label + ": " + countdown.name + " " + countdown.hoursLeft.toFixed(0) + " saat sonra; " + item.counts.voters + " uygun seçmen görünüyor." });
    }
    for (const office of item.government.offices) if (office.status === "İnaktif") actions.push({ tone: "bad", text: item.country.label + ": " + office.role + " " + office.name + " inaktif görünüyor." });
  }
  const missingProfiles = allIds.length - profilesById.size;
  const profileCount = profilesById.size;
  const publicCountries = availableCountries.map(({ raw, ...country }) => country);
  const publicGovernments = governments.map(({ country, rows: countryRows, complete: countryComplete, ...data }) => ({
    country: publicCountries.find((item) => item.key === country.key),
    rows: countryRows,
    complete: countryComplete,
    ...data,
  }));
  return {
    success: true,
    country: requestedFilter === "all"
      ? { key: "all", code: "all", name: "Türkiye · Azerbaycan · Kamerun" }
      : publicCountries.find((item) => item.key === requestedFilter),
    selectedCountry: requestedFilter,
    total: counts.total,
    complete,
    profileLimit: USER_PROFILE_LIMIT,
    counts,
    rows,
    governments: publicGovernments,
    government: publicGovernments.find((item) => item.country.key === (activeCountry?.country.key || "tr"))?.government,
    actions,
    fetchedAt: new Date().toISOString(),
    source: "user.getUsersByCountry · user.getUserLite · government.getByCountryId · gameConfig",
    note: "Asker/ekonomist sınıfı askeri ve ekonomi beceri seviyeleri karşılaştırılarak hesaplanır. Profil alınabilen kişi: " + profileCount + "/" + counts.total + ".",
    warnings: missingProfiles ? [missingProfiles + " vatandaş profil verisi alınamadı."] : [],
    countries: publicCountries,
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
      { key: "tax", label: "Gelir vergisi", value: currentTax, detail: currentTax === null ? "Veri alınamadı" : `Oyun sınırı %${maxTax}`, tone: "info" },
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

async function loadView(view: string, force: boolean, countryFilter = "all", selectedCountryIds?: string[]) {
  switch (view) {
    case "citizens": return citizensData(force, countryFilter);
    case "country-tracker": return countryTrackerData(force, selectedCountryIds);
    case "alliance-damage": return allianceDamageData(force);
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
  const allowed = new Set(["citizens", "country-tracker", "alliance-damage"]);
  if (!allowed.has(view)) return res.status(400).json({ success: false, error: "Geçersiz yönetim görünümü." });
  const force = req.query?.refresh === "true";
  const countryFilter = String(req.query?.country || "all");
  const countrySelectionProvided = req.query?.countries !== undefined;
  const selectedCountryIds = countrySelectionProvided
    ? String(req.query?.countries || "").split(",").map((id) => id.trim()).filter(Boolean)
    : undefined;
  const selectionKey = view === "citizens"
    ? countryFilter
    : view === "country-tracker"
      ? countrySelectionProvided ? (selectedCountryIds?.length ? [...selectedCountryIds].sort().join("-") : "none") : "default"
      : "all";
  const key = `nizam_management_${view}_${selectionKey}_v3`;
  const ttl = view === "citizens" ? 10 * 60_000 : view === "country-tracker" ? 30_000 : VIEW_TTL_MS;
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
    const payload = await loadView(view, force, countryFilter, selectedCountryIds);
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
