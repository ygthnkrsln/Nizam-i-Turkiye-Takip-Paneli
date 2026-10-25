import { MissionKey, MISSION_XP, prestigeXpMultiplier, xpRequiredForLevel } from "./levelProgression";

export interface LevelDamageRate {
  level: number;
  dailyDamage: number;
}

export interface PrestigeOptimizerSettings {
  damageTiming: "start_of_day" | "end_of_day";
  prestigeDamageBonusPercent: number;
  pauseXpBonusAtMaxLevel: boolean;
  carryoverExcessXp: boolean;
  accumulatedXpThreshold: number;
  rounding: "round" | "floor" | "ceil";
}

export interface PrestigeOptimizerInput {
  startDate: Date;
  currentLevel: number;
  currentXpInLevel: number;
  currentPrestige: number;
  availableMissionXp: Record<MissionKey, number>;
  damageRates: LevelDamageRate[];
  settings: PrestigeOptimizerSettings;
  simulationDays?: number;
}

export interface StrategyDay {
  dayIndex: number;
  date: Date;
  startLevel: number;
  startPrestige: number;
  endLevel: number;
  endPrestige: number;
  startXpInLevel: number;
  endXpInLevel: number;
  baseXp: number;
  earnedXp: number;
  dailyDamage: number;
  cumulativeDamage: number;
  prestigeTriggered: boolean;
  notes: string[];
}

export type PrestigeTimelineEvent =
  | { type: "period"; prestige: number; date: Date | null; resetLevel: number }
  | { type: "level"; level: number; date: Date | null; current?: boolean }
  | { type: "prestige"; prestige: number; date: Date; resetLevel: number };

export interface PrestigeStrategyResult {
  id: "immediate" | "month-end" | "accumulated-xp";
  name: string;
  description: string;
  color: string;
  startLevel: number;
  endLevel: number;
  startPrestige: number;
  endPrestige: number;
  prestigesPerformed: number;
  totalLevelUps: number;
  daysAtMaxLevel: number;
  firstMaxLevelDate: Date | null;
  totalBaseXp: number;
  totalEarnedXp: number;
  totalDamage: number;
  averageDailyDamage: number;
  prestigeDates: { prestige: number; date: Date; dayIndex: number }[];
  timeline: PrestigeTimelineEvent[];
  days: StrategyDay[];
}

export const DEFAULT_LEVEL_DAMAGE: LevelDamageRate[] = [
  [25, 600_000], [26, 640_000], [27, 680_000], [28, 720_000], [29, 760_000], [30, 800_000],
  [31, 840_000], [32, 900_000], [33, 960_000], [34, 1_020_000], [35, 1_080_000],
  [36, 1_140_000], [37, 1_200_000], [38, 1_260_000], [39, 1_300_000], [40, 1_390_000],
  [41, 1_450_000], [42, 1_510_000], [43, 1_580_000], [44, 1_660_000], [45, 1_740_000],
  [46, 1_820_000], [47, 1_900_000], [48, 1_990_000], [49, 2_100_000], [50, 2_200_000],
].map(([level, dailyDamage]) => ({ level: Number(level), dailyDamage: Number(dailyDamage) }));

export const DEFAULT_OPTIMIZER_SETTINGS: PrestigeOptimizerSettings = {
  damageTiming: "start_of_day",
  prestigeDamageBonusPercent: 20,
  pauseXpBonusAtMaxLevel: true,
  carryoverExcessXp: true,
  accumulatedXpThreshold: 65_000,
  rounding: "round",
};

const STRATEGIES = [
  {
    id: "immediate" as const,
    name: "Hemen prestij",
    description: "50. seviyeye ulaştığı gün prestij yapar; kalan XP yeni döngüye taşınır.",
    color: "#22d3ee",
    holdWeeklyMonthly: false,
  },
  {
    id: "month-end" as const,
    name: "Ay sonunda prestij",
    description: "50. seviyede ay sonuna kadar kalır; haftalık ve aylık görev XP’sini prestij sonrasına saklar.",
    color: "#a78bfa",
    holdWeeklyMonthly: true,
  },
  {
    id: "accumulated-xp" as const,
    name: "XP biriktirerek prestij",
    description: "50. seviyede belirlenen XP eşiğine kadar bekler, ardından taşan XP ile yeni seviyeleri açar.",
    color: "#34d399",
    holdWeeklyMonthly: false,
  },
];

function roundXp(value: number, method: PrestigeOptimizerSettings["rounding"]): number {
  if (method === "floor") return Math.floor(value);
  if (method === "ceil") return Math.ceil(value);
  return Math.round(value);
}

function xpMultiplier(prestige: number, settings: PrestigeOptimizerSettings): number {
  return prestigeXpMultiplier(prestige);
}

function levelXpToAdvance(level: number): number {
  return xpRequiredForLevel(Math.min(50, level + 1));
}

function xpForDate(date: Date, dayIndex: number, available: Record<MissionKey, number>): Record<MissionKey, number> {
  if (dayIndex === 0) return available;
  return {
    daily: MISSION_XP.daily,
    weekly: date.getUTCDay() === 1 ? MISSION_XP.weekly : 0,
    monthly: date.getUTCDate() === 1 ? MISSION_XP.monthly : 0,
  };
}

function lastDayOfMonth(date: Date): boolean {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).getUTCDate() === 1;
}

function damageRate(level: number, rates: LevelDamageRate[]): number {
  const sorted = [...rates].sort((a, b) => a.level - b.level);
  if (sorted.length === 0) return 0;
  const exact = sorted.find((row) => row.level === level);
  if (exact) return Math.max(0, exact.dailyDamage);
  if (level < sorted[0].level) return Math.max(0, sorted[0].dailyDamage);
  if (level > sorted[sorted.length - 1].level) return Math.max(0, sorted[sorted.length - 1].dailyDamage);
  return Math.max(0, sorted.filter((row) => row.level <= level).at(-1)?.dailyDamage || 0);
}

function nextUtcDate(start: Date, dayIndex: number): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + dayIndex));
}

export function simulatePrestigeOptimization(input: PrestigeOptimizerInput): PrestigeStrategyResult[] {
  return STRATEGIES.map((strategy) => {
    let level = Math.max(1, Math.min(50, Math.floor(input.currentLevel)));
    let prestige = Math.max(0, Math.floor(input.currentPrestige));
    let xpInLevel = Math.max(0, input.currentXpInLevel);
    let heldWeeklyXp = 0;
    let heldMonthlyXp = 0;
    let cumulativeDamage = 0;
    let totalBaseXp = 0;
    let totalEarnedXp = 0;
    let totalLevelUps = 0;
    let daysAtMaxLevel = 0;
    let firstMaxLevelDate: Date | null = null;
    const prestigeDates: PrestigeStrategyResult["prestigeDates"] = [];
    const timeline: PrestigeTimelineEvent[] = [
      { type: "period", prestige, date: null, resetLevel: level },
      { type: "level", level, date: null, current: true },
    ];
    const days: StrategyDay[] = [];
    const horizon = Math.max(1, Math.min(365, Math.floor(input.simulationDays || 365)));

    for (let dayIndex = 0; dayIndex < horizon; dayIndex++) {
      const date = nextUtcDate(input.startDate, dayIndex);
      const startLevel = level;
      const startPrestige = prestige;
      const startXpInLevel = xpInLevel;
      const notes: string[] = [];
      if (startLevel >= 50) {
        daysAtMaxLevel++;
        if (!firstMaxLevelDate) firstMaxLevelDate = new Date(date);
      }

      const missionXp = xpForDate(date, dayIndex, input.availableMissionXp);
      const dailyXp = missionXp.daily;
      let weeklyXp = missionXp.weekly;
      let monthlyXp = missionXp.monthly;
      let heldXpClaimedToday = 0;
      let heldEarnedToday = 0;
      if (strategy.holdWeeklyMonthly && startLevel >= 50) {
        heldWeeklyXp += weeklyXp;
        heldMonthlyXp += monthlyXp;
        if (weeklyXp) notes.push(`${weeklyXp.toLocaleString("tr-TR")} haftalık XP prestij için saklandı`);
        if (monthlyXp) notes.push(`${monthlyXp.toLocaleString("tr-TR")} aylık XP prestij için saklandı`);
        weeklyXp = 0;
        monthlyXp = 0;
      }

      const baseXp = dailyXp + weeklyXp + monthlyXp;
      const isAtMaxAtStart = level >= 50;
      const bonusPaused = isAtMaxAtStart && input.settings.pauseXpBonusAtMaxLevel;
      const appliedXp = roundXp(
        baseXp * (bonusPaused ? 1 : xpMultiplier(prestige, input.settings)),
        input.settings.rounding,
      );
      xpInLevel += appliedXp;
      totalBaseXp += baseXp;
      totalEarnedXp += appliedXp;
      if (baseXp > 0) notes.push(`${baseXp.toLocaleString("tr-TR")} temel XP → ${appliedXp.toLocaleString("tr-TR")} XP`);

      const awardLevelUps = () => {
        while (level < 50) {
          const required = levelXpToAdvance(level);
          if (required <= 0 || xpInLevel < required) break;
          xpInLevel -= required;
          level++;
          totalLevelUps++;
          timeline.push({ type: "level", level, date: new Date(date) });
          notes.push(`Seviye ${level} olundu`);
        }
      };
      awardLevelUps();

      let shouldPrestige = false;
      if (level >= 50) {
        if (strategy.id === "immediate") shouldPrestige = true;
        if (strategy.id === "month-end" && lastDayOfMonth(date)) shouldPrestige = true;
        if (strategy.id === "accumulated-xp" && xpInLevel >= input.settings.accumulatedXpThreshold) shouldPrestige = true;
      }

      if (shouldPrestige) {
        const nextPrestige = prestige + 1;
        prestige = nextPrestige;
        prestigeDates.push({ prestige, date: new Date(date), dayIndex: dayIndex + 1 });
        timeline.push({ type: "prestige", prestige, date: new Date(date), resetLevel: 25 });
        notes.push(`Prestij ${prestige}: seviye 25'e dönüldü`);
        level = 25;
        if (!input.settings.carryoverExcessXp) xpInLevel = 0;

        const heldBaseXp = heldWeeklyXp + heldMonthlyXp;
        if (heldBaseXp > 0) {
          const heldEarnedXp = roundXp(heldBaseXp * xpMultiplier(prestige, input.settings), input.settings.rounding);
          xpInLevel += heldEarnedXp;
          heldXpClaimedToday = heldBaseXp;
          heldEarnedToday = heldEarnedXp;
          totalBaseXp += heldBaseXp;
          totalEarnedXp += heldEarnedXp;
          notes.push(`${heldBaseXp.toLocaleString("tr-TR")} bekletilen görev XP'si yeni bonusla açıldı`);
          heldWeeklyXp = 0;
          heldMonthlyXp = 0;
        }
        awardLevelUps();
      }

      if (level >= 50 && !firstMaxLevelDate) firstMaxLevelDate = new Date(date);
      const damageLevel = input.settings.damageTiming === "start_of_day" ? startLevel : level;
      const damagePrestige = input.settings.damageTiming === "start_of_day" ? startPrestige : prestige;
      const dailyDamage = Math.round(
        damageRate(damageLevel, input.damageRates) * (1 + damagePrestige * input.settings.prestigeDamageBonusPercent / 100),
      );
      cumulativeDamage += dailyDamage;
      days.push({
        dayIndex: dayIndex + 1,
        date,
        startLevel,
        startPrestige,
        endLevel: level,
        endPrestige: prestige,
        startXpInLevel,
        endXpInLevel: xpInLevel,
        baseXp: baseXp + heldXpClaimedToday,
        earnedXp: appliedXp + heldEarnedToday,
        dailyDamage,
        cumulativeDamage,
        prestigeTriggered: shouldPrestige,
        notes,
      });
    }

    return {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      color: strategy.color,
      startLevel: Math.max(1, Math.min(50, Math.floor(input.currentLevel))),
      endLevel: level,
      startPrestige: Math.max(0, Math.floor(input.currentPrestige)),
      endPrestige: prestige,
      prestigesPerformed: prestigeDates.length,
      totalLevelUps,
      daysAtMaxLevel,
      firstMaxLevelDate,
      totalBaseXp,
      totalEarnedXp,
      totalDamage: cumulativeDamage,
      averageDailyDamage: cumulativeDamage / horizon,
      prestigeDates,
      timeline,
      days,
    };
  });
}
