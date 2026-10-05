// Vercel Serverless Function: GET /api/daily-damage-snapshots
// Returns recorded daily damage snapshots and baseline calculations.

import {
  readSnapshotsFromDisk,
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
  let store = readSnapshotsFromDisk();

  // If no snapshots exist at all yet, take an initial baseline snapshot now
  if (Object.keys(store).length === 0) {
    try {
      await snapshotAllArmies();
      store = readSnapshotsFromDisk();
    } catch (_) {}
  }

  // Get dates sorted
  const dates = Object.keys(store).sort();
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
