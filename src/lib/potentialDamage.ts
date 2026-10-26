import { calculatePrestigeAdjustedDamage } from "../utils/prestigeOptimizer.js";

const ECONOMY_SKILLS = [
  "entrepreneurship",
  "energy",
  "stamina",
  "production",
  "companies",
  "management",
];

function clampRatio(current: unknown, maximum: unknown): number {
  const max = Number(maximum);
  const value = Number(current);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / max));
}

export function isCombatBuild(user: any): boolean {
  const skills = user?.skills || {};
  const economySkillPoints = ECONOMY_SKILLS.reduce((sum, key) => {
    const level = Number(skills?.[key]?.level || 0);
    return sum + (Number.isFinite(level) && level > 0 ? (level * (level + 1)) / 2 : 0);
  }, 0);
  const declaredTotal = Number(user?.leveling?.spentSkillPoints ?? user?.leveling?.totalSkillPoints ?? 0);
  const totalSkillPoints = declaredTotal > 0 ? declaredTotal : Math.max(1, economySkillPoints);
  return economySkillPoints <= totalSkillPoints / 2;
}

/** Uses the prestige optimizer's level damage curve and prestige bonus, scaled to current readiness. */
export function calculatePotentialDamage(
  level: unknown,
  healthCurrent: unknown,
  healthMax: unknown,
  hungerCurrent: unknown,
  hungerMax: unknown,
  isFighter: boolean,
  prestigeLevel: unknown = 0,
): number {
  const playerLevel = Number(level);
  if (!isFighter || !Number.isFinite(playerLevel) || playerLevel < 1) return 0;

  const rawPrestige = Number(prestigeLevel);
  const safePrestige = Number.isFinite(rawPrestige) ? Math.max(0, rawPrestige) : 0;
  const optimizerDamage = calculatePrestigeAdjustedDamage(playerLevel, safePrestige);
  const healthRatio = clampRatio(healthCurrent, healthMax);
  const maxFood = Number(hungerMax);
  const foodCapacity = Number.isFinite(maxFood) && maxFood > 0 ? maxFood : 0;
  const currentFood = Number(hungerCurrent);
  const foodCount = Number.isFinite(currentFood)
    ? Math.min(foodCapacity, Math.max(0, currentFood))
    : 0;
  // Each available meal adds 20% of a health bar; full health plus all food
  // is the 100% baseline used to scale the prestige optimizer's damage curve.
  const availableHealthEquivalent = healthRatio + foodCount * 0.2;
  const fullReadinessHealthEquivalent = 1 + foodCapacity * 0.2;
  const readiness = fullReadinessHealthEquivalent > 0
    ? Math.min(1, availableHealthEquivalent / fullReadinessHealthEquivalent)
    : healthRatio;
  return Math.round(optimizerDamage * readiness);
}
