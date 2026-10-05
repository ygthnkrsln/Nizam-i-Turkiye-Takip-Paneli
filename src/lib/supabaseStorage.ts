import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://fdjfrxjbcdyzobdfpfnc.supabase.co";
const DEFAULT_SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkamZyeGpiY2R5em9iZGZwZm5jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTAzOTA5MSwiZXhwIjoyMTA2NjE1MDkxfQ.ERTGb_E1OVo1iYsGO6vv-y2ciKvZ0xApnvKQdNWTS1w";

// Retrieve Supabase configuration from environment variables
// Supports Vercel integration variables as well as Vite/Next client variables
const getSupabaseCredentials = () => {
  let url = "";
  let key = "";

  if (typeof process !== "undefined" && process.env) {
    url =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "";

    key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "";
  }

  if (!url) url = DEFAULT_SUPABASE_URL;
  if (!key) key = DEFAULT_SUPABASE_KEY;

  return { url, key };
};

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const { url, key } = getSupabaseCredentials();
  if (!url || !key) {
    return null;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return cachedClient;
  } catch (err) {
    console.error("[Supabase] Failed to initialize client:", err);
    return null;
  }
}

export function isSupabaseConnected(): boolean {
  const { url, key } = getSupabaseCredentials();
  return Boolean(url && key);
}

export interface DailySnapshotRecord {
  date: string;
  timestamp: number;
  iso?: string;
  armies: Record<
    string,
    {
      name: string;
      muId: string;
      armyTotalWeeklyDamage: number;
      memberCount: number;
      members: Record<string, { username: string; weeklyDamage: number }>;
    }
  >;
  created_at?: string;
}

export interface ManagementOverviewCacheRecord {
  key: string;
  payload: Record<string, any>;
  updated_at?: string;
}

/**
 * Save or update a daily snapshot in Supabase.
 * Table: daily_snapshots (date PRIMARY KEY, timestamp BIGINT, armies JSONB, created_at TIMESTAMPTZ)
 */
export async function saveSnapshotToSupabase(
  snapshot: DailySnapshotRecord,
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  try {
    const payload = {
      date: snapshot.date,
      timestamp: snapshot.timestamp,
      armies: snapshot.armies,
      iso: snapshot.iso || new Date(snapshot.timestamp).toISOString(),
    };

    const { error } = await client
      .from("daily_snapshots")
      .upsert(payload, { onConflict: "date" });

    if (error) {
      console.warn(
        '[Supabase] Upsert notice (ensure "daily_snapshots" table exists in Supabase):',
        error.message,
      );
      return false;
    }

    console.log(
      `[Supabase] Daily snapshot for ${snapshot.date} successfully saved to Supabase.`,
    );
    return true;
  } catch (err) {
    console.error("[Supabase] Unexpected error saving snapshot:", err);
    return false;
  }
}

/**
 * Fetch all snapshots from Supabase ordered chronologically.
 */
export async function fetchSnapshotsFromSupabase(
  limitDays: number = 30,
): Promise<Record<string, DailySnapshotRecord> | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client
      .from("daily_snapshots")
      .select("*")
      .order("date", { ascending: true })
      .limit(limitDays);

    if (error) {
      console.warn("[Supabase] Fetch error:", error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return {};
    }

    const store: Record<string, DailySnapshotRecord> = {};
    for (const row of data) {
      if (row.date && row.armies) {
        store[row.date] = {
          date: row.date,
          timestamp:
            typeof row.timestamp === "number"
              ? row.timestamp
              : Number(row.timestamp),
          iso: row.iso || row.created_at,
          armies:
            typeof row.armies === "string"
              ? JSON.parse(row.armies)
              : row.armies,
        };
      }
    }

    return store;
  } catch (err) {
    console.error("[Supabase] Error reading snapshots from Supabase:", err);
    return null;
  }
}

export async function readManagementOverviewCache(
  key: string,
): Promise<{ timestamp: number; payload: any } | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  try {
    const { data, error } = await client
      .from("management_overview_cache")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      const errorText = String(error.message).toLowerCase();
      if (
        errorText.includes("does not exist") ||
        errorText.includes("relation") ||
        errorText.includes("find the table") ||
        errorText.includes("schema cache")
      ) {
        return null;
      }
      console.warn(
        "[Supabase] management_overview_cache read warning:",
        error.message,
      );
      return null;
    }

    if (!data) {
      return null;
    }

    const payload = data.payload ?? data;
    const timestamp =
      typeof data.updated_at === "string"
        ? new Date(data.updated_at).getTime()
        : Date.now();

    return { timestamp, payload };
  } catch (err) {
    console.warn("[Supabase] Unable to read management cache:", err);
    return null;
  }
}

export async function saveManagementOverviewCache(
  key: string,
  payload: Record<string, any>,
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  try {
    const { error } = await client.from("management_overview_cache").upsert(
      {
        key,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    if (error) {
      const errorText = String(error.message).toLowerCase();
      if (
        errorText.includes("does not exist") ||
        errorText.includes("relation") ||
        errorText.includes("find the table") ||
        errorText.includes("schema cache")
      ) {
        return false;
      }
      console.warn(
        "[Supabase] management_overview_cache save warning:",
        error.message,
      );
      return false;
    }

    return true;
  } catch (err) {
    console.warn("[Supabase] Unable to save management cache:", err);
    return false;
  }
}
