import { getNextWarEraToken, getWarEraTokens } from "../../lib/wareraTokens.js";
import { TRACKED_ARMIES } from "../../config/trackedArmies.js";
import { getTransactionItems } from "../../utils/wareraTransactions.js";

const COUNTRY_DETAILS: Record<string, { name: string; code: string }> = {
  "683ddd2c24b5a2e114af15b5": { name: "Birleşik Arap Emirlikleri", code: "AE" },
  "6813b6d446e731854c7ac7eb": { name: "Türkiye", code: "TR" },
  "6813b6d546e731854c7ac8d1": { name: "Azerbaycan", code: "AZ" },
  "6873d0ea1758b40e712b5ef5": { name: "Kamerun", code: "CM" },
};
const ARMY_DETAILS = new Map(
  TRACKED_ARMIES.map(({ id, name, avatarUrl }) => [id, { name, avatarUrl }]),
);

async function fetchTransactions(userId: string, userToken?: string) {
  const input = { limit: 7, userId, transactionType: "donation" };
  const url = `https://api2.warera.io/trpc/transaction.getPaginatedTransactions?input=${encodeURIComponent(JSON.stringify(input))}`;
  const tokens = Array.from(new Set([
    userToken?.trim() || "",
    getNextWarEraToken(),
    ...getWarEraTokens(),
  ].filter(Boolean)));
  if (tokens.length === 0) throw new Error("WarEra API anahtarı yapılandırılmamış");

  let response: Response | undefined;
  for (const token of tokens) {
    response = await fetch(url, {
      headers: { Accept: "application/json", "X-API-Key": token },
    });
    if (response.ok || (response.status !== 401 && response.status !== 403 && response.status !== 429)) break;
  }
  if (!response?.ok) throw new Error(`WarEra transactions returned HTTP ${response?.status || 502} for ${userId}`);

  const payload = await response.json();
  const items = getTransactionItems(payload);
  if (!items) throw new Error(`WarEra returned an invalid transactions response for ${userId}`);

  return items
    .filter((item: any) => !item.buyerId || item.buyerId === userId)
    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 7)
    .map((item: any, index: number) => {
      const armyId = String(item.sellerMuId || "");
      const countryId = String(item.sellerCountryId || "");
      const army = ARMY_DETAILS.get(armyId);
      const country = COUNTRY_DETAILS[countryId];
      const isArmy = Boolean(armyId);
      return {
        id: String(item._id || `${userId}-${index}`),
        amount: Number(item.money) || 0,
        currency: "Gold",
        timestamp: item.createdAt || "",
        type: item.transactionType || "donation",
        target: isArmy ? "mu" : "country",
        targetName: isArmy ? army?.name || "Askeri Birlik" : country?.name || "Ülke",
        targetAvatarUrl: isArmy ? army?.avatarUrl : undefined,
        countryCode: isArmy ? undefined : country?.code,
      };
    });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-User-Api-Key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  const userIds: string[] = Array.isArray(req.body?.userIds)
    ? [...new Set((req.body.userIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (userIds.length === 0 || userIds.length > 300) {
    return res.status(400).json({ success: false, error: "userIds must contain between 1 and 300 player IDs" });
  }

  const userToken = String(req.headers?.["x-user-api-key"] || "");
  const results: Record<string, unknown[]> = {};
  let nextIndex = 0;

  try {
    const workers = Array.from({ length: Math.min(8, userIds.length) }, async () => {
      while (nextIndex < userIds.length) {
        const userId = userIds[nextIndex++];
        results[userId] = await fetchTransactions(userId, userToken);
      }
    });
    await Promise.all(workers);
    return res.json({ success: true, donationsByUserId: results });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || "Donation history unavailable" });
  }
}
