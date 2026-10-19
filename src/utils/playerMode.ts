import { PlayerMode, PlayerStats } from "../types";

const ECONOMY_SKILLS = [
  "entrepreneurship",
  "energy",
  "stamina",
  "production",
  "companies",
  "management",
] as const;

export function getPlayerModeInfo(player: PlayerStats) {
  let ecoSP = player.ecoSkillPoints || 0;
  if (!player.ecoSkillPoints && player.skills) {
    for (const key of ECONOMY_SKILLS) {
      const level = Number(player.skills[key]?.level || 0);
      ecoSP += (level * (level + 1)) / 2;
    }
  }

  const totalSP = player.totalSkillPoints || Math.max(ecoSP * 2, 1);
  const ratio = Math.round((ecoSP / totalSP) * 100);
  const isEco = player.playerMode
    ? player.playerMode === "economy"
    : ecoSP > totalSP / 2;

  return {
    isEco,
    ecoSP,
    totalSP,
    ratio,
    mode: (isEco ? "economy" : "combat") as PlayerMode,
  };
}
