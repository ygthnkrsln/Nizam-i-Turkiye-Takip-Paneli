// Vercel Serverless Function: GET /api/daily-damage-snapshots
// Returns recorded daily damage snapshots and baseline calculations.

import {
  isSupabaseConnected,
  readSnapshotsWithSupabase,
  snapshotAllArmies,
} from "../services/daily-damage.js";
import { TRACKED_ARMIES } from "../../config/trackedArmies.js";
import {
  getSnapshotArmyMemberIds,
  getSnapshotArmyMembers,
  getSnapshotPlayer,
} from "../../lib/dailyDamage.js";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const muId = req.query?.muId as string;
  let store = await readSnapshotsWithSupabase();

  if (req.query?.directory === "true") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
    const todayArmies = store[today]?.armies || {};
    const incompleteTrackedArmy = TRACKED_ARMIES.some((army) => {
      const snapshot = todayArmies[army.id];
      return !snapshot ||
        getSnapshotArmyMemberIds(store[today], army.id).length <
          Number(snapshot.memberCount || 0);
    });
    if (!store[today] || incompleteTrackedArmy) {
      try {
        await snapshotAllArmies();
        store = await readSnapshotsWithSupabase();
      } catch (error) {
        console.warn("Could not refresh player directory snapshot:", error);
      }
    }

    const directory = new Map<string, { userId: string; username: string; armyNames: Set<string> }>();
    const snapshotDates = Object.keys(store).sort().slice(-30).reverse();
    const latestDate = snapshotDates[0] || null;
    for (const date of snapshotDates) {
      const snapshot = store[date];
      for (const army of TRACKED_ARMIES) {
        const members = getSnapshotArmyMembers(snapshot, army.id);
        for (const [userId, member] of Object.entries(members) as [string, { username?: string }][]) {
          const entry = directory.get(userId) || { userId, username: "", armyNames: new Set<string>() };
          if (!entry.username && member.username) entry.username = member.username;
          entry.armyNames.add(army.name);
          directory.set(userId, entry);
        }
      }
    }

    return res.status(200).json({
      success: true,
      latestDate,
      players: Array.from(directory.values())
        .filter((player) => player.username)
        .map((player) => ({ ...player, armyNames: Array.from(player.armyNames) }))
        .sort((a, b) => a.username.localeCompare(b.username, "tr")),
    });
  }

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
      const member = getSnapshotPlayer(store[date], userId) ??
        store[date]?.armies?.[muId]?.members?.[userId];
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
    supabaseConnected: isSupabaseConnected(),
  });
}
