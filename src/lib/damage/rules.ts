import { DamageRules, PlayerDamageProfile, SkillName, SkillRule } from "./types";

export const SKILL_NAMES: SkillName[] = ["attack", "precision", "criticalChance", "criticalDamages", "armor", "dodge", "health", "hunger", "lootChance"];
const ECONOMY_SKILLS = ["energy", "production", "companies", "management"];

export function unwrapTrpc<T = any>(body: any): T {
  let data = body?.result?.data ?? body?.data ?? body;
  if (data && typeof data === "object" && "json" in data) data = data.json;
  return data as T;
}

export function buildRules(config: any): DamageRules {
  const data = unwrapTrpc<any>(config);
  const skills: Record<string, SkillRule> = {};
  for (const name of SKILL_NAMES) {
    const raw = data?.skills?.[name];
    if (!raw) throw new Error(`Oyun yapılandırmasında ${name} becerisi bulunamadı.`);
    const levels = Object.fromEntries(Object.entries(raw.levels || {}).map(([level, row]: [string, any]) => [Number(level), { value: Number(row.value) || 0, totalCost: Number(row.totalCost ?? row.cost) || 0, unlockAtLevel: Number(row.unlockAtLevel) || 1 }]));
    skills[name] = { levels, softCap: Number(raw.softCap) || undefined, skillOverflow: raw.skillOverflow, skillOverflowValue: Number(raw.skillOverflowValue) || 0 };
  }
  const economySkills = Object.fromEntries(ECONOMY_SKILLS.map(name => {
    const raw=data?.skills?.[name];
    const levels=Object.fromEntries(Object.entries(raw?.levels||{}).map(([level,row]:[string,any])=>[Number(level),{value:Number(row.value)||0,totalCost:Number(row.totalCost??row.cost)||0,unlockAtLevel:Number(row.unlockAtLevel)||1}]));
    return [name,{levels}];
  })) as DamageRules["economySkills"];
  const staminaRaw=data?.skills?.stamina;const ignoredSkills:DamageRules["ignoredSkills"]={stamina:{levels:Object.fromEntries(Object.entries(staminaRaw?.levels||{}).map(([level,row]:[string,any])=>[Number(level),{value:Number(row.value)||0,totalCost:Number(row.totalCost??row.cost)||0,unlockAtLevel:Number(row.unlockAtLevel)||1}]))}};
  const user = data.user || {};
  const battle = data.battle || {};
  const battleKeys = ["countryOrderBonusPercent", "muOrderBonusPercent", "allianceDamagesBonusPercent", "enemyDamagesBonusPercent", "patrioticBonusPercent", "regionNotLinkedToCapitalMalusPercent", "lostAttackingRegionMalusPercent", "occupyingYourRegionsMalusPercent"];
  const upgrades = data.upgradesConfig || {};
  return { skills: skills as DamageRules["skills"], economySkills, ignoredSkills, battle: Object.fromEntries(battleKeys.map((k) => [k, Number(battle[k]) || 0])), items: data.items || {}, upgrades, healthCost: Number(battle.healthCost) || 10, regenDividedBy: Number(user.regenDividedBy) || 10, fightSkillsUnlockLevel: Number(user.featureUnlockLevels?.fightSkills) || 1, muHealthPerHelp: Number(data.mu?.healthPerHelp) || 0 };
}

export function buildPlayerProfile(lite: any, full: any, rules: DamageRules): PlayerDamageProfile {
  const p = unwrapTrpc<any>(lite); const f = unwrapTrpc<any>(full);
  if (!p?._id || !f?.skills) throw new Error("Oyuncu bilgileri eksik veya alınamadı.");
  const level = Number(p.leveling?.level) || 1;
  const current = Object.fromEntries(SKILL_NAMES.map((name) => [name, Math.max(0, Math.min(10, Number(f.skills?.[name]?.level) || 0))])) as Record<SkillName, number>;
  const strategic = Object.fromEntries(SKILL_NAMES.map((name) => {
    const skill = f.skills?.[name];
    const base = rules.skills[name].levels[current[name]]?.value || 0;
    const value = Number.isFinite(Number(skill?.strategic)) ? Number(skill.strategic) : Math.max(0, (Number(skill?.value) || 0) - base);
    return [name, value];
  })) as Partial<Record<SkillName, number>>;
  const leveling = p.leveling || {};
  const spentPoints = SKILL_NAMES.reduce((sum, name) => sum + (rules.skills[name].levels[current[name]]?.totalCost || 0), 0);
  const excludedEconomy = ECONOMY_SKILLS.reduce((sum, name) => {
    const lvl = Number(f.skills?.[name]?.level) || 0;
    return sum + (rules.economySkills[name]?.levels[lvl]?.totalCost || 0);
  }, 0);
  const ignoredSpentPoints=rules.ignoredSkills.stamina?.levels[Number(f.skills?.stamina?.level)||0]?.totalCost||0;
  const allCurrentSpent=spentPoints+excludedEconomy+ignoredSpentPoints;
  const economyLevels=Object.fromEntries(ECONOMY_SKILLS.map(name=>[name,Number(f.skills?.[name]?.level)||0]));
  const declaredSpent=Number(leveling.spentSkillPoints);const declaredUnspent=Number(leveling.availableSkillPoints);const declaredTotal=Number(leveling.totalSkillPoints);
  const validSpent=Number.isFinite(declaredSpent)&&declaredSpent>=0?declaredSpent:allCurrentSpent;
  const unspent=Number.isFinite(declaredUnspent)&&declaredUnspent>=0?declaredUnspent:0;
  const fallbackPoints=Number.isFinite(declaredSpent)&&Number.isFinite(declaredUnspent)?declaredSpent+declaredUnspent:Number.isFinite(declaredUnspent)?allCurrentSpent+unspent:level*4;
  const totalPoints=Number.isFinite(declaredTotal)&&declaredTotal>=0?declaredTotal:fallbackPoints;
  const spent=validSpent;
  return { id: String(p._id), username: String(p.username || "Oyuncu"), level, xp: Number(leveling.xp) || 0, prestige: Number(leveling.prestigeLevel) || 0, totalPoints: Math.max(totalPoints, spentPoints + unspent), unspentPoints: unspent, spentPoints: spent, economySpentPoints:excludedEconomy, ignoredSpentPoints, economyLevels, militaryRank: Number(p.militaryRank) || 0, countryId: String(p.country || p.countryId || ""), strategic, current };
}
