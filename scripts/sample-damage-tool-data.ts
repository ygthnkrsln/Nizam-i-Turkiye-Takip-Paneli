import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

const userId=process.argv[2]||"68305110bbd6e3b4179f0110";
if(!/^[a-f\d]{24}$/i.test(userId))throw new Error("Pass a 24-character user ID.");
const apiKey=process.env.WARERA_API_KEY||process.env.WARERA_API_TOKEN||process.env.WARERA_API_TOKENS?.split(",")[0];
async function request(proc:string,input?:Record<string,unknown>){const post=proc==="user.getUserLite";const url=new URL(proc,"https://api2.warera.io/trpc/");if(input&&!post)url.searchParams.set("input",JSON.stringify(input));const response=await fetch(url,{method:post?"POST":"GET",headers:{Accept:"application/json",...(post?{"Content-Type":"application/json"}:{}),...(apiKey?{"X-API-Key":apiKey}:{})},body:post?JSON.stringify(input||{}):undefined});if(!response.ok)throw new Error(`${proc}: HTTP ${response.status}`);return response.json();}
function data(body:any){let value=body?.result?.data??body?.data??body;return value?.json??value;}
function write(name:string,value:any){return fs.writeFile(path.join("docs","api-samples",name),JSON.stringify(value,null,2)+"\n","utf8");}
await fs.mkdir("docs/api-samples",{recursive:true});
const [configRaw,pricesRaw,liteRaw,fullRaw,searchRaw,battlesRaw]=await Promise.all([request("gameConfig.getGameConfig"),request("itemTrading.getPrices"),request("user.getUserLite",{userId}),request("user.getUserById",{userId}),request("search.searchAnything",{searchText:userId}),request("battle.getBattles",{isActive:true,limit:100}).catch(()=>null)]);
const lite=data(liteRaw),full=data(fullRaw),config=data(configRaw),prices=data(pricesRaw),search=data(searchRaw);
const countryId=typeof lite?.country==="string"?lite.country:lite?.country?._id||lite?.countryId;
const countryRaw=countryId?await request("country.getCountryById",{countryId}):null;const country=data(countryRaw);
const militaryUnits=[full?.militaryUnits,full?.militaryUnit,full?.militaryUnitId,full?.mu,full?.muId].flatMap((value:any)=>Array.isArray(value)?value:value?[value]:[]);const muId=militaryUnits.map((value:any)=>value?._id||value?.id||value?.muId||value).find((value:any)=>/^[a-f\d]{24}$/i.test(String(value)));
const [muRaw,regionsRaw]=await Promise.all([muId?request("mu.getById",{muId:String(muId)}).catch(()=>null):Promise.resolve(null),request("region.getRegionsObject").catch(()=>null)]);const mu=data(muRaw),regions=data(regionsRaw),battles=data(battlesRaw);
const activeBattles=Array.isArray(battles)?battles:Object.values(battles||{}).filter((value:any)=>value&&typeof value==="object");const battle=activeBattles.find((value:any)=>value?.isActive!==false);const battleId=battle?._id||battle?.id;
const orderSamples=battleId?await Promise.all(["attacker","defender"].map(async side=>[side,data(await request("battleOrder.getByBattle",{battleId:String(battleId),side}).catch(()=>null))] as const)):[];
const idToken=(value:any,placeholder:string)=>value?placeholder:value;
const redactSide=(side:any)=>({country:idToken(side?.country,"<redacted-country-id>"),region:idToken(side?.region,"<redacted-region-id>"),countryOrders:Array.isArray(side?.countryOrders)?side.countryOrders.map(()=>"<redacted-country-id>"):undefined,muOrders:Array.isArray(side?.muOrders)?side.muOrders.map(()=>"<redacted-mu-id>"):undefined});
const battleSample=battle?{_id:"<redacted-battle-id>",isActive:battle.isActive,attacker:redactSide(battle.attacker),defender:redactSide(battle.defender)}:null;
const sanitizeOrders=(value:any):any=>{
  const rows=Array.isArray(value)?value:Array.isArray(value?.items)?value.items:Array.isArray(value?.data)?value.data:null;
  if(rows)return rows.map((row:any)=>({priority:row?.priority,level:row?.level,isActive:row?.isActive,damageBonusPercent:row?.damageBonusPercent,bonusPercent:row?.bonusPercent,countryId:row?.countryId?"<redacted-country-id>":undefined,muId:row?.muId?"<redacted-mu-id>":undefined,country:row?.country?"<redacted-country-id>":undefined,mu:row?.mu?"<redacted-mu-id>":undefined}));
  if(value&&typeof value==="object")return {shape:Object.keys(value)};
  return value;
};
const skills=["attack","precision","criticalChance","criticalDamages","armor","dodge","health","hunger","lootChance","energy","production","companies","management"];
const sample={
  "gameConfig.getGameConfig.json":{skills:Object.fromEntries(skills.filter(k=>config?.skills?.[k]).map(k=>[k,config.skills[k]])),battle:config?.battle,user:config?.user,mission:config?.mission,mu:config?.mu,items:Object.fromEntries(Object.entries(config?.items||{}).filter(([,item]:[string,any])=>item?.isTradable||["knife","gun","rifle","sniper","tank","jet","helmet1","chest1","pants1","boots1","gloves1"].includes(item?.code)).map(([k,v])=>[k,v])),upgradesConfig:{headquarters:config?.upgradesConfig?.headquarters,base:config?.upgradesConfig?.base}},
  "itemTrading.getPrices.json":prices,
  "user.getUserLite.json":{_id:"<redacted-user-id>",username:"<redacted>",leveling:lite?.leveling,militaryRank:lite?.militaryRank,country:countryId?"<redacted-country-id>":undefined,militaryUnits:lite?.militaryUnits?lite.militaryUnits.map(()=>"<redacted-mu-id>"):undefined,militaryUnit:lite?.militaryUnit?"<redacted-mu-id>":undefined,mu:lite?.mu?"<redacted-mu-id>":undefined},
  "user.getUserById.json":{_id:"<redacted-user-id>",username:"<redacted>",leveling:full?.leveling,militaryRank:full?.militaryRank,skills:full?.skills,country:"<redacted-country-id>",militaryUnits:Array.isArray(full?.militaryUnits)?full.militaryUnits.map(()=>"<redacted-mu-id>"):undefined,militaryUnit:full?.militaryUnit?"<redacted-mu-id>":undefined,militaryUnitId:full?.militaryUnitId?"<redacted-mu-id>":undefined,mu:full?.mu?"<redacted-mu-id>":undefined,muId:full?.muId?"<redacted-mu-id>":undefined},
  "search.searchAnything.json":{userIds:Array.isArray(search?.userIds)?search.userIds.map(()=>"<redacted-user-id>"):[],muIds:Array.isArray(search?.muIds)?search.muIds.map(()=>"<redacted-id>"):[],countryIds:Array.isArray(search?.countryIds)?search.countryIds.map(()=>"<redacted-id>"):[],hasData:Boolean(search?.hasData)},
  ...(country?{"country.getCountryById.json":{_id:"<redacted-country-id>",name:country.name,code:country.code,taxes:country.taxes,allianceId:country.allianceId?"<redacted-alliance-id>":undefined,enemy:country.enemy?"<redacted-country-id>":undefined,swornEnemy:country.swornEnemy?"<redacted-country-id>":undefined,warsWith:Array.isArray(country.warsWith)?country.warsWith.map(()=>"<redacted-country-id>"):undefined}}:{}),
  ...(battleSample?{"battle.getBattles.json":{items:[battleSample]}}:{}),
  ...(battleSample?{"battleOrder.getByBattle.json":Object.fromEntries(orderSamples.map(([side,value])=>[side,sanitizeOrders(value)]))}:{}),
  ...(mu?{"mu.getById.json":{_id:"<redacted-mu-id>",country:mu.country?"<redacted-country-id>":undefined,activeUpgradeLevels:mu.activeUpgradeLevels}}:{}),
  ...(regions?{"region.getRegionsObject.json":Array.isArray(regions)?regions.slice(0,3).map((region:any)=>({id:"<redacted-region-id>",name:region.name,country:"<redacted-country-id>",activeUpgradeLevels:region.activeUpgradeLevels,initialCountry:"<redacted-country-id>",isLinkedToCapital:region.isLinkedToCapital})):[]}:{}),
};
for(const [filename,body] of Object.entries(sample))await write(filename,body);
process.stdout.write(`Saved ${Object.keys(sample).length} sanitized response samples under docs/api-samples.\n`);
