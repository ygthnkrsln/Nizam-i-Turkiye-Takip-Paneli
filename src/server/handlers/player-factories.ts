// Vercel Serverless Function: GET /api/player-factories
// Fetches player factories on demand

import { getNextWarEraToken } from "../../lib/wareraTokens.js";

async function fetchWarEra(url: string, init?: RequestInit): Promise<Response> {
  const token = getNextWarEraToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-API-Key": token,
    ...((init?.headers as Record<string, string>) || {}),
  };
  return fetch(url, { ...init, headers });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const userId = req.query?.userId as string;
  if (!userId) {
    return res
      .status(400)
      .json({ success: false, error: "userId is required" });
  }

  try {
    const allItems: string[] = [];
    let cursor: string | undefined = undefined;

    for (let page = 0; page < 5; page++) {
      const inputObj: Record<string, any> = { userId, perPage: 100 };
      if (cursor) inputObj.cursor = cursor;

      const cUrl = `https://api2.warera.io/trpc/company.getCompanies?input=${encodeURIComponent(
        JSON.stringify(inputObj),
      )}`;
      const cRes = await fetchWarEra(cUrl);
      if (!cRes.ok) break;

      const cJson = await cRes.json();
      const pageItems: string[] = cJson?.result?.data?.items || [];
      if (pageItems.length === 0) break;

      allItems.push(...pageItems);
      if (pageItems.length < 100) break;
      cursor = pageItems[pageItems.length - 1];
    }

    const factories: any[] = [];
    let totalAutomatedLevel = 0;

    for (let i = 0; i < allItems.length; i += 50) {
      const chunk = allItems.slice(i, i + 50);
      const batchInput: Record<string, { companyId: string }> = {};
      chunk.forEach((id, idx) => {
        batchInput[String(idx)] = { companyId: id };
      });

      const batchUrl = `https://api2.warera.io/trpc/${chunk.map(() => "company.getById").join(",")}?batch=1&input=${encodeURIComponent(
        JSON.stringify(batchInput),
      )}`;
      const bRes = await fetchWarEra(batchUrl);
      if (bRes.ok) {
        const bJson = await bRes.json();
        const batchResults = Array.isArray(bJson) ? bJson : [bJson];
        batchResults.forEach((item: any) => {
          const d = item?.result?.data;
          const autoLevel = Number(
            d?.activeUpgradeLevels?.automatedEngine ??
              d?.upgradesV2?.upgrades?.automatedEngine?.level ??
              0,
          );
          totalAutomatedLevel += autoLevel;
          factories.push({
            id: d?._id || "",
            name: d?.name || "Fabrika",
            itemCode: d?.itemCode || "weapon",
            production: Number(
              d?.productionRatePerHour ?? d?.stats?.production ?? 0,
            ),
            automatedLevel: autoLevel,
            storageLevel: Number(d?.activeUpgradeLevels?.storage ?? 1),
            workerCount: Array.isArray(d?.workers)
              ? d.workers.length
              : Number(d?.workerCount || 0),
            region: d?.region || "TR-06",
          });
        });
      }
    }

    return res.json({
      success: true,
      userId,
      factoryCount: factories.length,
      totalAutomatedLevel,
      factories,
    });
  } catch (err: any) {
    return res
      .status(500)
      .json({
        success: false,
        error: err.message || "Failed fetching player factories",
      });
  }
}
