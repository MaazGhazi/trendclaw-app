import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { RunType, Phase, CollectedData, SourceResult } from "./types.js";
import { getUserConfig, initUserConfig } from "./user-config.js";

// API sources (fast, reliable)
import * as hackernews from "./sources/hackernews.js";
import * as coingecko from "./sources/coingecko.js";
import * as youtube from "./sources/youtube.js";
import * as wikipedia from "./sources/wikipedia.js";
import * as bluesky from "./sources/bluesky.js";
import * as newsapi from "./sources/newsapi.js";
import * as lobsters from "./sources/lobsters.js";
import * as devto from "./sources/devto.js";

// RSS sources (reliable, no bot issues)
import * as rss from "./sources/rss.js";

// Social media trend blogs (RSS + HTML scraping)
import * as socialTrends from "./sources/social-trends/index.js";

// Browser sources (Playwright stealth — may be blocked)
import * as githubTrending from "./sources/github-trending.js";
import * as googleTrends from "./sources/google-trends.js";
import * as tiktok from "./sources/tiktok.js";
import * as twitter from "./sources/twitter.js";
import { closeBrowser } from "./sources/browser.js";

// ─── Source registry by phase ────────────────────────────────────

interface SourceDef {
  name: string;
  collect: (rt: RunType) => Promise<SourceResult>;
  runTypes: RunType[];
  phase: "global" | "region" | "topic";
  browser?: boolean; // needs sequential execution
}

const SOURCES: SourceDef[] = [
  // ── Global (same for everyone) ──
  { name: "hackernews",      collect: hackernews.collect,       runTypes: ["pulse", "digest", "deep_dive"], phase: "global" },
  { name: "coingecko",       collect: coingecko.collect,        runTypes: ["pulse", "digest", "deep_dive"], phase: "global" },
  { name: "lobsters",        collect: lobsters.collect,         runTypes: ["pulse", "digest", "deep_dive"], phase: "global" },
  { name: "wikipedia",       collect: wikipedia.collect,        runTypes: ["digest", "deep_dive"],          phase: "global" },
  { name: "devto",           collect: devto.collect,            runTypes: ["digest", "deep_dive"],          phase: "global" },
  { name: "github-trending", collect: githubTrending.collect,   runTypes: ["pulse", "digest", "deep_dive"], phase: "global", browser: true },

  // ── Region (varies by country) ──
  { name: "youtube",         collect: youtube.collect,          runTypes: ["digest", "deep_dive"],          phase: "region" },
  { name: "newsapi",         collect: newsapi.collect,          runTypes: ["digest", "deep_dive"],          phase: "region" },
  { name: "google-trends",   collect: googleTrends.collect,     runTypes: ["digest", "deep_dive"],          phase: "region", browser: true },
  { name: "tiktok",          collect: tiktok.collect,           runTypes: ["digest", "deep_dive"],          phase: "region", browser: true },
  { name: "twitter",         collect: twitter.collect,          runTypes: ["digest", "deep_dive"],          phase: "region", browser: true },

  // ── Topic (per-user keywords/niche) ──
  { name: "youtube-search",  collect: youtube.collectByKeywords,  runTypes: ["pulse", "digest", "deep_dive"], phase: "topic" },
  { name: "newsapi-kw",      collect: newsapi.collectByKeywords,  runTypes: ["digest", "deep_dive"],          phase: "topic" },
  { name: "bluesky-kw",      collect: bluesky.collectByKeywords,  runTypes: ["pulse", "digest", "deep_dive"], phase: "topic" },
  { name: "devto-kw",        collect: devto.collectByKeywords,    runTypes: ["digest", "deep_dive"],          phase: "topic" },
  // Bluesky global trending is also useful
  { name: "bluesky",         collect: bluesky.collect,            runTypes: ["digest", "deep_dive"],          phase: "global" },
  // Social media trend blogs (HTML scraping)
  { name: "social-trend-blogs", collect: socialTrends.collect,    runTypes: ["deep_dive"],                    phase: "global" },
];

// ─── Runner ──────────────────────────────────────────────────────

const SOURCE_TIMEOUT_MS = 30_000; // 30s max per source

function withTimeout(promise: Promise<SourceResult>, ms: number, name: string): Promise<SourceResult> {
  return Promise.race([
    promise,
    new Promise<SourceResult>((resolve) =>
      setTimeout(() => resolve({
        source: name,
        status: "error",
        error: `Timed out after ${ms / 1000}s`,
        items: [],
        scrapedAt: new Date().toISOString(),
      }), ms)
    ),
  ]);
}

async function runSources(sources: SourceDef[], runType: RunType): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  // Split into API (parallel) and browser (sequential)
  const apiSources = sources.filter((s) => !s.browser);
  const browserSources = sources.filter((s) => s.browser);

  // Run API sources in parallel (with per-source timeout)
  if (apiSources.length > 0) {
    const apiResults = await Promise.allSettled(
      apiSources.map(async (s) => {
        const start = Date.now();
        const result = await withTimeout(s.collect(runType), SOURCE_TIMEOUT_MS, s.name);
        const duration = Date.now() - start;
        const icon = result.status === "ok" ? "✅" : result.status === "skipped" ? "⏭️" : "❌";
        console.log(`   ${icon} ${result.source}: ${result.items.length} items (${duration}ms)`);
        return result;
      })
    );
    for (const r of apiResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }

  // Run browser sources sequentially (with per-source timeout + extra safety)
  for (const s of browserSources) {
    const start = Date.now();
    let result: SourceResult;
    try {
      result = await withTimeout(s.collect(runType), SOURCE_TIMEOUT_MS * 2, s.name);
    } catch (e) {
      // Catch any unhandled errors that escaped the source's own try/catch
      result = {
        source: s.name,
        status: "error",
        error: `Uncaught: ${String(e)}`,
        items: [],
        scrapedAt: new Date().toISOString(),
      };
    }
    const duration = Date.now() - start;
    const icon = result.status === "ok" ? "✅" : "❌";
    console.log(`   ${icon} ${result.source}: ${result.items.length} items (${duration}ms)`);
    if (result.status === "error") {
      console.log(`      Error: ${result.error}`);
    }
    results.push(result);
    // Delay between browser scrapes
    if (browserSources.indexOf(s) < browserSources.length - 1) {
      const delay = 2000 + Math.random() * 3000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const typeFlag = args.indexOf("--type");
  const phaseFlag = args.indexOf("--phase");
  const runType: RunType = typeFlag >= 0 ? (args[typeFlag + 1] as RunType) : "digest";
  const phase: Phase = phaseFlag >= 0 ? (args[phaseFlag + 1] as Phase) : "all";

  const outputDir = process.env.SCRAPER_OUTPUT_DIR ?? join(process.cwd(), "output");
  mkdirSync(outputDir, { recursive: true });

  // Load user profile (Supabase → file → defaults)
  await initUserConfig();
  const userConfig = getUserConfig();
  console.log(`\n🦞 TrendClaw Scraper — ${runType} run (phase: ${phase})`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Region: ${userConfig.region} | Niche: ${userConfig.niche} | Role: ${userConfig.role}`);
  if (userConfig.keywords.length > 0) {
    console.log(`   Keywords: ${userConfig.keywords.join(", ")}`);
  }
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const allResults: SourceResult[] = [];

  // Determine which phases to run
  const phases: Array<"global" | "region" | "topic"> =
    phase === "all" ? ["global", "region", "topic"] : [phase as "global" | "region" | "topic"];

  for (const p of phases) {
    const label = p === "global" ? "🌍 Global sources" : p === "region" ? "🗺️  Region sources" : "🎯 Topic sources (personalized)";
    console.log(`${label}...`);

    // Get applicable sources for this phase + run type
    const applicable = SOURCES.filter(
      (s) => s.phase === p && s.runTypes.includes(runType)
    );

    if (applicable.length === 0) {
      console.log("   (no sources for this phase/run type)\n");
      continue;
    }

    const results = await runSources(applicable, runType);
    allResults.push(...results);

    // Also collect RSS feeds for the appropriate phase
    if (p === "global") {
      console.log("\n📰 Global RSS feeds...");
      const rssResults = await rss.collectGlobal(runType);
      for (const r of rssResults) {
        const icon = r.status === "ok" ? "✅" : "❌";
        console.log(`   ${icon} ${r.source}: ${r.items.length} items`);
        allResults.push(r);
      }

    }

    if (p === "region") {
      console.log("\n📰 Region RSS feeds...");
      const rssResults = await rss.collectRegion(runType);
      for (const r of rssResults) {
        const icon = r.status === "ok" ? "✅" : "❌";
        console.log(`   ${icon} ${r.source}: ${r.items.length} items`);
        allResults.push(r);
      }
    }

    if (p === "topic") {
      console.log("\n📰 Niche Reddit feeds...");
      const nichePromise = rss.collectByNiche(runType);
      const nicheTimeout = new Promise<SourceResult[]>((resolve) =>
        setTimeout(() => {
          console.log("   ⏰ Niche Reddit feeds timed out after 30s");
          resolve([]);
        }, SOURCE_TIMEOUT_MS)
      );
      const nicheResults = await Promise.race([nichePromise, nicheTimeout]);
      for (const r of nicheResults) {
        const icon = r.status === "ok" ? "✅" : "❌";
        console.log(`   ${icon} ${r.source}: ${r.items.length} items`);
        allResults.push(r);
      }
    }

    console.log("");
  }

  // Close browser if any browser sources were used
  await closeBrowser();

  // Compile output
  const output: CollectedData = {
    runType,
    phase: phase !== "all" ? phase : undefined,
    collectedAt: new Date().toISOString(),
    sources: allResults,
    totalItems: allResults.reduce((sum, r) => sum + r.items.length, 0),
    failedSources: allResults
      .filter((r) => r.status === "error")
      .map((r) => r.source),
  };

  // Write output file — use phase suffix if not running all
  const suffix = phase !== "all" ? `-${phase}` : "";
  const filename = `latest-${runType}${suffix}.json`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, JSON.stringify(output, null, 2));

  // Also write "latest.json" when running all phases
  if (phase === "all") {
    writeFileSync(join(outputDir, "latest.json"), JSON.stringify(output, null, 2));
  }

  console.log(`📊 Summary:`);
  console.log(`   Phase: ${phase}`);
  console.log(`   Total items: ${output.totalItems}`);
  console.log(`   Sources OK: ${allResults.filter((r) => r.status === "ok").length}/${allResults.length}`);
  console.log(`   Failed: ${output.failedSources.join(", ") || "none"}`);
  console.log(`   Output: ${filepath}\n`);
}

// Prevent unhandled rejections from crashing the process silently
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (caught at process level):", reason);
});

main().catch((e) => {
  console.error("Fatal error:", e);
  closeBrowser().finally(() => process.exit(1));
});
