import { armorHealthPerHit, calculatePerHit, itemWearPerHit, planFood } from "./model";
import { BuildResult, DamageDataset, FIGHT_SKILLS, GearCandidate, OptimizerOptions, SkillName, SlotName } from "./types";

export function pruneCandidates(candidates: GearCandidate[]): GearCandidate[] {
  return candidates.filter((a, i) => !candidates.some((b, j) => i !== j && a.slot === b.slot && b.attack >= a.attack && b.criticalChance >= a.criticalChance && b.mainStat >= a.mainStat && b.cautiousPrice <= a.cautiousPrice && (b.attack > a.attack || b.criticalChance > a.criticalChance || b.mainStat > a.mainStat || b.cautiousPrice < a.cautiousPrice)));
}
export function compareBuilds(a: Pick<BuildResult, "damage"|"cost">, b: Pick<BuildResult, "damage"|"cost">, budget: number): number {
  const af = a.cost <= budget; const bf = b.cost <= budget;
  if (af !== bf) return af ? 1 : -1;
  if (!af && a.cost !== b.cost) return a.cost < b.cost ? 1 : -1;
  if (a.damage !== b.damage) return a.damage > b.damage ? 1 : -1;
  return a.cost < b.cost ? 1 : a.cost > b.cost ? -1 : 0;
}
function itemStat(item: any, key: string): number { const x = item?.dynamicStats?.[key] ?? item?.flatStats?.[key]; return typeof x === "number" ? x : Array.isArray(x) ? (Number(x[0]) + Number(x[1])) / 2 : Number(x?.min != null ? (x.min + x.max) / 2 : x?.value) || 0; }
export function candidatesFromRows(data: DamageDataset, options: OptimizerOptions): GearCandidate[] {
  const result: GearCandidate[] = [];
  const slots: Record<string, [SlotName, string]> = { weapon: ["weapon", "attack"], helmet: ["helmet", "criticalDamages"], chest: ["chest", "armor"], pants: ["pants", "armor"], boots: ["boots", "dodge"], gloves: ["gloves", "precision"] };
  for (const row of data.equipment || []) {
    if (row.cautious_price == null || (!options.lowConfidence && (row.confidence === "low" || row.source === "smoothed"))) continue;
    const [slot, statName] = slots[row.equipment_name] || []; if (!slot) continue;
    const fixedQuality = ({ knife: 1, gun: 2, rifle: 3, sniper: 4, tank: 5, jet: 6 } as any)[row.equipment_name];
    let quality = Number(row.quality) || fixedQuality || 1;
    const getConfigItem=(q:number)=>data.rules.items[`${row.equipment_name}${q}`] || data.rules.items[row.equipment_name] || {};
    const statValue=Number(row.main_stat);
    if(!row.quality&&!fixedQuality&&Number.isFinite(statValue)) {
      for(let q=1;q<=6;q++) {
        const range=getConfigItem(q)?.dynamicStats?.[statName];
        const min=Array.isArray(range)?Number(range[0]):Number(range?.min);
        const max=Array.isArray(range)?Number(range[1]):Number(range?.max);
        if(Number.isFinite(min)&&Number.isFinite(max)&&statValue>=min&&statValue<=max){quality=q;break;}
      }
    }
    const configItem = getConfigItem(quality);
    const price = options.medianPrices && row.median_price != null ? row.median_price : row.cautious_price;
    result.push({ code: `${row.equipment_name}${quality}`, quality, attack: slot === "weapon" ? Number(row.main_stat ?? itemStat(configItem, "attack")) : 0, criticalChance: slot === "weapon" ? Number(row.critical_chance ?? itemStat(configItem, "criticalChance")) : 0, mainStat: Number(row.main_stat) || itemStat(configItem, statName), cautiousPrice: Number(price), medianPrice: row.median_price == null ? null : Number(row.median_price), confidence: row.confidence || "medium", source: row.source || "observed", slot });
  }
  return pruneCandidates(result);
}
function skillCost(rules: DamageDataset["rules"], skill: SkillName, level: number) { return rules.skills[skill].levels[level]?.totalCost || 0; }
function value(rules: DamageDataset["rules"], skill: SkillName, level: number, bonus: number) { return (rules.skills[skill].levels[level]?.value || 0) + bonus; }
function effectiveItemPrice(data:DamageDataset,code:string){const raw=data.prices[code];if(raw==null)return Number.POSITIVE_INFINITY;const value=Number(raw);return Number.isFinite(value)&&value>=0?value:Number.POSITIVE_INFINITY;}
function totalDamage(data: DamageDataset, levels: Record<SkillName, number>, gear: Partial<Record<SlotName, GearCandidate>>, ammo: string, options: OptimizerOptions): Omit<BuildResult, "skills"|"gear"|"ammo"|"foods"|"capped"|"reason"> & { foods: Record<string,number> } {
  const tax = options.tax; const prices = data.prices;
  const effectivePrice = (code: string) => prices[code]!=null&&Number.isFinite(Number(prices[code]))&&Number(prices[code])>=0 ? Number(prices[code]) * (1 + tax / 100) : Number.POSITIVE_INFINITY;
  const ammoItem = data.rules.items[ammo] || {}; const ammoPct = itemStat(ammoItem, "percentAttack");
  const battleBonus = options.battleBonus;
  const pillItem = data.rules.items.cocain?.flatStats || {}; const pillPct = options.usePill ? Number(pillItem.percentAttack) || 60 : 0;
  const stats = calculatePerHit(data.rules, levels, data.player.strategic, gear, ammoPct, pillPct, options.rankBonus, battleBonus, options.missFactor);
  const plainStats = options.usePill && options.countDebuff ? calculatePerHit(data.rules, levels, data.player.strategic, gear, ammoPct, 0, options.rankBonus, battleBonus, options.missFactor) : stats;
  const health = value(data.rules,"health",levels.health,data.player.strategic.health||0); const hunger = value(data.rules,"hunger",levels.hunger,data.player.strategic.hunger||0);
  const regen = options.regenPerHour;
  const dayBars = 24 * regen;
  const buffBars = options.usePill ? Math.min(dayBars, 1 + (Number(data.rules.items.cocain?.flatStats?.buffDurationHours)||8)*regen) : 0;
  const plainBars = Math.max(0, dayBars - buffBars);
  const foodOptions = ["bread","steak","cookedFish"].map(code => ({code,gain:Number(data.rules.items[code]?.flatStats?.healthRegenPercent)||({bread:10,steak:15,cookedFish:20} as any)[code],price:effectivePrice(code)})).filter(food=>Number.isFinite(food.price));
  const baseHits = health * dayBars / stats.healthPerHit;
  const buffHits = options.usePill ? Math.min(baseHits, health * buffBars / stats.healthPerHit) : 0;
  const wear = Object.values(gear).filter((item):item is GearCandidate=>Boolean(item)).reduce((sum, item) => sum + itemWearPerHit(item.cautiousPrice,item.quality,Number.isFinite(effectivePrice("scraps"))?effectivePrice("scraps"):0,tax,options.hitsPerItem,options.equipmentPricesIncludeTax),0);
  const costPerHit = effectivePrice(ammo) + wear;
  const hitCaseIncome=options.countCases?stats.hitChance*(value(data.rules,"lootChance",levels.lootChance,data.player.strategic.lootChance||0)/100)*((Number.isFinite(effectivePrice("case1"))?effectivePrice("case1"):0)+.01*(Number.isFinite(effectivePrice("case2"))?effectivePrice("case2"):0)):0;
  const pillCost = options.usePill ? effectivePrice("cocain") : 0;
  const preFoodNetCost=baseHits*(costPerHit-hitCaseIncome)+pillCost;
  const foodBudget=options.goal==="budget"?Math.max(0,options.budget+options.income-preFoodNetCost):Number.POSITIVE_INFINITY;
  const food = options.food ? planFood(Math.floor(hunger*dayBars),foodOptions,health,stats.healthPerHit,foodBudget,costPerHit-hitCaseIncome) : {counts:{},extraHits:0,cost:0};
  const plainHits = Math.max(0, baseHits - buffHits) + food.extraHits;
  const hits = buffHits + plainHits;
  const buffDamage = buffHits * stats.perHit;
  const plainDamage = options.usePill && options.countDebuff ? plainHits * plainStats.perHit * (1 - options.pillDebuffMalus) : plainHits * plainStats.perHit;
  const baseDamage = buffDamage + plainDamage;
  const rawPerHit = hits ? baseDamage / hits : 0;
  let caseIncome = 0;
  if (options.countCases) caseIncome = hits * hitCaseIncome;
  const cost = Math.max(0, hits * costPerHit + food.cost + pillCost - caseIncome);
  return { hits, perHit: rawPerHit, damage: baseDamage, cost, caseIncome, costPerHit, foods: food.counts };
}

export function* optimizeDamageSteps(data: DamageDataset, options: OptimizerOptions, isCancelled: () => boolean = () => false): Generator<number, BuildResult, void> {
  const start = Date.now(); let levels = { ...data.player.current };
  const equipment = candidatesFromRows(data, options); const candidates: Record<SlotName, GearCandidate[]> = { weapon:[],helmet:[],chest:[],pants:[],boots:[],gloves:[] };
  for (const item of equipment) candidates[item.slot].push(item);
  const gear: Partial<Record<SlotName, GearCandidate>> = {};
  // Start from the least expensive known items; exact build comparisons can replace them later.
  for (const slot of Object.keys(candidates) as SlotName[]) { const selected=[...candidates[slot]].sort((a,b) => a.cautiousPrice-b.cautiousPrice)[0]; if(selected)gear[slot]=selected; }
  const pool = Math.max(0, data.player.totalPoints - Number(data.player.ignoredSpentPoints||0) - (options.includeEconomyPoints ? 0 : Number(data.player.economySpentPoints||0)));
  const maxLevel = (skill: SkillName) => data.player.level < data.rules.fightSkillsUnlockLevel ? 0 : Math.max(0,...Object.entries(data.rules.skills[skill].levels).filter(([,v]) => (v.unlockAtLevel||1) <= data.player.level).map(([n])=>Number(n)));
  for(const skill of FIGHT_SKILLS)if(data.player.level<data.rules.fightSkillsUnlockLevel)levels[skill]=0;
  const feasible = () => FIGHT_SKILLS.reduce((sum,s)=>sum+skillCost(data.rules,s,levels[s]),0) <= pool;
  if(!feasible())for(const skill of FIGHT_SKILLS)levels[skill]=0;
  const availableAmmo=["lightAmmo","ammo","heavyAmmo"].filter(code=>Number.isFinite(effectiveItemPrice(data,code)));
  if(!availableAmmo.length) throw new Error("API yanıtında fiyatı bulunan mühimmat yok; güvenilir maliyet hesaplanamıyor.");
  if(options.usePill&&!Number.isFinite(effectiveItemPrice(data,"cocain")))throw new Error("Hap kullanımını hesaplamak için güvenilir kokain fiyatı yok.");
  let bestAmmo = availableAmmo[0]; let current = totalDamage(data,levels,gear,bestAmmo,options); let budget = options.goal === "unlimited" ? Number.POSITIVE_INFINITY : options.goal === "target" ? Number.POSITIVE_INFINITY : Math.max(0,options.budget+options.income);
  let best: BuildResult = { ...current, skills:{...levels},gear:{...gear},ammo:bestAmmo,capped:false,reason:"Beceri puanları ve güvenilir ekipman adayları arasında en iyi bulunan dağılım." };
  const allocate=(priority:SkillName[])=>{const seed=Object.fromEntries(FIGHT_SKILLS.map(s=>[s,0])) as Record<SkillName,number>;let moved=true;while(moved){moved=false;for(const skill of priority){const next=seed[skill]+1;if(next<=maxLevel(skill)&&FIGHT_SKILLS.reduce((sum,name)=>sum+skillCost(data.rules,name,name===skill?next:seed[name]),0)<=pool){seed[skill]=next;moved=true;}}}return seed;};
  const seeds:Record<SkillName,number>[]=[];
  if(feasible())seeds.push({...levels});
  seeds.push(allocate([...FIGHT_SKILLS]));
  seeds.push(allocate(["attack","precision","criticalChance","criticalDamages","health","hunger","armor","dodge","lootChance"]));
  seeds.push(allocate(["health","hunger","armor","dodge","attack","precision","criticalChance","criticalDamages","lootChance"]));
  seeds.push(allocate(["lootChance","attack","precision","criticalChance","criticalDamages","health","hunger","armor","dodge"]));
  let randomState=0x51f15e;
  for(let i=0;i<8;i++){const order=[...FIGHT_SKILLS];for(let j=order.length-1;j>0;j--){randomState=(randomState*1664525+1013904223)>>>0;const k=randomState%(j+1);[order[j],order[k]]=[order[k],order[j]];}seeds.push(allocate(order));}
  // Deterministic seeded allocations plus a local coordinate climb around each allocation.
  let completedSeeds=0;
  for(const seed of seeds){
   levels={...seed};
   for(const ammo of availableAmmo){
    const candidateBase=totalDamage(data,levels,gear,ammo,options);
    const initialCandidate:BuildResult={...candidateBase,skills:{...levels},gear:{...gear},ammo,capped:false,reason:"Beceri puanı başlangıç dağılımları karşılaştırıldı."};
    const initialBetter=options.goal==="target"?((initialCandidate.damage>=options.targetDamage)!==(best.damage>=options.targetDamage)?initialCandidate.damage>=options.targetDamage:initialCandidate.damage>=options.targetDamage?initialCandidate.cost<best.cost:initialCandidate.damage>best.damage):compareBuilds(initialCandidate,best,budget)>0;
    if(initialBetter){best=initialCandidate;bestAmmo=ammo;}
   }
   let localPass=0;
   for (let pass=0; pass<16; pass++) {
    if (isCancelled()) throw new Error("İşlem kullanıcı tarafından iptal edildi.");
    if (Date.now()-start>options.timeLimitMs) { best.capped=true; break; }
    let improved=false;
    for (const skill of FIGHT_SKILLS) {
      for (const delta of [-1,1]) {
        const next=levels[skill]+delta; if (next<0||next>maxLevel(skill)) continue;
        const previous=levels[skill]; levels[skill]=next;
        if (!feasible()) { levels[skill]=previous; continue; }
        let moveImproved=false;
        for (const ammo of availableAmmo) {
          const score=totalDamage(data,levels,gear,ammo,options);
          const candidate: BuildResult={...score,skills:{...levels},gear:{...gear},ammo,capped:false,reason:"Mevcut seviye, beceri puanı sınırı ve fiyatlı ekipmanlar tarandı."};
          const better=options.goal === "target"
            ? ((candidate.damage>=options.targetDamage)!==(best.damage>=options.targetDamage) ? candidate.damage>=options.targetDamage : candidate.damage>=options.targetDamage ? candidate.cost<best.cost : candidate.damage>best.damage)
            : compareBuilds(candidate,best,budget)>0;
          if (better) {best=candidate; bestAmmo=ammo; current=score; improved=true;moveImproved=true;}
        }
        if (!moveImproved) levels[skill]=previous;
      }
    }
    // When all points are allocated, an individual +1 move is infeasible; test a one-point transfer between skills.
    transferLoop: for(const from of FIGHT_SKILLS) for(const to of FIGHT_SKILLS){
      if(Date.now()-start>options.timeLimitMs){best.capped=true;break transferLoop;}
      if(from===to||levels[from]===0||levels[to]>=maxLevel(to))continue;
      const oldFrom=levels[from],oldTo=levels[to];levels[from]--;levels[to]++;
      if(!feasible()){levels[from]=oldFrom;levels[to]=oldTo;continue;}
      let transferImproved=false;
      for(const ammo of availableAmmo){
        const score=totalDamage(data,levels,gear,ammo,options);const candidate:BuildResult={...score,skills:{...levels},gear:{...gear},ammo,capped:false,reason:"Beceri puanları, başlangıç dağılımları ve fiyatlı ekipman kombinasyonları karşılaştırıldı."};
        const better=options.goal==="target"?((candidate.damage>=options.targetDamage)!==(best.damage>=options.targetDamage)?candidate.damage>=options.targetDamage:candidate.damage>=options.targetDamage?candidate.cost<best.cost:candidate.damage>best.damage):compareBuilds(candidate,best,budget)>0;
        if(better){best=candidate;bestAmmo=ammo;improved=true;transferImproved=true;}
      }
      if(!transferImproved){levels[from]=oldFrom;levels[to]=oldTo;}
    }
    // Gear swap passes use the exact same result key and only items with known prices.
    gearLoop: for (const slot of Object.keys(candidates) as SlotName[]) for (const item of candidates[slot]) {
      if(Date.now()-start>options.timeLimitMs){best.capped=true;break gearLoop;}
      if (isCancelled()) throw new Error("İşlem kullanıcı tarafından iptal edildi.");
      const previous=gear[slot]; gear[slot]=item;
      const score=totalDamage(data,levels,gear,bestAmmo,options); const candidate:BuildResult={...score,skills:{...levels},gear:{...gear},ammo:bestAmmo,capped:false,reason:"Beceri puanı ve fiyatlı ekipman kombinasyonları karşılaştırıldı."};
      const better=options.goal==="target"?((candidate.damage>=options.targetDamage)!==(best.damage>=options.targetDamage)?candidate.damage>=options.targetDamage:candidate.damage>=options.targetDamage?candidate.cost<best.cost:candidate.damage>best.damage):compareBuilds(candidate,best,budget)>0;
      if (better) {best=candidate; improved=true;} else gear[slot]=previous;
    }
    localPass=pass+1; yield Math.min(95,Math.round((completedSeeds+(localPass/16))/seeds.length*95)); if (!improved) break;
   }
   completedSeeds++;
   if(best.capped)break;
   if(Date.now()-start>options.timeLimitMs){best.capped=true;break;}
  }
  if (options.goal === "target" && best.damage < options.targetDamage) best.reason="Hedef hasara bu puan ve fiyat sınırlarıyla ulaşılamadı; en yakın uygulanabilir plan gösteriliyor.";
  else if (options.goal === "budget" && best.cost > budget) best.reason="Bütçeyi aşmayan plan bulunamadı; en düşük maliyetli aday gösteriliyor.";
  return best;
}

export function optimizeDamage(data: DamageDataset, options: OptimizerOptions, onProgress: (progress: number) => void = () => {}, isCancelled: () => boolean = () => false): BuildResult {
  const iterator=optimizeDamageSteps(data,options,isCancelled); let step=iterator.next();
  while(!step.done){onProgress(step.value as number);step=iterator.next();}
  return step.value as BuildResult;
}
