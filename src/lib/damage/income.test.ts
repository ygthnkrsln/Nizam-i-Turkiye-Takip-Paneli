import test from "node:test";
import assert from "node:assert/strict";
import { assessBattleBonuses, marketTaxToPercent } from "./battleBonuses";
import { buildEconomyIncomeTable, calculateDailyIncome, effectiveDailyBudget, IncomeOptions } from "./income";
import { optimizeDamageWithIncomeSteps } from "./jointOptimizer";
import { DamageDataset, OptimizerOptions, SkillName } from "./types";

const incomeOptions:IncomeOptions={fixedRewards:true,selfProduction:true,otherIncomeEnabled:true,otherDailyIncome:0,productionItem:"best",taxPercent:0,ownCompany:true,depositBonusPercent:0,regionBonusPercent:0,productionIncomeTaxPercent:0};
function fixture():DamageDataset {
  return {
    rules:{skills:{},economySkills:{
      energy:{levels:{0:{value:0,totalCost:0},1:{value:100,totalCost:1},2:{value:200,totalCost:3}}},
      production:{levels:{0:{value:0,totalCost:0},1:{value:10,totalCost:1},2:{value:20,totalCost:3}}},
      companies:{levels:{0:{value:0,totalCost:0}}},management:{levels:{0:{value:0,totalCost:0}}},
    },ignoredSkills:{},battle:{},items:{
      inputProduct:{isTradable:true,productionPoints:10,productionNeeds:{lead:1}},
      freeProduct:{isTradable:true,productionPoints:5,productionNeeds:{}},
      missingPrice:{isTradable:true,productionPoints:1,productionNeeds:{}},
    },upgrades:{},healthCost:10,regenDividedBy:10,energyCostPerAction:10,dailyReward:{money:10,case1:2},missionRewards:{daily:{money:5,cases:1},weekly:{money:70,cases:7},monthly:{money:300,cases:30}},fightSkillsUnlockLevel:1,muHealthPerHelp:2} as any,
    player:{id:"a".repeat(24),username:"Fixture",level:10,xp:0,prestige:0,totalPoints:6,unspentPoints:0,spentPoints:6,economySpentPoints:0,economyLevels:{energy:0,production:0,companies:0,management:0},economyStrategic:{},militaryRank:1,rankBonusPercent:null,countryId:"",strategic:{},current:{} as any},
    prices:{case1:3,inputProduct:3,freeProduct:5,lead:1},marketTax:0,equipment:[],equipmentUpdatedAt:null,
  };
}

test("fixed reward estimate values daily rewards and normalizes mission cycles",()=>{
  const estimate=calculateDailyIncome(fixture(),{...incomeOptions,selfProduction:false});
  assert.equal(estimate.total,50);
  assert.deepEqual(estimate.components.filter(row=>row.id.startsWith("mission-")).map(row=>row.amount),[8,13,13]);
});

test("reward cases use current market price without adding purchase tax",()=>{
  const estimate=calculateDailyIncome(fixture(),{...incomeOptions,fixedRewards:true,selfProduction:false,taxPercent:50,otherIncomeEnabled:false});
  assert.equal(estimate.components.find(row=>row.id==="daily-reward")?.amount,16);
});

test("work clicks and net production account for input prices and skip unpriced products",()=>{
  const data=fixture();
  const estimate=calculateDailyIncome(data,incomeOptions,{energy:1,production:1,companies:0,management:0});
  assert.equal(estimate.clicksPerDay,24);
  assert.equal(estimate.productionOptions.find(row=>row.code==="inputProduct")?.netGoldPerClick,2);
  assert.equal(estimate.productionOptions.find(row=>row.code==="freeProduct")?.netGoldPerClick,10);
  assert.equal(estimate.productionOptions.some(row=>row.code==="missingPrice"),false);
});

test("income toggle and an empty manual budget produce the expected effective budget",()=>{
  assert.equal(effectiveDailyBudget("",100,true),100);
  assert.equal(effectiveDailyBudget("",100,false),0);
  assert.equal(effectiveDailyBudget("50",100,true),150);
});

test("economy income table is monotonic and never exceeds its points budget",()=>{
  const table=buildEconomyIncomeTable(fixture(),incomeOptions,6);
  for(let index=1;index<table.length;index++) assert.ok(table[index].income>=table[index-1].income);
  for(const row of table) {
    const used=["energy","production","companies","management"].reduce((sum,skill)=>sum+((fixture().rules.economySkills as any)[skill].levels[row.economySkills[skill]]?.totalCost||0),0);
    assert.ok(used<=row.points);
  }
});

test("battle bonus detection maps evidence and leaves unsupported region bonuses manual",()=>{
  const home="a".repeat(24),ally="b".repeat(24),enemy="c".repeat(24),mu="d".repeat(24);
  const assessment=assessBattleBonuses({playerCountryId:home,playerAllianceId:"alliance",enemyCountryIds:[enemy],playerMuIds:[mu],battle:{attacker:{country:home,countryOrders:[home],muOrders:[mu]},defender:{country:enemy}},countriesById:{[home]:{allianceId:"alliance"},[enemy]:{allianceId:"other"}},ordersBySide:{attacker:[],defender:[]},ordersKnown:{attacker:true,defender:true},allianceKnown:true,enemyListKnown:true,configuredBonuses:{patrioticBonusPercent:20,countryOrderBonusPercent:10,muOrderBonusPercent:10,allianceDamagesBonusPercent:10,enemyDamagesBonusPercent:10,regionNotLinkedToCapitalMalusPercent:-25,lostAttackingRegionMalusPercent:-25,occupyingYourRegionsMalusPercent:-50}});
  const byKey=Object.fromEntries(assessment.map(item=>[item.key,item]));
  assert.equal(byKey.patrioticBonusPercent.enabled,true);
  assert.equal(byKey.countryOrderBonusPercent.enabled,true);
  assert.equal(byKey.muOrderBonusPercent.enabled,true);
  assert.equal(byKey.enemyDamagesBonusPercent.enabled,true);
  assert.equal(byKey.allianceDamagesBonusPercent.enabled,true);
  assert.equal(byKey.regionNotLinkedToCapitalMalusPercent.enabled,false);
  assert.equal(byKey.regionNotLinkedToCapitalMalusPercent.source,"belirlenemedi");
  const allied=assessBattleBonuses({playerCountryId:home,playerAllianceId:"alliance",enemyCountryIds:[],playerMuIds:[],battle:{attacker:{country:ally},defender:{country:enemy}},countriesById:{[home]:{allianceId:"alliance"},[ally]:{allianceId:"alliance"},[enemy]:{allianceId:"other"}},ordersBySide:{attacker:[],defender:[]},ordersKnown:{attacker:true,defender:true},allianceKnown:true,enemyListKnown:true,configuredBonuses:{patrioticBonusPercent:20,allianceDamagesBonusPercent:10}});
  assert.equal(allied.find(item=>item.key==="allianceDamagesBonusPercent")?.enabled,true);
  assert.equal(allied.find(item=>item.key==="patrioticBonusPercent")?.enabled,false);
  const muBattle=assessBattleBonuses({playerCountryId:home,playerAllianceId:"",enemyCountryIds:[],playerMuIds:[mu],battle:{attacker:{country:enemy},defender:{country:ally,muOrders:[mu]}},countriesById:{},ordersBySide:{attacker:[],defender:[]},ordersKnown:{attacker:true,defender:true},allianceKnown:false,enemyListKnown:false,configuredBonuses:{muOrderBonusPercent:10}});
  assert.equal(muBattle.find(item=>item.key==="muOrderBonusPercent")?.enabled,true);
  const missing=assessBattleBonuses({playerCountryId:home,playerAllianceId:"",enemyCountryIds:[],playerMuIds:[],battle:{attacker:{country:home},defender:{country:enemy}},countriesById:{},ordersBySide:{attacker:[],defender:[]},ordersKnown:{attacker:false,defender:false},allianceKnown:false,enemyListKnown:false,configuredBonuses:{}});
  assert.equal(missing.find(item=>item.key==="countryOrderBonusPercent")!.source,"belirlenemedi");
  assert.match(missing.find(item=>item.key==="countryOrderBonusPercent")!.reason,/elle seç/);
});

test("market tax unit conversion preserves percent points and supports ratio interpretation",()=>{
  assert.equal(marketTaxToPercent(0.5,"percentage-points"),0.5);
  assert.equal(marketTaxToPercent(0.5,"ratio"),50);
  assert.equal(marketTaxToPercent(null),null);
});

test("joint economy and combat optimizer is deterministic on a small fixture",()=>{
  const data=fixture();
  const skillNames:SkillName[]=["attack","precision","criticalChance","criticalDamages","armor","dodge","health","hunger","lootChance"];
  data.rules.skills=Object.fromEntries(skillNames.map(skill=>[skill,{levels:{0:{value:skill==="attack"?10:1,totalCost:0},1:{value:skill==="attack"?20:2,totalCost:1}},softCap:40}])) as any;
  data.player.totalPoints=1;
  data.player.current=Object.fromEntries(skillNames.map(skill=>[skill,0])) as any;
  data.prices={lightAmmo:1,ammo:2,heavyAmmo:3,bread:1,steak:2,cookedFish:3,scraps:.1,cocain:5,case1:3,case2:20,...data.prices};
  const options:OptimizerOptions={goal:"unlimited",budget:0,income:0,targetDamage:1,usePill:false,countDebuff:false,countCases:false,includeEconomyPoints:true,includeIncomeInBudget:true,lowConfidence:false,medianPrices:false,equipmentPricesIncludeTax:false,battleBonus:0,rankBonus:0,tax:0,muHealth:0,missFactor:.5,hitsPerItem:100,pillDebuffMalus:.6,regenPerHour:.1,pill:false,food:false,timeLimitMs:5000};
  const run=()=>{const iterator=optimizeDamageWithIncomeSteps(data,options,incomeOptions);let step=iterator.next();while(!step.done)step=iterator.next();return step.value;};
  assert.deepEqual(run(),run());
});
