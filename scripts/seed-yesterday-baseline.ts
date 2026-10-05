import fs from "fs";
import path from "path";
import {
  saveSnapshotToSupabase,
  isSupabaseConnected,
} from "../src/lib/supabaseStorage";

const PRESET_MILITARY_UNITS = [
  { id: "69c229c4449287ea1a26a5b3", name: "Turkic Tribe" },
  { id: "689f69064e095b8b9f1b885a", name: "ASHINA" },
  { id: "68bc9bcb4870c8e343e42855", name: "ASHINA Reserve" },
  { id: "690088ce4864a132a2d92d07", name: "Legio Panthera" },
  { id: "6902269a560184d196a6fba8", name: "BEASTs" },
  { id: "6a0f1495478fe2a58d2868d6", name: "Deliler" },
  { id: "68e0f3b86351b310a982d79e", name: "WAVVE" },
  { id: "693d20605669127e9d45f9b8", name: "DTX" },
];

import { getNextWarEraToken } from "../src/lib/wareraTokens";

async function fetchWarEra(url: string) {
  const token = getNextWarEraToken();
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
}

async function main() {
  console.log(
    "--- Seeding Yesterday Reference Baseline (2026-10-03) with Real Live Weekly Damages ---",
  );

  // Yesterday's date in Turkey time
  const yesterdayStr = "2026-10-03";
  const timestamp = new Date("2026-10-03T02:55:00.000+03:00").getTime();

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const snapshotsFilePath = path.join(dataDir, "daily_snapshots.json");

  let currentStore: Record<string, any> = {};
  if (fs.existsSync(snapshotsFilePath)) {
    try {
      currentStore = JSON.parse(fs.readFileSync(snapshotsFilePath, "utf-8"));
    } catch (_) {}
  }

  const armiesRecord: Record<string, any> = {};

  for (const mu of PRESET_MILITARY_UNITS) {
    console.log(`Fetching real data for ${mu.name} (${mu.id})...`);
    try {
      const muUrl = `https://api2.warera.io/trpc/mu.getById?input=${encodeURIComponent(JSON.stringify({ muId: mu.id }))}`;
      const muRes = await fetchWarEra(muUrl);
      if (!muRes.ok) {
        console.warn(`Failed fetching MU ${mu.name}: status ${muRes.status}`);
        continue;
      }
      const muJson = await muRes.json();
      const muData = muJson?.result?.data?.json || muJson?.result?.data;
      if (!muData) continue;

      const members: string[] = muData.members || [];
      const chunks: string[][] = [];
      for (let i = 0; i < members.length; i += 10) {
        chunks.push(members.slice(i, i + 10));
      }

      const memberDamages: Record<
        string,
        { username: string; weeklyDamage: number }
      > = {};

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const endpoints = chunk.map(() => "user.getUserById").join(",");
            const batchInput: Record<string, { userId: string }> = {};
            chunk.forEach((id, idx) => {
              batchInput[idx.toString()] = { userId: id };
            });
            const batchUrl = `https://api2.warera.io/trpc/${endpoints}?batch=1&input=${encodeURIComponent(JSON.stringify(batchInput))}`;
            const uRes = await fetchWarEra(batchUrl);
            if (uRes.ok) {
              const uJson = await uRes.json();
              if (Array.isArray(uJson)) {
                for (const item of uJson) {
                  const u = item?.result?.data?.json || item?.result?.data;
                  if (u?._id) {
                    memberDamages[u._id] = {
                      username: u.username || "Bilinmeyen Asker",
                      weeklyDamage: u.rankings?.weeklyUserDamages?.value || 0,
                    };
                  }
                }
              }
            }
          } catch (err) {
            console.error("Batch user fetch error:", err);
          }
        }),
      );

      const armyTotalWeekly = Object.values(memberDamages).reduce(
        (total, member) => total + member.weeklyDamage,
        0,
      );

      armiesRecord[mu.id] = {
        name: mu.name,
        muId: mu.id,
        armyTotalWeeklyDamage: armyTotalWeekly,
        memberCount: members.length,
        members: memberDamages,
      };

      console.log(
        `Saved ${Object.keys(memberDamages).length} members for ${mu.name}.`,
      );
    } catch (e) {
      console.error(`Error processing MU ${mu.name}:`, e);
    }
  }

  const snapshotPayload = {
    date: yesterdayStr,
    timestamp,
    iso: new Date(timestamp).toISOString(),
    armies: armiesRecord,
  };

  currentStore[yesterdayStr] = snapshotPayload;

  // Save to disk
  fs.writeFileSync(
    snapshotsFilePath,
    JSON.stringify(currentStore, null, 2),
    "utf-8",
  );
  console.log(
    `Successfully written reference baseline to ${snapshotsFilePath}!`,
  );

  // Save to Supabase if configured
  if (isSupabaseConnected()) {
    console.log(
      "Supabase is connected! Saving to Supabase daily_snapshots table...",
    );
    const saved = await saveSnapshotToSupabase(snapshotPayload);
    console.log(`Supabase save result: ${saved ? "SUCCESS" : "FAILED"}`);
  } else {
    console.log(
      "Note: Supabase credentials not found in local environment. If deployed to Vercel with SUPABASE_URL and SUPABASE_ANON_KEY, it will sync automatically.",
    );
  }

  console.log("--- Done Seeding Baseline ---");
}

main().catch(console.error);
