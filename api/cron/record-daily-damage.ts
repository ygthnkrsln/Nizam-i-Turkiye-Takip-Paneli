import {
  isSupabaseConnected,
  readSnapshotsWithSupabase,
  snapshotAllArmies,
} from "../../src/server/services/daily-damage.js";
import { recordCountryTrackerSnapshot } from "../../src/server/handlers/management-intelligence.js";
export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // If query action=list, return the snapshots list
  if (req.query?.action === "list") {
    try {
      const store = await readSnapshotsWithSupabase();
      const dates = Object.keys(store).sort();
      return res.status(200).json({
        success: true,
        totalSnapshots: dates.length,
        dates,
        snapshots: store,
        supabaseConnected: isSupabaseConnected(),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  const startedAt = Date.now();
  try {
    let phaseStartedAt = Date.now();
    const snapshot = await snapshotAllArmies({
      captureDonationTargets: req.method === "GET",
    });
    const snapshotDurationMs = Date.now() - phaseStartedAt;
    let countrySnapshot: any = null;
    let countrySnapshotDurationMs = 0;
    phaseStartedAt = Date.now();
    try {
      countrySnapshot = await recordCountryTrackerSnapshot();
    } catch (error) {
      console.warn("Country tracker snapshot failed; daily damage snapshot is still available:", error);
    } finally {
      countrySnapshotDurationMs = Date.now() - phaseStartedAt;
    }
    const timingMs = {
      snapshot: snapshotDurationMs,
      countrySnapshot: countrySnapshotDurationMs,
      total: Date.now() - startedAt,
    };
    console.info("[Daily cron timing]", JSON.stringify({
      date: snapshot.date,
      ...timingMs,
      trackedArmies: Object.keys(snapshot.armies).length,
      trackedPlayers: Object.keys(snapshot.players || {}).length,
    }));
    return res.status(200).json({
      success: true,
      message: `02:55 Günlük Hasar Snapshot başarıyla tamamlandı (${Object.keys(snapshot.armies).length} Ordu).`,
      date: snapshot.date,
      armiesCount: Object.keys(snapshot.armies).length,
      supabaseSaved: snapshot.supabaseSaved,
      supabaseConnected: snapshot.supabaseConnected,
      timingMs,
      countrySnapshot,
      snapshot,
    });
  } catch (err: any) {
    console.error("Cron job error:", JSON.stringify({
      elapsedMs: Date.now() - startedAt,
      error: err.message || "Snapshot failed",
    }));
    return res
      .status(500)
      .json({ success: false, error: err.message || "Snapshot failed" });
  }
}
