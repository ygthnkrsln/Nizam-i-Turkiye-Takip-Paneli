import { buildRules, unwrapTrpc } from "../../lib/damage/rules.js";

const EQUIPMENT_SLOTS: Record<string, string> = {
  weapon: "weapon", knife: "weapon", gun: "weapon", pistol: "weapon", rifle: "weapon", sniper: "weapon", tank: "weapon", jet: "weapon",
  helmet: "helmet", kask: "helmet", chest: "chest", "göğüslük": "chest", pants: "pants", pantolon: "pants", boots: "boots", bot: "boots", gloves: "gloves", eldiven: "gloves",
};
const WEAPON_QUALITY: Record<string, number> = { knife: 1, gun: 2, rifle: 3, sniper: 4, tank: 5, jet: 6 };
const SLOT_STAT: Record<string, string> = { weapon: "attack", helmet: "criticalDamages", chest: "armor", pants: "armor", boots: "dodge", gloves: "precision" };
const SKILLS = ["attack", "precision", "criticalChance", "criticalDamages", "armor", "dodge", "health", "hunger", "lootChance", "energy", "production", "companies", "management"];
const PRICE_KEYS = ["lightAmmo", "ammo", "heavyAmmo", "bread", "steak", "cookedFish", "cocain", "case1", "case2", "scraps"];

function normalizeSlot(name: unknown): string | null {
  const value = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("tr").trim();
  if (/\b(bot|boots?)\b/.test(value)) return "boots";
  if (/\b(eldiven|gloves?)\b/.test(value)) return "gloves";
  if (/\b(kask|helmet)\b/.test(value)) return "helmet";
  if (/\b(pantolon|pants?)\b/.test(value)) return "pants";
  if (/\b(gogusluk|gogus zirhi|chest)\b/.test(value)) return "chest";
  if (/\b(knife|bicak)\b/.test(value)) return "knife";
  if (/\b(gun|pistol|tabanca)\b/.test(value)) return "gun";
  if (/\b(sniper|keskin nisanci)\b/.test(value)) return "sniper";
  if (/\b(rifle|tufek)\b/.test(value)) return "rifle";
  if (/\btank\b/.test(value)) return "tank";
  if (/\bjet\b/.test(value)) return "jet";
  for (const [key, slot] of Object.entries(EQUIPMENT_SLOTS)) if (value.includes(key)) return slot === "weapon" ? key : slot;
  return null;
}

function qualityFor(config: any, code: string, stat: number): number {
  const fixed = WEAPON_QUALITY[code];
  if (fixed) return fixed;
  const slot = code;
  const statName = SLOT_STAT[slot];
  for (let quality = 1; quality <= 6; quality++) {
    const range = config?.items?.[`${slot}${quality}`]?.dynamicStats?.[statName];
    const min = Array.isArray(range) ? Number(range[0]) : Number(range?.min);
    const max = Array.isArray(range) ? Number(range[1]) : Number(range?.max);
    if (Number.isFinite(min) && Number.isFinite(max) && stat >= min && stat <= max) return quality;
  }
  return 1;
}

function toGearRows(config: any, rows: any[]) {
  const options: any[] = [];
  const items: Record<string, any> = {};
  for (const row of rows) {
    if (row?.cautious_price == null) continue;
    const normalized = normalizeSlot(row.equipment_name);
    if (!normalized) continue;
    const slot = WEAPON_QUALITY[normalized] ? "weapon" : normalized;
    const quality = qualityFor(config, slot === "weapon" ? normalized : slot, Number(row.main_stat));
    const code = slot === "weapon" ? normalized : `${slot}${quality}`;
    const stats = slot === "weapon" ? [Number(row.main_stat) || 0, Number(row.critical_chance) || 0] : [Number(row.main_stat) || 0];
    const item = { slot, quality, stats };
    items[code] = item;
    options.push({ ...item, code, median: Number(row.cautious_price), sales: 1, window: "Supabase price_data", updatedAt: row.updated_at || null });
  }
  return { options, items };
}

export function buildReferenceMarket(configInput: any, priceInput: any, equipmentRows: any[]) {
  const config = unwrapTrpc<any>(configInput) || {};
  // Use the same reward mapping as the app's damage rules. gameConfig nests
  // login rewards under user and mission rewards by period; treating the
  // latter as a flat { money, case1 } object silently dropped its case income.
  const appRules = buildRules(config);
  const prices = unwrapTrpc<Record<string, number>>(priceInput) || {};
  const values: Record<string, number[]> = {};
  const costs: Record<string, number[]> = {};
  const unlock: Record<string, number> = {};
  for (const skill of SKILLS) {
    const levels = config.skills?.[skill]?.levels || {};
    const max = Math.max(10, ...Object.keys(levels).map(Number));
    values[skill] = Array.from({ length: max + 1 }, (_, level) => Number(levels[level]?.value) || 0);
    costs[skill] = Array.from({ length: max + 1 }, (_, level) => Number(levels[level]?.totalCost ?? levels[level]?.cost) || 0);
    unlock[skill] = Number(levels[1]?.unlockAtLevel) || 1;
  }
  const ammoBonus = Object.fromEntries(["lightAmmo", "ammo", "heavyAmmo"].map((code) => [code, (Number(config.items?.[code]?.flatStats?.percentAttack) || 0) / 100]));
  const rules = {
    values, costs, unlock,
    precisionOverflow: Number(config.skills?.precision?.skillOverflowValue) || 0,
    critOverflow: Number(config.skills?.criticalChance?.skillOverflowValue) || 0,
    ammoBonus,
    pillBonus: (Number(config.items?.cocain?.flatStats?.percentAttack) || 0) / 100,
    foodHealth: Object.fromEntries(["bread", "steak", "cookedFish"].map((code) => [code, (Number(config.items?.[code]?.flatStats?.healthRegenPercent) || 0) / 100])),
    items: config.items || {},
  };
  const gear = toGearRows(config, equipmentRows);
  const itemPrices = Object.fromEntries(PRICE_KEYS.map((key) => [key, Number(prices[key]) || 0]));
  const engineSteel = config.upgradesConfig?.automatedEngine?.levels || {};
  const engines: Record<number, [number, number]> = { 0: [0, 0] };
  for (let level = 1; level <= 7; level++) {
    engines[level] = [level * 24, Number(engineSteel[level]?.steelCost) || 0];
  }
  const itemValues: Record<string, any> = {};
  for (const [code, item] of Object.entries(config.items || {}) as [string, any][]) {
    const price = Number(prices[code]) || 0;
    const needs = item.productionNeeds || {};
    const inputCost = Object.entries(needs).reduce((sum, [input, quantity]) => sum + (Number(prices[input]) || 0) * Number(quantity || 0), 0);
    const pp = Number(item.productionPoints) || 0;
    itemValues[code] = { ...item, price, value_per_pp: pp > 0 ? (price - inputCost) / pp : 0, raw: !Object.keys(needs).length };
  }
  const missionReward = appRules.missionRewards || {};
  const missionPeriods = [
    ["daily", 1],
    ["weekly", 7],
    ["monthly", 30],
  ] as const;
  const hasPeriodRewards = missionPeriods.some(([period]) =>
    missionReward[period] && typeof missionReward[period] === "object",
  );
  const missionIncome = hasPeriodRewards
    ? missionPeriods.reduce(
        (total, [period, days]) => {
          const reward = missionReward[period];
          if (!reward || typeof reward !== "object") return total;
          return [
            total[0] + (Number(reward.money) || 0) / days,
            total[1] + (Number(reward.case1 ?? reward.cases) || 0) / days,
          ];
        },
        [0, 0],
      )
    : [Number(missionReward.money) || 0, Number(missionReward.case1 ?? missionReward.cases) || 0];
  const dailyReward = appRules.dailyReward;
  const gearsUpdated = equipmentRows.map((row) => row.updated_at).filter(Boolean).sort().at(-1) || null;
  return {
    rules,
    options: gear.options,
    items: gear.items,
    prices: itemPrices,
    engines,
    missions: missionIncome,
    dailyReward: [Number(dailyReward.money) || 0, Number(dailyReward.case1) || 0],
    pool: [], poolInfo: { mix: [] }, curve: [-500, -250, 0, 100, 250, 500, 1000, 2500, 5000],
    managerPayNow: 0,
    resetCost: Number(config.user?.resetSkillsCostPerPoint) || 0,
    steelPrice: Number(prices.steel) || 0,
    equipmentUpdatedAt: gearsUpdated,
    values: { updated: new Date().toISOString(), price_hours: 0, items: itemValues, engine_daily_pp: Object.fromEntries(Object.entries(engines).map(([level, row]) => [level, row[0]])), energy_per_click: Number(config.user?.energyCostPerAction) || 10, scraps_price: Number(prices.scraps) || 0 },
    sourceInfo: {
      equipment: "Supabase · price_data",
      prices: "WarEra · itemTrading.getPrices",
      rules: "WarEra · gameConfig.getGameConfig",
      engineUpgradeCostsAvailable: Object.keys(engineSteel).length > 0,
      missionsAvailable: hasPeriodRewards || Boolean(missionIncome[0] || missionIncome[1]),
      dailyRewardAvailable: Boolean(dailyReward.money || dailyReward.case1),
      poolAvailable: false,
    },
  };
}
