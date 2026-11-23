import { getWarEraTokens } from "../../lib/wareraTokens.js";
import { getSupabaseClient } from "../../lib/supabaseStorage.js";
import { buildPlayerProfile, buildRules, unwrapTrpc } from "../../lib/damage/rules.js";
import { assessBattleBonuses, marketTaxToPercent } from "../../lib/damage/battleBonuses.js";

const BASE = "https://api2.warera.io/trpc/";
const cache = new Map<string, { until: number; value: any }>();
const rate = new Map<string, { start: number; count: number }>();
const LIMIT = 4;
function send(res: any, status: number, body: any) { return res.status(status).json(body); }
function cached(key: string) { const row=cache.get(key); return row && row.until>Date.now()?row.value:null; }
function remember(key: string, value: any, ttl: number) { cache.set(key,{value,until:Date.now()+ttl}); return value; }
async function trpc(proc: string, input?: Record<string, unknown>) {
  const tokens=Array.from(new Set([process.env.WARERA_API_KEY || "", ...getWarEraTokens()].map(x=>x.trim()).filter(Boolean)));
  const usePost=proc==="user.getUserLite";
  const url=new URL(proc,BASE); if(input&&!usePost) url.searchParams.set("input",JSON.stringify(input));
  let response:Response|undefined;let lastError:any;
  for(const token of (tokens.length?tokens:[""])) {
    let rotate=false;
    for(let attempt=0;attempt<3;attempt++) {
      const headers:Record<string,string>={Accept:"application/json"}; if(token) headers["X-API-Key"]=token; if(usePost)headers["Content-Type"]="application/json";
      try{response=await fetch(url,{method:usePost?"POST":"GET",headers,body:usePost?JSON.stringify(input||{}):undefined,signal:AbortSignal.timeout(12_000)});}
      catch(error){lastError=error;if(attempt<2){await new Promise(r=>setTimeout(r,300*2**attempt));continue;}throw error;}
      if(response.ok) return response.json();
      if((response.status===401||response.status===403)&&tokens.length>1){rotate=true;break;}
      if(![408,409,425,429,500,502,503,504].includes(response.status)||attempt===2) break;
      const retryAfter=Number(response.headers.get("retry-after"));await new Promise(r=>setTimeout(r,Math.min(5000,retryAfter>0?retryAfter*1000:400*2**attempt)));
    }
    if(!rotate)break;
  }
  if(!response?.ok) { const error=new Error(`WarEra API isteği başarısız (${response?.status || 502}).`); (error as any).status=response?.status||502; throw error; }
  if(lastError)throw lastError;
  return response.json();
}
async function trpcBatch(proc:string,inputs:Record<string,unknown>[]) {
  const ids=inputs.map((_,index)=>String(index));const url=new URL(ids.map(()=>proc).join(","),BASE);url.searchParams.set("batch","1");url.searchParams.set("input",JSON.stringify(Object.fromEntries(inputs.map((input,index)=>[String(index),input]))));
  const token=process.env.WARERA_API_KEY||getWarEraTokens()[0]||"";const headers:Record<string,string>={Accept:"application/json"};if(token)headers["X-API-Key"]=token;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(12_000)});
  if(!response.ok)throw Object.assign(new Error(`WarEra API isteği başarısız (${response.status}).`),{status:response.status});
  const body=await response.json();if(!Array.isArray(body))throw new Error("WarEra toplu yanıtı beklenen biçimde değil.");return body.map((entry:any)=>unwrapTrpc(entry));
}
async function getStatic(key:string,proc:string,ttl:number,input?:Record<string,unknown>) { const saved=cached(key); if(saved)return saved; return remember(key,await trpc(proc,input),ttl); }
function listOf(value:any):any[] {
  const data=unwrapTrpc<any>(value);
  if(Array.isArray(data))return data;
  if(Array.isArray(data?.items))return data.items;
  if(Array.isArray(data?.data))return data.data;
  if(data&&typeof data==="object")return Object.values(data).filter(item=>item&&typeof item==="object");
  return [];
}
const idOf=(value:any):string=>String(value?._id||value?.id||value?.muId||value?.countryId||(typeof value==="string"?value:""));
function parseUnitIds(profile:any):string[] {
  return Array.from(new Set([profile?.militaryUnits,profile?.militaryUnit,profile?.militaryUnitId,profile?.mu,profile?.muId].flatMap((value:any)=>Array.isArray(value)?value:value?[value]:[]).map(idOf).filter((id:string)=>/^[a-f\d]{24}$/i.test(id))));
}
function normalizeOrders(value:any):any[] { return listOf(value).filter(row=>row&&typeof row==="object"); }
function orderPayloadKnown(result:any, side:any):boolean {
  if(Array.isArray(side?.countryOrders)||Array.isArray(side?.muOrders))return true;
  if(result?.status!=="fulfilled")return false;
  const value=unwrapTrpc<any>(result.value);
  return Array.isArray(value)||Boolean(value&&typeof value==="object"&&(Array.isArray(value.items)||Array.isArray(value.data)));
}
async function loadBattleContext(player:any,homeCountry:any,rules:any,battleId:string) {
  const countryId=player.countryId;const allianceId=String(homeCountry?.allianceId||homeCountry?.alliance?._id||homeCountry?.alliance?.id||"");
  const [battleResult,countryBattlesResult,countriesResult,regionsResult]=await Promise.allSettled([
    getStatic("damage:battles","battle.getBattles",60_000,{isActive:true,limit:100}),
    countryId?getStatic(`damage:battles:country:${countryId}`,"battle.getBattles",60_000,{countryId,isActive:true,limit:50}):Promise.resolve([]),
    getStatic("damage:countries","country.getAllCountries",5*60_000),
    getStatic("damage:regions","region.getRegionsObject",5*60_000),
  ]);
  const battleRows=[...(battleResult.status==="fulfilled"?listOf(battleResult.value):[]),...(countryBattlesResult.status==="fulfilled"?listOf(countryBattlesResult.value):[])];
  const battles=Array.from(new Map(battleRows.filter(row=>row?.isActive!==false).map(row=>[idOf(row),row])).values());
  const countries=countriesResult.status==="fulfilled"?listOf(countriesResult.value):[];
  const countryMap=new Map(countries.map(country=>[idOf(country),country]));
  if(homeCountry&&countryId)countryMap.set(countryId,homeCountry);
  const regions=regionsResult.status==="fulfilled"?listOf(regionsResult.value):[];
  const regionMap=new Map(regions.map(region=>[idOf(region),region]));
  const muRows=await Promise.all((player.militaryUnitIds||[]).map((muId:string)=>getStatic(`damage:mu:${muId}`,"mu.getById",6*60_000,{muId}).then(unwrapTrpc<any>).catch(()=>null)));
  const muMap=new Map(muRows.filter(Boolean).map((mu:any,index:number)=>[idOf(mu)||player.militaryUnitIds[index],mu]));
  const alliedIds=new Set([countryId,...(allianceId?countries.filter(country=>String(country?.allianceId||country?.alliance?._id||country?.alliance?.id||"")===allianceId).map(idOf):[])].filter(Boolean));
  const enemyIds=new Set([homeCountry?.enemy,homeCountry?.swornEnemy,...(Array.isArray(homeCountry?.warsWith)?homeCountry.warsWith:[])].map(idOf).filter(Boolean));
  const playerMuIds=new Set<string>(player.militaryUnitIds||[]);
  const relevant=battles.filter(battle=>{
    const a=idOf(battle?.attacker?.country);const d=idOf(battle?.defender?.country);
    const muOrders=[...(Array.isArray(battle?.attacker?.muOrders)?battle.attacker.muOrders:[]),...(Array.isArray(battle?.defender?.muOrders)?battle.defender.muOrders:[])].map(idOf);
    return alliedIds.has(a)||alliedIds.has(d)||enemyIds.has(a)||enemyIds.has(d)||muOrders.some((id:string)=>playerMuIds.has(id));
  });
  const activeBattles=relevant.map(battle=>{
    const attackerId=idOf(battle?.attacker?.country);const defenderId=idOf(battle?.defender?.country);
    const attacker=countryMap.get(attackerId);const defender=countryMap.get(defenderId);
    const region=regionMap.get(idOf(battle?.attacker?.region))||regionMap.get(idOf(battle?.defender?.region));
    return {id:idOf(battle),label:`${attacker?.name||attackerId||"?"} vs ${defender?.name||defenderId||"?"}${region?.name?` · ${region.name}`:""}`,attackerId,defenderId,attackerRegionId:idOf(battle?.attacker?.region),defenderRegionId:idOf(battle?.defender?.region)};
  }).filter(row=>row.id);
  const hqLevel=Math.max(0,...muRows.map((mu:any)=>Number(mu?.activeUpgradeLevels?.headquarters)||0));
  // HQ damage only applies when the corresponding unit is ordered into this
  // selected battle. Without a battle, keep the legacy manual behavior.
  if(!battleId)return {activeBattles,battleAnalysis:null,headquartersLevel:0,headquartersSource:"elle"};
  const battle=relevant.find(row=>idOf(row)===battleId);
  if(!battle)return {activeBattles,battleAnalysis:null,headquartersLevel:hqLevel,headquartersSource:hqLevel?"API":"elle"};
  const [attackerOrdersResult,defenderOrdersResult]=await Promise.allSettled(["attacker","defender"].map(side=>getStatic(`damage:orders:${battleId}:${side}`,"battleOrder.getByBattle",30_000,{battleId,side})));
  const ordersBySide={attacker:attackerOrdersResult.status==="fulfilled"?normalizeOrders(attackerOrdersResult.value):[],defender:defenderOrdersResult.status==="fulfilled"?normalizeOrders(defenderOrdersResult.value):[]};
  const attackerId=idOf(battle?.attacker?.country);const defenderId=idOf(battle?.defender?.country);
  const attackerOwn=attackerId===countryId;const defenderOwn=defenderId===countryId;
  const attackerHasMyMu=(Array.isArray((battle as any)?.attacker?.muOrders)?(battle as any).attacker.muOrders:[]).map(idOf).some((id:string)=>playerMuIds.has(id));
  const defenderHasMyMu=(Array.isArray((battle as any)?.defender?.muOrders)?(battle as any).defender.muOrders:[]).map(idOf).some((id:string)=>playerMuIds.has(id));
  const friendlySide=attackerOwn||defenderOwn?attackerOwn?"attacker":"defender":alliedIds.has(attackerId)||attackerHasMyMu?"attacker":alliedIds.has(defenderId)||defenderHasMyMu?"defender":null;
  const relations=homeCountry||{};
  const allianceKnown=["allianceId","alliance"].some(key=>Object.prototype.hasOwnProperty.call(relations,key));
  const enemyListKnown=["enemy","swornEnemy","warsWith"].some(key=>Object.prototype.hasOwnProperty.call(relations,key));
  const bonusChecks=assessBattleBonuses({playerCountryId:countryId,playerAllianceId:allianceId,enemyCountryIds:Array.from(enemyIds),playerMuIds:player.militaryUnitIds||[],battle,countriesById:Object.fromEntries(countryMap),ordersBySide,ordersKnown:{attacker:orderPayloadKnown(attackerOrdersResult,(battle as any)?.attacker),defender:orderPayloadKnown(defenderOrdersResult,(battle as any)?.defender)},allianceKnown,enemyListKnown,configuredBonuses:rules.battle});
  const unitOrder=bonusChecks.find((item)=>item.key==="muOrderBonusPercent")?.enabled||false;
  const selectedSide=(countryId===attackerId||alliedIds.has(attackerId)||attackerHasMyMu?"attacker":countryId===defenderId||alliedIds.has(defenderId)||defenderHasMyMu?"defender":null) as "attacker"|"defender"|null;
  const selectedOrders=selectedSide?ordersBySide[selectedSide]:[];
  const orderedMuIds=new Set<string>([
    ...(selectedSide&&Array.isArray((battle as any)?.[selectedSide]?.muOrders)?(battle as any)[selectedSide].muOrders:[]).map(idOf),
    ...selectedOrders.map((order:any)=>idOf(order?.muId||order?.mu)),
  ].filter(Boolean));
  const orderedHqLevel=Math.max(0,...Array.from(orderedMuIds).filter((id)=>playerMuIds.has(id)).map((id)=>Number(muMap.get(id)?.activeUpgradeLevels?.headquarters)||0));
  const attackerRegion=regionMap.get(idOf(battle?.attacker?.region));const defenderRegion=regionMap.get(idOf(battle?.defender?.region));
  const baseLevel=friendlySide==="attacker"?Number(attackerRegion?.activeUpgradeLevels?.base)||0:0;
  return {activeBattles,battleAnalysis:{battleId,bonuses:bonusChecks,headquartersLevel:unitOrder?orderedHqLevel:0,headquartersSource:unitOrder&&orderedHqLevel?"API":"elle",baseLevel,baseSource:baseLevel?"API":"elle",attacker:attackerId,defender:defenderId},headquartersLevel:hqLevel,headquartersSource:hqLevel?"API":"elle"};
}
function normalizeEquipmentName(value:unknown):string|null {
  const name=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("tr").trim();
  if(/\b(bot|boots?)\b/.test(name))return "boots";
  if(/\b(eldiven|gloves?)\b/.test(name))return "gloves";
  if(/\b(kask|helmet)\b/.test(name))return "helmet";
  if(/\b(pantolon|pants?)\b/.test(name))return "pants";
  if(/\b(gogusluk|gogus zirhi|chest)\b/.test(name))return "chest";
  if(/\b(knife|bicak)\b/.test(name))return "knife";
  if(/\b(gun|pistol|tabanca)\b/.test(name))return "gun";
  if(/\b(rifle|tufek)\b/.test(name)&&/keskin nisanci|sniper/.test(name))return "sniper";
  if(/\b(rifle|tufek)\b/.test(name))return "rifle";
  if(/\b(sniper|tank|jet)\b/.test(name))return name.match(/\b(sniper|tank|jet)\b/)?.[1]||null;
  return null;
}
export default async function damageOptimizationHandler(req:any,res:any) {
  if(req.method!=="GET") return send(res,405,{error:"Method not allowed"});
  const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  const now=Date.now(); let entry=rate.get(ip); if(!entry||now-entry.start>60_000){entry={start:now,count:0};rate.set(ip,entry);} if(++entry.count>LIMIT){res.setHeader("Retry-After","60");return send(res,429,{error:"Çok sık istek gönderildi. Bir dakika sonra tekrar deneyin."});}
  const playerQuery=String(req.query?.player||"").trim().slice(0,100);
  if(!playerQuery||(!/^[a-f\d]{24}$/i.test(playerQuery)&&playerQuery.length<2)) return send(res,400,{error:"Geçerli bir oyuncu adı veya 24 haneli userId girin."});
  const battleId=String(req.query?.battleId||"").trim();
  if(battleId&&!/^[a-f\d]{24}$/i.test(battleId)) return send(res,400,{error:"Geçerli bir savaş ID'si gerekli."});
  try {
    const isId=/^[a-f\d]{24}$/i.test(playerQuery);
    let lite:any;let resolvedFull:any=null;
    // getUserById already includes leveling and the complete skill profile. Use
    // that single live profile for ID lookups instead of calling getUserLite
    // first and fetching the same leveling data again.
    if(isId) {
      resolvedFull=await trpc("user.getUserById",{userId:playerQuery});
      lite=resolvedFull;
    }
    else {
      const matches=unwrapTrpc<any>(await trpc("search.searchAnything",{searchText:playerQuery}));
      const ids=Array.isArray(matches?.userIds)?matches.userIds.slice(0,50):[];
      const profiles=ids.length?await trpcBatch("user.getUserById",ids.map((userId:string)=>({userId}))):[];
      resolvedFull=profiles.find((profile:any)=>String(profile?.username||"").toLocaleLowerCase("tr")==playerQuery.toLocaleLowerCase("tr"));
      lite=resolvedFull;
      if(!resolvedFull) return send(res,404,{error:"Bu adla eşleşen oyuncu bulunamadı. Adın tam yazıldığından emin olun."});
    }
    const liteData=unwrapTrpc<any>(lite); if(!liteData?._id)return send(res,404,{error:"Oyuncu bulunamadı."});
    const [fullRaw,configRaw,priceRaw]=await Promise.all([resolvedFull||trpc("user.getUserById",{userId:liteData._id}),getStatic("damage:config","gameConfig.getGameConfig",6*60*60_000),getStatic("damage:prices","itemTrading.getPrices",5*60_000)]);
    const rules=buildRules(configRaw); const player=buildPlayerProfile(lite,fullRaw,rules);
    let marketTax:number|null=null;let homeCountry:any=null;
    if(player.countryId){homeCountry=unwrapTrpc<any>(await getStatic(`damage:country:${player.countryId}`,"country.getCountryById",5*60_000,{countryId:player.countryId}).catch(()=>null)); marketTax=marketTaxToPercent(homeCountry?.taxes?.market,"ratio");}
    const battleContext=await loadBattleContext(player,homeCountry,rules,battleId).catch(()=>({activeBattles:[],battleAnalysis:null,headquartersLevel:0,headquartersSource:"elle"}));
    const equipCache=cached("damage:equipment"); let equipment:any[]; let equipmentUpdatedAt:string|null;
    if(equipCache){equipment=equipCache.rows;equipmentUpdatedAt=equipCache.updatedAt;}
    else {
      // This handler runs only on the server. Reuse the app's server-side
      // Supabase client so price_data reads do not depend on a public anon
      // SELECT policy; privileged credentials never leave this endpoint.
      const client=getSupabaseClient();
      if(!client) throw Object.assign(new Error("Ekipman fiyatları için Supabase bağlantısı yapılandırılmamış."),{status:503});
      const rows:any[]=[];const pageSize=1000;
      for(let from=0;;from+=pageSize){
        const {data,error}=await client.from("price_data").select("id,equipment_name,main_stat,critical_chance,cautious_price,updated_at").not("cautious_price","is",null).order("id",{ascending:true}).range(from,from+pageSize-1);
        if(error) throw Object.assign(new Error(`Ekipman fiyat tablosu okunamadı: ${error.message}`),{status:503});
        const page=data||[];
        rows.push(...page);
        if(page.length<pageSize)break;
      }
      equipment=rows.flatMap((row:any)=>{
        const equipmentName=normalizeEquipmentName(row.equipment_name);
        if(!equipmentName)return [];
        return [{equipment_name:equipmentName,quality:null,main_stat:row.main_stat==null?null:Number(row.main_stat),critical_chance:row.critical_chance==null?null:Number(row.critical_chance),cautious_price:row.cautious_price==null?null:Number(row.cautious_price),median_price:null,confidence:"medium",source:"observed",updated_at:row.updated_at||null}];
      });
      equipmentUpdatedAt=rows.map((r:any)=>r.updated_at).filter(Boolean).sort().at(-1)||null;
      remember("damage:equipment",{rows:equipment,updatedAt:equipmentUpdatedAt},10*60_000);
    }
    res.setHeader("Cache-Control","private, max-age=0, must-revalidate");
    return send(res,200,{rules,player,prices:unwrapTrpc<any>(priceRaw),marketTax,marketTaxRaw:homeCountry?.taxes?.market??null,marketTaxSource:marketTax===null?null:"country.taxes.market",rankBonus:player.rankBonusPercent,rankBonusSource:player.rankBonusPercent===null?`API askeri rütbe değeri (${player.militaryRank}) dışında yüzde bonus vermiyor`:`API: user.getUserById.skills.attack.militaryRankPercent`,activeBattles:battleContext.activeBattles,battleAnalysis:battleContext.battleAnalysis,headquartersLevel:battleContext.headquartersLevel,headquartersSource:battleContext.headquartersSource,equipment,equipmentUpdatedAt,generatedAt:new Date().toISOString()});
  } catch(error:any) {
    const status=Number(error?.status)||500;
    return send(res,status,{error:error?.message||"Hasar optimizasyonu verileri alınamadı.",code:status===401?"UNAUTHORIZED":status===429?"RATE_LIMITED":undefined});
  }
}
