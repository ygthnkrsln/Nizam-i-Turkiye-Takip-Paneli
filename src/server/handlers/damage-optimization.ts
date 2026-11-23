import { createClient } from "@supabase/supabase-js";
import { getWarEraTokens } from "../../lib/wareraTokens.js";
import { buildPlayerProfile, buildRules, unwrapTrpc } from "../../lib/damage/rules.js";

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
function getAnonSupabase() {
  const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const key=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
  if(!url||!key) throw Object.assign(new Error("Ekipman fiyatları için Supabase URL ve anon key ayarlanmamış."),{status:503});
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function getStatic(key:string,proc:string,ttl:number) { const saved=cached(key); if(saved)return saved; return remember(key,await trpc(proc),ttl); }
export default async function damageOptimizationHandler(req:any,res:any) {
  if(req.method!=="GET") return send(res,405,{error:"Method not allowed"});
  const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  const now=Date.now(); let entry=rate.get(ip); if(!entry||now-entry.start>60_000){entry={start:now,count:0};rate.set(ip,entry);} if(++entry.count>LIMIT){res.setHeader("Retry-After","60");return send(res,429,{error:"Çok sık istek gönderildi. Bir dakika sonra tekrar deneyin."});}
  const playerQuery=String(req.query?.player||"").trim().slice(0,100);
  if(!playerQuery||(!/^[a-f\d]{24}$/i.test(playerQuery)&&playerQuery.length<2)) return send(res,400,{error:"Geçerli bir oyuncu adı veya 24 haneli userId girin."});
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
    let marketTax:number|null=null;
    if(player.countryId){const country=unwrapTrpc<any>(await trpc("country.getCountryById",{countryId:player.countryId}).catch(()=>null)); marketTax=Number.isFinite(Number(country?.taxes?.market))?Number(country.taxes.market):null;}
    const equipCache=cached("damage:equipment"); let equipment:any[]; let equipmentUpdatedAt:string|null;
    if(equipCache){equipment=equipCache.rows;equipmentUpdatedAt=equipCache.updatedAt;}
    else {
      const client=getAnonSupabase();
      const columns=["equipment_name,quality,main_stat,critical_chance,cautious_price,median_price,confidence,n_used,source,updated_at","equipment_name,main_stat,critical_chance,cautious_price,median_price,confidence,n_used,source,updated_at","equipment_name,main_stat,critical_chance,cautious_price,updated_at","equipment_name,main_stat,cautious_price"];
      let data:any[]|null=null; let lastError:any=null;
      for(const select of columns){const result=await client.from("price_data").select(select).in("equipment_name",["boots","chest","gloves","gun","helmet","jet","knife","pants","rifle","sniper","tank"]).limit(1000);if(!result.error){data=result.data||[];lastError=null;break;}lastError=result.error;}
      if(lastError) throw Object.assign(new Error(`Ekipman fiyat tablosu okunamadı: ${lastError.message}`),{status:503});
      equipment=data||[]; equipmentUpdatedAt=equipment.map((r:any)=>r.updated_at).filter(Boolean).sort().at(-1)||null; remember("damage:equipment",{rows:equipment,updatedAt:equipmentUpdatedAt},10*60_000);
    }
    res.setHeader("Cache-Control","private, max-age=0, must-revalidate");
    return send(res,200,{rules,player,prices:unwrapTrpc<any>(priceRaw),marketTax,equipment,equipmentUpdatedAt,generatedAt:new Date().toISOString()});
  } catch(error:any) {
    const status=Number(error?.status)||500;
    return send(res,status,{error:error?.message||"Hasar optimizasyonu verileri alınamadı.",code:status===401?"UNAUTHORIZED":status===429?"RATE_LIMITED":undefined});
  }
}
