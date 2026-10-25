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
