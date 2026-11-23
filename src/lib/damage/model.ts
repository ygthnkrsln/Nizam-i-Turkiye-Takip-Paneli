import { DamageRules, GearCandidate, OptimizerOptions, SkillName } from "./types";

export const SCRAP_YIELD: Record<number, number> = { 1: 6, 2: 18, 3: 54, 4: 162, 5: 486, 6: 1458 };
// UNVERIFIED: sale price is treated as tax-exclusive; the calculator adds buyer market tax.
export const EQUIPMENT_PRICES_INCLUDE_TAX = false;
export function softCapPct(value: number, cap: number): number { return Math.round(value / (value + cap) * 100); }
export function armorHealthPerHit(armor: number, cap: number, healthCost: number): number {
  // UNVERIFIED: floor to tenths and a minimum health cost of one.
  return Math.max(Math.floor((1 - softCapPct(armor, cap) / 100) * healthCost * 10) / 10, 1);
}
export function skillValue(rules: DamageRules, skill: SkillName, level: number, strategic = 0): number { return (rules.skills[skill].levels[level]?.value ?? 0) + strategic; }
export function calculatePerHit(rules: DamageRules, levels: Record<SkillName, number>, strategic: Partial<Record<SkillName, number>>, gear: Partial<Record<string, GearCandidate>>, ammoPct: number, pillPct: number, rankBonus: number, battleBonus: number, missFactor: number) {
  const value = (s: SkillName) => skillValue(rules, s, levels[s], strategic[s] || 0);
  const weapon = gear.weapon;
  const precision = value("precision") + (gear.gloves?.mainStat || 0);
  const crit = value("criticalChance") + (weapon?.criticalChance || 0);
  // UNVERIFIED: overflow values are treated as flat attack/critical-damage points per excess point.
  const overflowAtk = (rules.skills.precision.skillOverflowValue || 0) * Math.max(precision - 100, 0);
  const overflowCD = (rules.skills.criticalChance.skillOverflowValue || 0) * Math.max(crit - 100, 0);
  const critDamage = value("criticalDamages") + (gear.helmet?.mainStat || 0) + overflowCD;
  const attack = (value("attack") + (weapon?.attack || 0) + overflowAtk) * (1 + ammoPct / 100) * (1 + pillPct / 100) * (1 + rankBonus / 100);
  const hit = Math.min(precision, 100) / 100; const critShare = Math.min(crit, 100) / 100;
  // UNVERIFIED: missFactor defaults to 0.5; battle bonuses are combined additively.
  const perHit = attack * (hit * (1 + critShare * critDamage / 100) + (1 - hit) * missFactor) * (1 + battleBonus / 100);
  const armor = value("armor") + (gear.chest?.mainStat || 0) + (gear.pants?.mainStat || 0);
  const dodge = value("dodge") + (gear.boots?.mainStat || 0);
  const healthPerHit = armorHealthPerHit(armor, rules.skills.armor.softCap || 40, rules.healthCost) * (1 - softCapPct(dodge, rules.skills.dodge.softCap || 40) / 100);
  return { perHit, precision, crit, attack, healthPerHit: Math.max(0.01, healthPerHit), armor, dodge, hitChance: hit };
}
export function itemWearPerHit(price: number, quality: number, scrapsPrice: number, taxPct: number, hitsPerItem: number, includesTax = EQUIPMENT_PRICES_INCLUDE_TAX): number {
  const taxed = price * (includesTax ? 1 : 1 + taxPct / 100);
  // UNVERIFIED: fixed scrap yields divided by three and a fixed item lifespan are community assumptions.
  const scrapBack = Math.floor((SCRAP_YIELD[quality] || 0) / 3) * scrapsPrice;
  return Math.max(0, taxed - scrapBack) / Math.max(1, hitsPerItem);
}
export function planFood(slots: number, foods: { code: string; gain: number; price: number }[], healthPerBar: number, healthPerHit: number, maxSpend = Number.POSITIVE_INFINITY, netCostPerHit = 0) {
  const available = foods.filter(f => f.gain > 0 && Number.isFinite(f.price) && f.price >= 0).sort((a,b) => (b.gain / Math.max(b.price, .001)) - (a.gain / Math.max(a.price, .001)));
  const limit=Math.max(0,Math.floor(slots)); if(!available.length||!limit)return {counts:{},extraHits:0,cost:0,slots:limit};
  const base=available[0];const alternatives=available.slice(1);const perServingHits=(food:{gain:number})=>healthPerBar*food.gain/100/healthPerHit;
  let best={counts:{} as Record<string,number>,extraHits:0,cost:0};
  const maxFirst=alternatives[0]?limit:0;
  for(let first=0;first<=maxFirst;first++)for(let second=0;second<=(alternatives[1]?limit-first:0);second++){
    const extraFoodCost=first*(alternatives[0]?.price||0)+second*(alternatives[1]?.price||0);
    const extraFoodHits=first*perServingHits(alternatives[0]||base)+second*perServingHits(alternatives[1]||base);
    const remaining=limit-first-second;
    const baseUnitCost=base.price+perServingHits(base)*netCostPerHit;
    const baseCount=Number.isFinite(maxSpend)&&baseUnitCost>0?Math.min(remaining,Math.max(0,Math.floor((maxSpend-extraFoodCost-extraFoodHits*netCostPerHit)/baseUnitCost))):remaining;
    const counts:Record<string,number>={};if(first)counts[alternatives[0].code]=first;if(second)counts[alternatives[1].code]=second;if(baseCount)counts[base.code]=baseCount;
    const totalFoodCost=extraFoodCost+baseCount*base.price;const totalHits=extraFoodHits+baseCount*perServingHits(base);const netSpend=totalFoodCost+totalHits*netCostPerHit;
    if(netSpend>maxSpend+1e-8)continue;
    if(totalHits>best.extraHits+1e-8||(Math.abs(totalHits-best.extraHits)<1e-8&&totalFoodCost<best.cost))best={counts,extraHits:totalHits,cost:totalFoodCost};
  }
  return { ...best, slots: limit };
}
export function dailyHits(rules: DamageRules, health: number, hunger: number, healthPerHit: number, foodExtraHits: number, options: OptimizerOptions) {
  // UNVERIFIED: `regenPerHour` and the 24-hour bar convention follow the supplied community formula.
  const bars = 24 * options.regenPerHour;
  const totalHealth = health * bars + options.muHealth;
  const slots = Math.floor(hunger * bars);
  return { hits: totalHealth / healthPerHit + foodExtraHits, slots, bars };
}
