import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";

const TURKEY_ID = "6813b6d446e731854c7ac7eb";
const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_MS = 3 * 60 * 60 * 1000;
const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function gameDayKey(timestamp: number) {
  return new Date(timestamp - RESET_MS).toISOString().slice(0, 10);
}

async function fetchWarEra(url: string) {
  const tokens = getWarEraTokens();
  if (!tokens.length) throw new Error("WarEra API anahtarı yapılandırılmamış");
  const first = getNextWarEraToken();
  const start = Math.max(0, tokens.indexOf(first));
  let response: Response | null = null;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[(start + index) % tokens.length];
    response = await fetch(url, { headers: { Accept: "application/json", "X-API-Key": token } });
    if (response.ok || ![401, 403, 429].includes(response.status)) return response;
  }
  return response!;
}

function unpack(payload: any) {
  return payload?.result?.data?.json ?? payload?.result?.data ?? payload;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });

  const forceRefresh = req.query?.refresh === "true";
  const cached = cache.get("turkey");
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  try {
    const cutoff = Date.now() - 30 * DAY_MS;
    let cursor: string | null = null;
    const raw: any[] = [];
    for (let page = 0; page < 20; page++) {
      const input = { countryId: TURKEY_ID, limit: 100, ...(cursor ? { cursor } : {}) };
      const url = `https://api2.warera.io/trpc/transaction.getPaginatedTransactions?input=${encodeURIComponent(JSON.stringify(input))}`;
      const response = await fetchWarEra(url);
      if (!response.ok) {
        const error = new Error(`WarEra işlem verileri alınamadı (${response.status})`);
        (error as any).statusCode = response.status;
        throw error;
      }
      const data = unpack(await response.json());
      const items = Array.isArray(data?.items) ? data.items : [];
      raw.push(...items);
      cursor = data?.nextCursor ? String(data.nextCursor) : null;
      const oldest = items.reduce((min: number, item: any) => {
        const time = new Date(item?.createdAt || 0).getTime();
        return Number.isFinite(time) ? Math.min(min, time) : min;
      }, Number.POSITIVE_INFINITY);
      if (!cursor || !items.length || oldest < cutoff) break;
    }

    const byId = new Map<string, any>();
    for (const tx of raw) {
      const id = String(tx?._id || [tx?.createdAt, tx?.transactionType, tx?.buyerId, tx?.sellerId,
        tx?.sellerCountryId, tx?.sellerMuId, tx?.itemCode, tx?.money].join("-"));
      byId.set(id, tx);
    }
    const transactions = Array.from(byId.entries()).map(([id, tx]: [string, any]) => {
      const type = String(tx?.transactionType || tx?.type || "unknown");
      const amount = Number(tx?.money ?? tx?.amount ?? tx?.value ?? 0);
      const sellerCountryId = String(tx?.sellerCountryId || "");
      const buyerCountryId = String(tx?.buyerCountryId || "");
      let flow = 0;
      let category = "Diğer";
      let direction = "—";
      if (type === "donation") {
        category = "Bağış";
        if (sellerCountryId === TURKEY_ID) { flow = amount; direction = "Giriş"; }
        else if (buyerCountryId === TURKEY_ID) { flow = -amount; direction = "Çıkış"; }
      } else if (type === "countryMoneyTransfer") {
        category = "Ülkeler arası transfer";
        if (buyerCountryId === TURKEY_ID) { flow = amount; direction = "Giriş"; }
        else if (sellerCountryId === TURKEY_ID) { flow = -amount; direction = "Çıkış"; }
      } else if (["trading", "itemMarket"].includes(type) && sellerCountryId === TURKEY_ID) {
        category = "Piyasa satışı";
        direction = "Satış";
      }
      const createdAt = String(tx?.createdAt || "");
      return {
        id: String(tx?._id || id), createdAt, type, category, direction,
        amount: Number.isFinite(amount) ? amount : 0,
        flow: Number.isFinite(flow) ? flow : 0,
        player: String(tx?.buyerName || tx?.buyerUsername || tx?.buyerId || tx?.sellerName || ""),
        counterparty: String(tx?.buyerCountryName || tx?.sellerCountryName || tx?.sellerMuName || ""),
      };
    }).filter((tx: any) => {
      const at = new Date(tx.createdAt).getTime();
      return Number.isFinite(at) && at >= cutoff;
    }).sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

    const now = Date.now();
    const days = Array.from({ length: 14 }, (_, index) => {
      const key = gameDayKey(now - (13 - index) * DAY_MS);
      return { day: key, donationsIn: 0, donationsOut: 0, transfersIn: 0, transfersOut: 0, marketSales: 0, netFlow: 0 };
    });
    const dayMap = new Map<string, (typeof days)[number]>();
    days.forEach((day) => dayMap.set(day.day, day));
    const donors = new Map<string, number>();
    let donations7d = 0;
    let donations30d = 0;
    let transfersIn7d = 0;
    let transfersOut7d = 0;
    let sales24h = 0;
    let sales7d = 0;
    let donationOut7d = 0;
    for (const tx of transactions) {
      const at = new Date(tx.createdAt).getTime();
      const day = dayMap.get(gameDayKey(at));
      if (day) {
        day.netFlow += tx.flow;
        if (tx.type === "donation" && tx.flow > 0) day.donationsIn += tx.amount;
        else if (tx.type === "donation" && tx.flow < 0) day.donationsOut -= tx.amount;
        else if (tx.type === "countryMoneyTransfer" && tx.flow > 0) day.transfersIn += tx.amount;
        else if (tx.type === "countryMoneyTransfer" && tx.flow < 0) day.transfersOut -= tx.amount;
        else if (tx.category === "Piyasa satışı") day.marketSales += tx.amount;
      }
      if (tx.type === "donation" && tx.flow > 0) {
        donations30d += tx.amount;
        if (at >= now - 7 * DAY_MS) donations7d += tx.amount;
        if (tx.player) donors.set(tx.player, (donors.get(tx.player) || 0) + tx.amount);
      }
      if (tx.type === "donation" && tx.flow < 0 && at >= now - 7 * DAY_MS) donationOut7d += tx.amount;
      if (tx.type === "countryMoneyTransfer" && tx.flow > 0 && at >= now - 7 * DAY_MS) transfersIn7d += tx.amount;
      if (tx.type === "countryMoneyTransfer" && tx.flow < 0 && at >= now - 7 * DAY_MS) transfersOut7d += tx.amount;
      if (tx.category === "Piyasa satışı") {
        if (at >= now - DAY_MS) sales24h += tx.amount;
        if (at >= now - 7 * DAY_MS) sales7d += tx.amount;
      }
    }
    const result = {
      success: true,
      fetchedAt: new Date(now).toISOString(),
      country: "Türkiye",
      transactions,
      days,
      totals: { donations7d, donations30d, donationOut7d, transfersIn7d, transfersOut7d, sales24h, sales7d,
        netFlow7d: donations7d - donationOut7d + transfersIn7d - transfersOut7d,
        donors: donors.size,
      },
      topDonors: Array.from(donors, ([player, amount]) => ({ player, amount })).sort((a, b) => b.amount - a.amount).slice(0, 20),
      note: "Bağış ve ülke transferleri hazine hareketi olarak sayılır. Piyasa satışları bilgi amaçlıdır; brüt satış tutarı hazineye eklenmez.",
    };
    cache.set("turkey", { timestamp: now, data: result });
    return res.status(200).json(result);
  } catch (error: any) {
    const status = error?.statusCode === 401 || error?.statusCode === 403
      ? 503
      : error?.statusCode === 429 ? 429 : 502;
    return res.status(status).json({
      success: false,
      error: error?.message || "Hazine verileri yüklenemedi",
    });
  }
}
