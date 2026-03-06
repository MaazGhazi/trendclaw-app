import { readFileSync } from "fs";

export interface UserConfig {
  region: string;
  niche: string;
  platforms: string[];
  role: string;
  keywords: string[];
}

const DEFAULT_CONFIG: UserConfig = {
  region: "US",
  niche: "tech",
  platforms: [],
  role: "creator",
  keywords: [],
};

let cached: UserConfig | null = null;

/**
 * Initialize user config from Supabase profile if credentials are available,
 * otherwise fall back to local JSON file or defaults.
 * Call this once at startup before any getUserConfig() calls.
 */
export async function initUserConfig(): Promise<void> {
  // Try Supabase first
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const userId = process.env.SUPABASE_USER_ID;
      // Build query — if a specific user ID is set, use it; otherwise grab the first completed profile
      let url = `${supabaseUrl}/rest/v1/profiles?onboarding_complete=eq.true&select=region,niche,platforms,role,keywords&limit=1`;
      if (userId) {
        url = `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=region,niche,platforms,role,keywords&limit=1`;
      }

      const res = await fetch(url, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const p = rows[0];
          cached = {
            region: p.region || "US",
            niche: p.niche || "tech",
            platforms: p.platforms || [],
            role: p.role || "creator",
            keywords: p.keywords || [],
          };
          console.log(`[user-config] Loaded profile from Supabase (region: ${cached.region})`);
          return;
        }
      }
      console.warn(`[user-config] Supabase returned no profile, falling back`);
    } catch (e) {
      console.warn(`[user-config] Supabase fetch failed: ${e}, falling back`);
    }
  }

  // Fall back to local JSON file
  const configPath = process.env.SCRAPER_USER_CONFIG;
  if (configPath) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      cached = {
        region: parsed.region || "US",
        niche: parsed.niche || "tech",
        platforms: parsed.platforms || [],
        role: parsed.role || "creator",
        keywords: parsed.keywords || [],
      };
      console.log(`[user-config] Loaded from file ${configPath} (region: ${cached.region})`);
      return;
    } catch {
      console.warn(`[user-config] Failed to read ${configPath}, using defaults`);
    }
  }

  cached = DEFAULT_CONFIG;
}

/** Get the cached user config. Call initUserConfig() first. */
export function getUserConfig(): UserConfig {
  if (cached) return cached;

  // Sync fallback if initUserConfig() wasn't called
  const configPath = process.env.SCRAPER_USER_CONFIG;
  if (configPath) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      cached = {
        region: parsed.region || "US",
        niche: parsed.niche || "tech",
        platforms: parsed.platforms || [],
        role: parsed.role || "creator",
        keywords: parsed.keywords || [],
      };
      return cached;
    } catch {
      // fall through
    }
  }

  cached = DEFAULT_CONFIG;
  return cached;
}
