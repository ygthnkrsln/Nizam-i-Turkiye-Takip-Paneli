export type MissionKey = "daily" | "weekly" | "monthly";

export const MISSION_XP: Record<MissionKey, number> = {
  daily: 200,
  weekly: 1000,
  monthly: 2000,
};

export const MISSION_LABELS: Record<MissionKey, string> = {
  daily: "Günlük görev",
  weekly: "Haftalık görev",
  monthly: "Aylık görev",
};

export function xpRequiredForLevel(level: number): number {
  if (level >= 2 && level <= 4) return 100;
  if (level >= 5 && level <= 7) return 200;
  if (level === 8) return 300;
  if (level === 9) return 400;
  if (level >= 10 && level <= 24) return (level - 5) * 100;
  if (level >= 25 && level <= 30) return 2000;
  if (level >= 31 && level <= 40) return 2500;
  if (level >= 41 && level <= 50) return 3000;
  return 0;
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let target = 2; target <= Math.min(50, Math.floor(level)); target++) {
    total += xpRequiredForLevel(target);
  }
  return total;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < 50 && xp >= totalXpForLevel(level + 1)) level++;
  return level;
}

export function prestigeXpMultiplier(prestigeLevel: number): number {
  return prestigeLevel > 0 ? 1.5 + (prestigeLevel - 1) * 0.1 : 1;
}

export interface LevelMilestone {
  level: number;
  requiredXp: number;
  date: Date | null;
  status: "reached" | "current" | "projected";
}

export interface YearlyProjection {
  earnedPrestiges: number;
  endingPrestigeLevel: number;
  endingLevel: number;
  levelsGained: number;
}

function recurringMissionXp(date: Date): number {
  let reward = MISSION_XP.daily;
  if (date.getUTCDay() === 1) reward += MISSION_XP.weekly;
  if (date.getUTCDate() === 1) reward += MISSION_XP.monthly;
  return reward;
}

export function simulateLevelMilestones(
  currentXp: number,
  currentLevel: number,
  prestigeLevel: number,
  remainingXp: Record<MissionKey, number>,
  startDate = new Date(),
): LevelMilestone[] {
  const safeXp = Math.max(0, Number.isFinite(currentXp) ? currentXp : 0);
  const derivedLevel = levelForXp(safeXp);
  const effectiveLevel = Math.max(1, Math.min(50, Math.max(derivedLevel, Math.min(currentLevel, 50))));
  const milestoneDates = new Map<number, Date>();
  const multiplier = prestigeXpMultiplier(prestigeLevel);
  let simulatedXp = safeXp;
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));

  const addXp = (rawXp: number, date: Date) => {
    const previousLevel = levelForXp(simulatedXp);
    simulatedXp += rawXp * multiplier;
    const nextLevel = levelForXp(simulatedXp);
    for (let level = Math.max(effectiveLevel + 1, previousLevel + 1); level <= nextLevel; level++) {
      milestoneDates.set(level, new Date(date));
    }
  };

  addXp(
    (remainingXp.daily || 0) + (remainingXp.weekly || 0) + (remainingXp.monthly || 0),
    cursor,
  );

  // Future recurring mission rewards are added on their UTC reset dates.
  for (let day = 1; day <= 3650 && simulatedXp < totalXpForLevel(50); day++) {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1));
    addXp(recurringMissionXp(cursor), cursor);
  }

  return Array.from({ length: 50 }, (_, index) => {
    const level = index + 1;
    const status: LevelMilestone["status"] = level < effectiveLevel
      ? "reached"
      : level === effectiveLevel
        ? "current"
        : "projected";
    return {
      level,
      requiredXp: totalXpForLevel(level),
      date: level > effectiveLevel ? milestoneDates.get(level) || null : null,
      status,
    };
  });
}

export function simulateYearlyProgression(
  currentXp: number,
  prestigeLevel: number,
  remainingXp: Record<MissionKey, number>,
  startDate = new Date(),
): YearlyProjection {
  let xp = Math.max(0, Number.isFinite(currentXp) ? currentXp : 0);
  let prestige = Math.max(0, Math.floor(prestigeLevel));
  let earnedPrestiges = 0;
  let levelsGained = 0;
  const startLevel = levelForXp(xp);
  let previousLevel = startLevel;
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));

  const applyXp = (rawXp: number) => {
    xp += rawXp * prestigeXpMultiplier(prestige);
    let level = levelForXp(xp);
    while (level >= 50) {
      levelsGained += Math.max(0, 50 - previousLevel);
      const overflow = Math.max(0, xp - totalXpForLevel(50));
      earnedPrestiges++;
      prestige++;
      xp = totalXpForLevel(25) + overflow;
      previousLevel = 25;
      level = levelForXp(xp);
    }
    levelsGained += Math.max(0, level - previousLevel);
    previousLevel = level;
  };

  applyXp((remainingXp.daily || 0) + (remainingXp.weekly || 0) + (remainingXp.monthly || 0));
  for (let day = 1; day <= 365; day++) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day));
    applyXp(recurringMissionXp(date));
  }

  return {
    earnedPrestiges,
    endingPrestigeLevel: prestige,
    endingLevel: levelForXp(xp),
    levelsGained,
  };
}
