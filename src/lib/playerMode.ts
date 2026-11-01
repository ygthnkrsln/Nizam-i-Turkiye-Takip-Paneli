export type PlayerMode = "economy" | "combat";

export interface PlayerSkillMode {
  isEconomy: boolean;
  playerMode: PlayerMode;
  ecoSkillPoints: number;
  totalSkillPoints: number;
}

export function calculatePlayerSkillMode(user: any): PlayerSkillMode {
  const ecoSkillNames = [
    "entrepreneurship",
    "energy",
    "stamina",
    "production",
    "companies",
    "management",
  ];
  let ecoSkillPoints = 0;
  if (user?.skills) {
    for (const skillName of ecoSkillNames) {
      const skill = user.skills[skillName];
      if (skill && Number(skill.level || 0) > 0) {
        const level = Number(skill.level);
        ecoSkillPoints += (level * (level + 1)) / 2;
      }
    }
  }

  const totalSkillPoints = Number(
    user?.leveling?.spentSkillPoints ?? user?.leveling?.totalSkillPoints ?? 0,
  );
  const effectiveTotalSkillPoints =
    totalSkillPoints > 0 ? totalSkillPoints : Math.max(1, ecoSkillPoints);
  const isEconomy = ecoSkillPoints > effectiveTotalSkillPoints / 2;

  return {
    isEconomy,
    playerMode: isEconomy ? "economy" : "combat",
    ecoSkillPoints,
    totalSkillPoints: effectiveTotalSkillPoints,
  };
}
