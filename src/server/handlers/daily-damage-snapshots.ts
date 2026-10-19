// Vercel Serverless Function: GET /api/daily-damage-snapshots
// Returns recorded daily damage snapshots and baseline calculations.

import {
  readSnapshotsWithSupabase,
  snapshotAllArmies,
} from "../services/daily-damage.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const muId = req.query?.muId as string;
  let store = await readSnapshotsWithSupabase();

  // If no snapshots exist at all yet, take an initial baseline snapshot now
  if (Object.keys(store).length === 0) {
    try {
      await snapshotAllArmies();
      store = await readSnapshotsWithSupabase();
    } catch (_) {}
  }

  // Get dates sorted
  const dates = Object.keys(store).sort();
  const userId = req.query?.userId as string;
  if (userId && muId) {
    const historyDates = dates.slice(-30);
    const history = historyDates.map((date) => {
      const member = store[date]?.armies?.[muId]?.members?.[userId];
      return {
        date,
        wealth: typeof member?.wealth === "number" ? member.wealth : undefined,
        dailyDamage: typeof member?.dailyDamage === "number" ? member.dailyDamage : undefined,
      };
    }).filter((point) => point.wealth !== undefined || point.dailyDamage !== undefined);
    return res.status(200).json({ success: true, history });
  }
  const latestDate = dates[dates.length - 1];
  const previousDate = dates.length > 1 ? dates[dates.length - 2] : null;

  return res.status(200).json({
    success: true,
    latestDate,
    previousDate,
    totalSnapshots: dates.length,
    dates,
    snapshots: store,
  });
}
