export interface DailyDamageBaseline {
  baselineDate: string | null;
  baselineArmy: any | null;
  baselineMembers: Record<string, { username?: string; weeklyDamage: number }>;
  targetResetDate: string;
}

/** Read the canonical live weekly-damage value from WarEra profile shapes. */
export function getCurrentWeeklyDamage(user: any): number {
  const value = Number(
    user?.rankings?.weeklyUserDamages?.value ??
      user?.weeklyDamages ??
      user?.weeklyDamage ??
      0,
  );
  return Number.isFinite(value) ? value : 0;
}

/**
 * Daily damage is the live weekly total minus the saved reset baseline.
 * Missing baselines are unknown, not a zero baseline, so they contribute 0.
 * If the weekly counter reset below its baseline, current weekly damage is the
 * amount accumulated since that season reset.
 */
export function calculateDailyDamageFromSnapshot(
  currentWeeklyDamage: number,
  baselineWeeklyDamage?: number | null,
): number {
  const current = Number(currentWeeklyDamage);
  if (!Number.isFinite(current)) return 0;
  if (baselineWeeklyDamage === undefined || baselineWeeklyDamage === null) {
    return 0;
  }

  const baseline = Number(baselineWeeklyDamage);
  if (!Number.isFinite(baseline)) return 0;

  return current >= baseline ? current - baseline : current;
}

/** Find the latest snapshot for this MU that belongs to the active 02:55 TSİ cycle. */
export function findBaselineForCurrentCycle(
  snapshots: Record<string, any>,
  muId: string,
  now: Date = new Date(),
): DailyDamageBaseline {
  const istanbulFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = istanbulFormatter.formatToParts(now);
  const partMap: Record<string, string> = {};
  parts.forEach((part) => {
    partMap[part.type] = part.value;
  });

  const today = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const hour = Number(partMap.hour || 0);
  const minute = Number(partMap.minute || 0);
  let targetResetDate = today;

  if (hour < 2 || (hour === 2 && minute < 55)) {
    targetResetDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
    }).format(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }

  const dates = Object.keys(snapshots || {}).sort();
  const eligibleDates = dates.filter(
    (date) => date <= targetResetDate && snapshots[date]?.armies?.[muId],
  );
  const baselineDate = eligibleDates[eligibleDates.length - 1] || null;
  const baselineArmy = baselineDate
    ? snapshots[baselineDate]?.armies?.[muId] || null
    : null;

  return {
    baselineDate,
    baselineArmy,
    baselineMembers: baselineArmy?.members || {},
    targetResetDate,
  };
}
