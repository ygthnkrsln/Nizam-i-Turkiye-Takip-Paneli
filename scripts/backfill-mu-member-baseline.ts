import {
  isSupabaseConnected,
  saveSnapshotToSupabase,
} from "../src/lib/supabaseStorage.js";
import { getNextWarEraToken } from "../src/lib/wareraTokens.js";
import {
  readSnapshotsWithSupabase,
  writeSnapshotsToDisk,
} from "../api/cron/record-daily-damage.js";
import { getCurrentWeeklyDamage } from "../src/lib/dailyDamage.js";

const [muId, userId, snapshotDate = "2026-10-03"] = process.argv.slice(2);
const BASE_URL = "https://api2.warera.io/trpc";

if (!muId || !userId) {
  throw new Error(
    "Usage: tsx scripts/backfill-mu-member-baseline.ts <MU_ID> <USER_ID> [YYYY-MM-DD]",
  );
}

async function fetchWarEraJson(url: string): Promise<any> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = getNextWarEraToken();
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "X-API-Key": token,
          "Content-Type": "application/json",
        },
      });

      if ((response.status === 429 || response.status === 503) && attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      if (!response.ok) {
        throw new Error(`WarEra API returned HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("WarEra request failed");
}

function unwrapData(value: any): any {
  return value?.result?.data?.json || value?.result?.data;
}

async function main() {
  if (!isSupabaseConnected()) {
    throw new Error(
      "Supabase is not configured; refusing to update only the local snapshot.",
    );
  }

  const snapshots = await readSnapshotsWithSupabase();
  const snapshot = snapshots[snapshotDate];
  const army = snapshot?.armies?.[muId];
  if (!snapshot || !army) {
    throw new Error(
      `Snapshot ${snapshotDate} has no army ${muId}; no data was changed.`,
    );
  }

  const muInput = encodeURIComponent(JSON.stringify({ muId }));
  const muData = unwrapData(
    await fetchWarEraJson(`${BASE_URL}/mu.getById?input=${muInput}`),
  );
  if (!Array.isArray(muData?.members) || !muData.members.includes(userId)) {
    throw new Error(
      `User ${userId} is not currently in MU ${muId}; no data was changed.`,
    );
  }

  const userInput = encodeURIComponent(JSON.stringify({ userId }));
  const user = unwrapData(
    await fetchWarEraJson(`${BASE_URL}/user.getUserById?input=${userInput}`),
  );
  if (!user)
    throw new Error(`Could not fetch user ${userId}; no data was changed.`);

  const liveWeeklyDamage = getCurrentWeeklyDamage(user);
  const existingMember = army.members?.[userId];
  if (
    existingMember &&
    Number(existingMember.weeklyDamage) !== liveWeeklyDamage
  ) {
    throw new Error(
      `A different baseline already exists for this member (${existingMember.weeklyDamage}); no data was changed.`,
    );
  }

  const members: Record<string, { username: string; weeklyDamage: number }> = {
    ...((army.members || {}) as Record<
      string,
      { username: string; weeklyDamage: number }
    >),
    [userId]: {
      username: user.username || existingMember?.username || "Bilinmeyen Asker",
      weeklyDamage: liveWeeklyDamage,
    },
  };
  const armyTotalWeeklyDamage = Object.values(members).reduce(
    (sum, member) => sum + Number(member.weeklyDamage || 0),
    0,
  );
  const updatedSnapshot = {
    ...snapshot,
    armies: {
      ...snapshot.armies,
      [muId]: {
        ...army,
        name: muData.name || army.name,
        muId,
        memberCount: Math.max(
          Number(army.memberCount || 0),
          Object.keys(members).length,
        ),
        armyTotalWeeklyDamage,
        members,
      },
    },
  };

  const saved = await saveSnapshotToSupabase(updatedSnapshot);
  if (!saved)
    throw new Error("Supabase upsert failed; local snapshot was not changed.");

  snapshots[snapshotDate] = updatedSnapshot;
  writeSnapshotsToDisk(snapshots);

  console.log(
    JSON.stringify(
      {
        success: true,
        date: snapshotDate,
        muName: muData.name || army.name,
        muId,
        username: user.username,
        userId,
        baselineWeeklyDamage: liveWeeklyDamage,
        updatedArmyBaselineWeeklyDamage: armyTotalWeeklyDamage,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Member baseline backfill failed:", error.message || error);
  process.exitCode = 1;
});
