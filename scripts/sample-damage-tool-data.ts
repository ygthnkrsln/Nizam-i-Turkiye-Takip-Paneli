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
const [configRaw,pricesRaw,liteRaw,fullRaw,searchRaw]=await Promise.all([request("gameConfig.getGameConfig"),request("itemTrading.getPrices"),request("user.getUserLite",{userId}),request("user.getUserById",{userId}),request("search.searchAnything",{searchText:userId})]);
const lite=data(liteRaw),full=data(fullRaw),config=data(configRaw),prices=data(pricesRaw),search=data(searchRaw);
const countryId=typeof lite?.country==="string"?lite.country:lite?.country?._id||lite?.countryId;
const countryRaw=countryId?await request("country.getCountryById",{countryId}):null;const country=data(countryRaw);
const skills=["attack","precision","criticalChance","criticalDamages","armor","dodge","health","hunger","lootChance","energy","production","companies","management"];
const sample={
  "gameConfig.getGameConfig.json":{skills:Object.fromEntries(skills.filter(k=>config?.skills?.[k]).map(k=>[k,config.skills[k]])),battle:config?.battle,user:config?.user,mu:config?.mu,items:Object.fromEntries(["lightAmmo","ammo","heavyAmmo","cocain","bread","steak","cookedFish","knife","gun","rifle","sniper","tank","jet","helmet1","chest1","pants1","boots1","gloves1"].filter(k=>config?.items?.[k]).map(k=>[k,config.items[k]])),upgradesConfig:{headquarters:config?.upgradesConfig?.headquarters,base:config?.upgradesConfig?.base}},
  "itemTrading.getPrices.json":Object.fromEntries(["lightAmmo","ammo","heavyAmmo","bread","steak","cookedFish","case1","case2","cocain","scraps"].filter(k=>prices?.[k]!=null).map(k=>[k,prices[k]])),
  "user.getUserLite.json":{_id:"<redacted-user-id>",username:"<redacted>",leveling:lite?.leveling,militaryRank:lite?.militaryRank,country:countryId?"<redacted-country-id>":undefined},
  "user.getUserById.json":{_id:"<redacted-user-id>",username:"<redacted>",leveling:full?.leveling,militaryRank:full?.militaryRank,skills:full?.skills,country:"<redacted-country-id>"},
  "search.searchAnything.json":{userIds:Array.isArray(search?.userIds)?search.userIds.map(()=>"<redacted-user-id>"):[],muIds:Array.isArray(search?.muIds)?search.muIds.map(()=>"<redacted-id>"):[],countryIds:Array.isArray(search?.countryIds)?search.countryIds.map(()=>"<redacted-id>"):[],hasData:Boolean(search?.hasData)},
  ...(country?{"country.getCountryById.json":{_id:"<redacted-country-id>",name:country.name,code:country.code,taxes:country.taxes}}:{}),
};
for(const [filename,body] of Object.entries(sample))await write(filename,body);
process.stdout.write(`Saved ${Object.keys(sample).length} sanitized response samples under docs/api-samples.\n`);
