import { getNextWarEraToken } from "../src/lib/wareraTokens.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, x-user-api-key",
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const endpointPath = req.query?.path as string;
    const input = req.query?.input as string;
    const batch = req.query?.batch as string;
    if (!endpointPath) {
      return res.status(400).json({ error: "Missing path parameter" });
    }

    const upstreamUrl = new URL(
      `https://api2.warera.io/trpc/${endpointPath}`,
    );
    if (batch) upstreamUrl.searchParams.set("batch", batch);
    if (input) upstreamUrl.searchParams.set("input", input);

    const userApiKey =
      (req.headers["x-user-api-key"] as string) ||
      (req.query?.apiKey as string);
    const token = userApiKey?.trim() || getNextWarEraToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["X-API-Key"] = token;

    const upstreamRes = await fetch(upstreamUrl, { headers });
    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err: any) {
    console.error("Error in /api/warera-proxy:", err);
    return res
      .status(500)
      .json({ error: err.message || "WarEra Proxy failure" });
  }
}
