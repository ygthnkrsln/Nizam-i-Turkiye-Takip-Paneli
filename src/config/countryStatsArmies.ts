import { TRACKED_ARMIES } from "./trackedArmies";

export const COUNTRY_STATS_ARMIES = TRACKED_ARMIES.map((army) => ({
  ...army,
  memberCount: 0,
}));

export const REQUIRED_COUNTRY_STATS_ARMY_IDS = [
  "69ab3f2fd0fc128eeeba7a65",
  "693d20605669127e9d45f9b8",
] as const;

export function includesRequiredCountryStatsArmies(
  armies: ReadonlyArray<{ id: string }> | null | undefined,
): boolean {
  const ids = new Set((armies || []).map((army) => army.id));
  return REQUIRED_COUNTRY_STATS_ARMY_IDS.every((id) => ids.has(id));
}
