import {
  isSupabaseConnected,
  saveSnapshotToSupabase,
} from "../src/lib/supabaseStorage.js";
import { getNextWarEraToken } from "../src/lib/wareraTokens.js";
import {
  readSnapshotsWithSupabase,
  writeSnapshotsToDisk,
} from "../api/cron/record-daily-damage.js";

const DTX_MU_ID = "693d20605669127e9d45f9b8";
const DTX_NAME = "DTX";
const BASELINE_DATE = process.argv[2] || "2026-10-03";
const BASE_URL = "https://api2.warera.io/trpc";

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
  const existingSnapshot = snapshots[BASELINE_DATE];
  if (!existingSnapshot?.armies) {
    throw new Error(
      `Existing ${BASELINE_DATE} snapshot not found; no data was changed.`,
    );
  }

  const muInput = encodeURIComponent(JSON.stringify({ muId: DTX_MU_ID }));
  const muJson = await fetchWarEraJson(
    `${BASE_URL}/mu.getById?input=${muInput}`,
  );
  const muData = unwrapData(muJson);
  if (
    !muData ||
    !Array.isArray(muData.members) ||
    muData.members.length === 0
  ) {
    throw new Error(
      "DTX MU response did not contain a member list; no data was changed.",
    );
  }

  const memberIds: string[] = muData.members;
  const memberBaseline: Record<
    string,
    { username: string; weeklyDamage: number }
  > = {};
  const batchSize = 10;

  for (let offset = 0; offset < memberIds.length; offset += batchSize) {
    const batch = memberIds.slice(offset, offset + batchSize);
    const endpoints = batch.map(() => "user.getUserById").join(",");
    const input: Record<string, { userId: string }> = {};
    batch.forEach((userId, index) => {
      input[String(index)] = { userId };
    });
    const query = new URLSearchParams({
      batch: "1",
      input: JSON.stringify(input),
    });
    const usersJson = await fetchWarEraJson(
      `${BASE_URL}/${endpoints}?${query}`,
    );
    const userResults = Array.isArray(usersJson) ? usersJson : [usersJson];

    for (const result of userResults) {
      const user = unwrapData(result);
      const userId = user?._id || user?.id;
      if (!userId) continue;

      memberBaseline[userId] = {
        username: user.username || "Bilinmeyen Asker",
        weeklyDamage: Number(
          user.rankings?.weeklyUserDamages?.value ??
            user.weeklyDamages ??
            user.weeklyDamage ??
            0,
        ),
      };
    }
  }

  const missingMembers = memberIds.filter((userId) => !memberBaseline[userId]);
  if (missingMembers.length > 0) {
    throw new Error(
      `Could not fetch weekly damage for ${missingMembers.length} DTX members; no snapshot was changed.`,
    );
  }

  const memberDamageSum = Object.values(memberBaseline).reduce(
    (sum, member) => sum + member.weeklyDamage,
    0,
  );
  const muWeeklyDamage = Number(
    muData.rankings?.muWeeklyDamages?.value ?? memberDamageSum,
  );

  const updatedSnapshot = {
    ...existingSnapshot,
    armies: {
      ...existingSnapshot.armies,
      [DTX_MU_ID]: {
        name: DTX_NAME,
        muId: DTX_MU_ID,
        armyTotalWeeklyDamage: memberDamageSum,
        memberCount: memberIds.length,
        members: memberBaseline,
      },
    },
  };

  const saved = await saveSnapshotToSupabase(updatedSnapshot);
  if (!saved) {
    throw new Error(
      "Supabase snapshot upsert failed; local snapshot was not changed.",
    );
  }

  snapshots[BASELINE_DATE] = updatedSnapshot;
  writeSnapshotsToDisk(snapshots);

  console.log(
    JSON.stringify(
      {
        success: true,
        baselineDate: BASELINE_DATE,
        muId: DTX_MU_ID,
        name: DTX_NAME,
        memberCount: memberIds.length,
        muWeeklyDamage: muWeeklyDamage,
        memberWeeklyDamageSum: memberDamageSum,
        difference: muWeeklyDamage - memberDamageSum,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("DTX baseline backfill failed:", error.message || error);
  process.exitCode = 1;
});
