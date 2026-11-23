import { calculateDailyIncome, buildEconomyIncomeTable, IncomeOptions } from "./income";
import { compareBuilds, optimizeDamageSteps } from "./optimizer";
import { BuildResult, DamageDataset, OptimizerOptions } from "./types";

function betterResult(candidate: BuildResult, best: BuildResult | null, options: OptimizerOptions, income: number): boolean {
  if (!best) return true;
  if (options.goal === "target") {
    const candidateReached = candidate.damage >= options.targetDamage;
    const bestReached = best.damage >= options.targetDamage;
    if (candidateReached !== bestReached) return candidateReached;
    return candidateReached ? candidate.cost < best.cost : candidate.damage > best.damage;
  }
  const budget = options.goal === "unlimited" ? Number.POSITIVE_INFINITY : options.budget + (options.includeIncomeInBudget ? income : 0);
  return compareBuilds(candidate, best, budget) > 0;
}

export function* optimizeDamageWithIncomeSteps(
  data: DamageDataset,
  options: OptimizerOptions,
  incomeOptions: IncomeOptions,
  isCancelled: () => boolean = () => false,
): Generator<number, BuildResult, void> {
  if (!options.includeEconomyPoints) {
    const estimate = calculateDailyIncome(data, incomeOptions);
    const effectiveIncome = options.includeIncomeInBudget ? estimate.total : 0;
    const iterator = optimizeDamageSteps(data, { ...options, income: effectiveIncome }, isCancelled);
    let lastProgress = 0;
    while (true) {
      if (isCancelled()) throw new Error("Hesaplama iptal edildi.");
      const next = iterator.next();
      if (next.done) return { ...next.value, dailyIncome: estimate.total, incomeBreakdown: estimate.components, economySkills: { ...(data.player.economyLevels || {}) } };
      lastProgress = next.value as number;
      yield lastProgress;
    }
  }

  const maxPoints = Math.max(0, Math.floor(data.player.totalPoints - Number(data.player.ignoredSpentPoints || 0)));
  const table = buildEconomyIncomeTable(data, incomeOptions, maxPoints);
  const currentEconomyPoints = Number(data.player.economySpentPoints) || 0;
  const fixedEconomyPoints = ["companies", "management"].reduce((sum, skill) => {
    const level = Number(data.player.economyLevels?.[skill]) || 0;
    return sum + (data.rules.economySkills[skill]?.levels?.[level]?.totalCost || 0);
  }, 0);
  const step = maxPoints <= 60 ? 1 : Math.ceil(maxPoints / 60);
  const pointSteps = new Set<number>();
  for (let points = Math.min(fixedEconomyPoints, maxPoints); points <= maxPoints; points += step) pointSteps.add(points);
  pointSteps.add(Math.max(fixedEconomyPoints, Math.min(maxPoints, Math.round(currentEconomyPoints))));
  pointSteps.add(maxPoints);
  const steps = Array.from(pointSteps).sort((a, b) => a - b);
  const deadline = Date.now() + Math.max(100, options.timeLimitMs);
  let best: BuildResult | null = null;
  let completed = 0;
  let capped = false;

  for (const points of steps) {
    if (isCancelled()) throw new Error("Hesaplama iptal edildi.");
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) { capped = true; break; }
    const economy = table[points];
    const estimate = calculateDailyIncome(data, incomeOptions, economy.economySkills);
    const innerDataset: DamageDataset = {
      ...data,
      player: {
        ...data.player,
        totalPoints: Math.max(0, data.player.totalPoints - points),
        economySpentPoints: 0,
      },
    };
    const perStepTime = Math.max(50, Math.floor(remainingMs / Math.max(1, steps.length - completed)));
    const effectiveIncome = options.includeIncomeInBudget ? estimate.total : 0;
    const iterator = optimizeDamageSteps(innerDataset, {
      ...options,
      includeEconomyPoints: true,
      income: effectiveIncome,
      timeLimitMs: Math.min(perStepTime, remainingMs),
    }, isCancelled);
    let result: BuildResult | null = null;
    while (true) {
      if (isCancelled()) throw new Error("Hesaplama iptal edildi.");
      if (Date.now() >= deadline) { capped = true; break; }
      const next = iterator.next();
      if (next.done) { result = next.value; break; }
      yield Math.min(99, Math.floor((completed + (next.value as number) / 100) / steps.length * 100));
    }
    if (result) {
      const enriched: BuildResult = {
        ...result,
        dailyIncome: estimate.total,
        incomeBreakdown: estimate.components,
        economySkills: economy.economySkills,
        reason: `Ekonomi ve savaş becerileri birlikte karşılaştırıldı (${points} puan ekonomi için).`,
      };
      if (betterResult(enriched, best, options, estimate.total)) best = enriched;
      completed++;
    }
    if (capped) break;
  }

  if (!best) throw new Error("Optimizasyon zaman sınırında sonuç üretemedi.");
  return { ...best, capped: best.capped || capped };
}
