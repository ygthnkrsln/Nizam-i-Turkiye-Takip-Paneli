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

export type YearlyTimelineEvent =
  | { type: "period"; prestigeLevel: number; date: Date | null; resetLevel: number }
  | { type: "level"; level: number; date: Date | null; current?: boolean };

export interface YearlyTimeline {
  events: YearlyTimelineEvent[];
  earnedPrestiges: number;
  endingPrestigeLevel: number;
  endingLevel: number;
}

function recurringMissionXp(date: Date): number {
  let reward = MISSION_XP.daily;
  if (date.getUTCDay() === 1) reward += MISSION_XP.weekly;
  if (date.getUTCDate() === 1) reward += MISSION_XP.monthly;
  return reward;
}

export function simulateYearlyTimeline(
  currentXp: number,
  currentLevel: number,
  prestigeLevel: number,
  remainingXp: Record<MissionKey, number>,
  startDate = new Date(),
): YearlyTimeline {
  let xp = Math.max(0, Number.isFinite(currentXp) ? currentXp : 0);
  let prestige = Math.max(0, Math.floor(prestigeLevel));
  let earnedPrestiges = 0;
  const startLevel = Math.max(1, Math.min(50, Math.floor(currentLevel || levelForXp(xp))));
  const events: YearlyTimelineEvent[] = [
    { type: "period", prestigeLevel: prestige, date: null, resetLevel: startLevel },
    { type: "level", level: startLevel, date: null, current: true },
  ];
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));

  const applyXp = (rawXp: number, date: Date) => {
    const previousLevel = levelForXp(xp);
    xp += rawXp * prestigeXpMultiplier(prestige);
    let level = levelForXp(xp);
    for (let reached = Math.max(previousLevel + 1, 2); reached <= Math.min(level, 50); reached++) {
      events.push({ type: "level", level: reached, date: new Date(date) });
    }
    while (level >= 50) {
      const overflow = Math.max(0, xp - totalXpForLevel(50));
      earnedPrestiges++;
      prestige++;
      xp = totalXpForLevel(25) + overflow;
      events.push({ type: "period", prestigeLevel: prestige, date: new Date(date), resetLevel: 25 });
      level = levelForXp(xp);
      for (let reached = 26; reached <= Math.min(level, 50); reached++) {
        events.push({ type: "level", level: reached, date: new Date(date) });
      }
    }
  };

  applyXp((remainingXp.daily || 0) + (remainingXp.weekly || 0) + (remainingXp.monthly || 0), start);
  for (let day = 1; day <= 365; day++) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day));
    applyXp(recurringMissionXp(date), date);
  }

  return {
    events,
    earnedPrestiges,
    endingPrestigeLevel: prestige,
    endingLevel: levelForXp(xp),
  };
}
