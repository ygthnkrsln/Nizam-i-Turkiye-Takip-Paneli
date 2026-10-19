// Vercel Serverless Function: GET /api/daily-damage-snapshots
// Returns recorded daily damage snapshots and baseline calculations.

import {
  isSupabaseConnected,
  readSnapshotsWithSupabase,
  snapshotAllArmies,
} from '../src/server/services/daily-damage.js';
import { calculateDailyDamageFromSnapshot } from '../src/lib/dailyDamage.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const muId = req.query?.muId as string;
  const userId = req.query?.userId as string;
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
  if (userId && muId) {
    const historyDates = dates.slice(-30);
    const history = historyDates.map((date) => {
      const member = store[date]?.armies?.[muId]?.members?.[userId];
      const previousDate = dates[dates.indexOf(date) - 1];
      const previousMember = previousDate ? store[previousDate]?.armies?.[muId]?.members?.[userId] : undefined;
      const dailyDamage = typeof member?.dailyDamage === 'number'
        ? member.dailyDamage
        : previousMember && member
          ? calculateDailyDamageFromSnapshot(member.weeklyDamage, previousMember.weeklyDamage)
          : undefined;
      return { date, wealth: member?.wealth, dailyDamage };
    });
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
