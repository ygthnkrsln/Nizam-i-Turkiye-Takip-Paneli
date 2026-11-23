import { DamageDataset, IncomeComponent } from "./types";

export interface IncomeOptions {
  fixedRewards: boolean;
  selfProduction: boolean;
  otherIncomeEnabled: boolean;
  otherDailyIncome: number;
  productionItem: string;
  taxPercent: number;
  enabledComponents?: Record<string, boolean>;
  ownCompany: boolean;
  depositBonusPercent: number;
  regionBonusPercent: number;
  productionIncomeTaxPercent: number;
}

export interface ProductionEstimate {
  code: string;
  unitsPerClick: number;
  netGoldPerClick: number;
  dailyGold: number;
  clicksPerDay: number;
}

export interface DailyIncomeEstimate {
  total: number;
  components: IncomeComponent[];
  productionOptions: ProductionEstimate[];
  selectedProduction: ProductionEstimate | null;
  clicksPerDay: number;
  missionRewardsAvailable: boolean;
}

export function effectiveDailyBudget(budget: number | string | null | undefined, dailyIncome: number, includeIncome: boolean): number {
  const parsed = typeof budget === "number" ? budget : Number(String(budget ?? "").trim());
  return Math.max(0, Number.isFinite(parsed) ? parsed : 0) + (includeIncome ? Math.max(0, Number.isFinite(dailyIncome) ? dailyIncome : 0) : 0);
}

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function price(prices: Record<string, number>, code: string, taxPercent: number): number | null {
  const value = finite(prices[code]);
  return value === null || value < 0 ? null : value * (1 + taxPercent / 100);
}

function rewardAmount(reward: any, casePrice: number | null): number {
  let amount = finite(reward?.money) || 0;
  const cases = finite(reward?.cases) || 0;
  if (cases && casePrice !== null) amount += cases * casePrice;
  return amount;
}

export function calculateDailyIncome(
  dataset: Pick<DamageDataset, "rules" | "player" | "prices">,
  options: IncomeOptions,
  economyLevels: Record<string, number> = dataset.player.economyLevels || {},
): DailyIncomeEstimate {
  const { rules, player, prices } = dataset;
  const components: IncomeComponent[] = [];
  // Mission/login cases are valued at the observed market price itself. Do
  // not add purchase tax to a reward that the player receives rather than buys.
  const casePrice = finite(prices.case1);
  const dailyReward = rules.dailyReward.money + (casePrice === null ? 0 : rules.dailyReward.case1 * casePrice);
  components.push({ id: "daily-reward", label: "Günlük giriş ödülü", amount: dailyReward, enabled: options.fixedRewards && options.enabledComponents?.["daily-reward"] !== false, source: "API" });

  const missionRewards = rules.missionRewards;
  const missionRewardsAvailable = Boolean(missionRewards && ["daily", "weekly", "monthly"].some((period) => missionRewards[period] && typeof missionRewards[period] === "object"));
  for (const [period, days] of [["daily", 1], ["weekly", 7], ["monthly", 30]] as const) {
    const reward = missionRewards?.[period];
    if (!reward || typeof reward !== "object") continue;
    const raw = rewardAmount(reward, casePrice) / days;
    components.push({ id: `mission-${period}`, label: `${period === "daily" ? "Günlük" : period === "weekly" ? "Haftalık" : "Aylık"} görev ödülü / gün`, amount: raw, enabled: options.fixedRewards && options.enabledComponents?.[`mission-${period}`] !== false, source: "API" });
  }

  const energyLevel = Number(economyLevels.energy) || 0;
  const productionLevel = Number(economyLevels.production) || 0;
  const energy = (rules.economySkills.energy?.levels?.[energyLevel]?.value || 0) + (player.economyStrategic?.energy || 0);
  const production = (rules.economySkills.production?.levels?.[productionLevel]?.value || 0) + (player.economyStrategic?.production || 0);
  // The configured action cost and the same daily regeneration convention used by the battle model determine work actions.
  const energyPerDay = energy * (24 / Math.max(1, rules.regenDividedBy));
  const clicksPerDay = Math.floor(energyPerDay / Math.max(1, rules.energyCostPerAction));
  const productionOptions = Object.entries(rules.items).flatMap(([code, item]): ProductionEstimate[] => {
    if (!options.ownCompany || !item?.isTradable) return [];
    const points = finite(item?.productionPoints);
    const outputPrice = price(prices, code, options.taxPercent);
    if (!points || points <= 0 || outputPrice === null) return [];
    const needs = item?.productionNeeds && typeof item.productionNeeds === "object" ? item.productionNeeds : {};
    let inputCost = 0;
    for (const [needCode, rawCount] of Object.entries(needs)) {
      const needPrice = price(prices, needCode, options.taxPercent);
      const count = finite(rawCount);
      if (needPrice === null || count === null || count < 0) return [];
      inputCost += needPrice * count;
    }
    const unitsPerClick = production / points;
    const bonusFactor=1+(options.depositBonusPercent+options.regionBonusPercent)/100;
    const wageTaxFactor=Math.max(0,1-options.productionIncomeTaxPercent/100);
    const netGoldPerClick = unitsPerClick * (outputPrice - inputCost) * bonusFactor * wageTaxFactor;
    return [{ code, unitsPerClick, netGoldPerClick, dailyGold: netGoldPerClick * clicksPerDay, clicksPerDay }];
  }).sort((left, right) => right.netGoldPerClick - left.netGoldPerClick || left.code.localeCompare(right.code));
  const selectedProduction = options.productionItem === "best"
    ? productionOptions.find((item) => item.netGoldPerClick > 0) || productionOptions[0] || null
    : productionOptions.find((item) => item.code === options.productionItem) || null;
  if (options.selfProduction) {
    components.push({ id: "self-production", label: `Kendi üretimi (${selectedProduction?.code || "ürün seçilmedi"})`, amount: selectedProduction?.dailyGold || 0, enabled: options.enabledComponents?.["self-production"] !== false, source: "tahmin" });
  } else if (selectedProduction) {
    components.push({ id: "self-production", label: `Kendi üretimi (${selectedProduction.code})`, amount: selectedProduction.dailyGold, enabled: false, source: "tahmin" });
  }
  components.push({ id: "other-income", label: "Diğer günlük gelir", amount: Math.max(0, finite(options.otherDailyIncome) || 0), enabled: options.otherIncomeEnabled && options.enabledComponents?.["other-income"] !== false, source: "elle" });
  const total = components.reduce((sum, component) => sum + (component.enabled ? component.amount : 0), 0);
  return { total, components, productionOptions, selectedProduction, clicksPerDay, missionRewardsAvailable };
}

export function buildEconomyIncomeTable(
  dataset: Pick<DamageDataset, "rules" | "player" | "prices">,
  options: IncomeOptions,
  maxPoints: number,
): Array<{ points: number; income: number; economySkills: Record<string, number> }> {
  const rules = dataset.rules;
  const current = dataset.player.economyLevels || {};
  const fixedLevels = { companies: Number(current.companies) || 0, management: Number(current.management) || 0 };
  const fixedCost = ["companies", "management"].reduce((sum, skill) => sum + (rules.economySkills[skill]?.levels?.[fixedLevels[skill]]?.totalCost || 0), 0);
  const levelsByChoice: Record<string, Record<number, number>> = {};
  for (const skill of ["energy", "production"]) {
    const skillRules = rules.economySkills[skill]?.levels || {};
    levelsByChoice[skill] = Object.keys(skillRules).map(Number).filter((level) => Number.isFinite(level)).sort((a, b) => a - b).reduce((all, level) => ({ ...all, [level]: skillRules[level].totalCost }), {} as Record<number, number>);
  }
  const maxEnergy = Math.max(0, ...Object.keys(levelsByChoice.energy || {}).map(Number));
  const maxProduction = Math.max(0, ...Object.keys(levelsByChoice.production || {}).map(Number));
  const combos: Array<{ cost: number; levels: Record<string, number>; income: number }> = [];
  for (let energy = 0; energy <= maxEnergy; energy++) for (let production = 0; production <= maxProduction; production++) {
    const cost = fixedCost + (levelsByChoice.energy[energy] ?? Infinity) + (levelsByChoice.production[production] ?? Infinity);
    const economySkills = { ...fixedLevels, energy, production };
    const income = calculateDailyIncome(dataset, options, economySkills).total;
    combos.push({ cost, levels: economySkills, income });
  }
  let best: { income: number; economySkills: Record<string, number> } = { income: Number.NEGATIVE_INFINITY, economySkills: { ...fixedLevels, energy: 0, production: 0 } };
  return Array.from({ length: Math.max(0, Math.floor(maxPoints)) + 1 }, (_, points) => {
    for (const combo of combos) if (combo.cost <= points && combo.income > best.income) best = { income: combo.income, economySkills: combo.levels };
    return { points, income: Number.isFinite(best.income) ? best.income : calculateDailyIncome(dataset, options, best.economySkills).total, economySkills: { ...best.economySkills } };
  });
}
