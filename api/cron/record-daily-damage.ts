import {
  isSupabaseConnected,
  readSnapshotsWithSupabase,
  snapshotAllArmies,
} from "../../src/server/services/daily-damage.js";
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

  try {
    const snapshot = await snapshotAllArmies();
    return res.status(200).json({
      success: true,
      message: "02:55 Günlük Hasar Snapshot başarıyla tamamlandı (8 Ordu).",
      date: snapshot.date,
      armiesCount: Object.keys(snapshot.armies).length,
      supabaseSaved: snapshot.supabaseSaved,
      supabaseConnected: snapshot.supabaseConnected,
      snapshot,
    });
  } catch (err: any) {
    console.error("Cron job error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Snapshot failed" });
  }
}
