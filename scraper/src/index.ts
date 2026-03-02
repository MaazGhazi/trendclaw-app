import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { RunType, CollectedData, SourceResult } from "./types.js";

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

// Browser sources (Playwright stealth — may be blocked)
import * as githubTrending from "./sources/github-trending.js";
import * as googleTrends from "./sources/google-trends.js";
import * as tiktok from "./sources/tiktok.js";
import { closeBrowser } from "./sources/browser.js";

// Source registry: which collectors run for which run types
const API_SOURCES: Array<{
  name: string;
  collect: (rt: RunType) => Promise<SourceResult>;
  runTypes: RunType[];
}> = [
  { name: "hackernews", collect: hackernews.collect, runTypes: ["pulse", "digest", "deep_dive"] },
  { name: "coingecko", collect: coingecko.collect, runTypes: ["pulse", "digest", "deep_dive"] },
  { name: "lobsters", collect: lobsters.collect, runTypes: ["pulse", "digest", "deep_dive"] },
  { name: "wikipedia", collect: wikipedia.collect, runTypes: ["digest", "deep_dive"] },
  { name: "bluesky", collect: bluesky.collect, runTypes: ["digest", "deep_dive"] },
  { name: "youtube", collect: youtube.collect, runTypes: ["digest", "deep_dive"] },
  { name: "newsapi", collect: newsapi.collect, runTypes: ["digest", "deep_dive"] },
  { name: "devto", collect: devto.collect, runTypes: ["digest", "deep_dive"] },
];

const BROWSER_SOURCES: Array<{
  name: string;
  collect: (rt: RunType) => Promise<SourceResult>;
  runTypes: RunType[];
}> = [
  { name: "github-trending", collect: githubTrending.collect, runTypes: ["pulse", "digest", "deep_dive"] },
  { name: "google-trends", collect: googleTrends.collect, runTypes: ["digest", "deep_dive"] },
  { name: "tiktok", collect: tiktok.collect, runTypes: ["digest", "deep_dive"] },
];

async function main() {
  const args = process.argv.slice(2);
  const typeFlag = args.indexOf("--type");
  const runType: RunType = typeFlag >= 0 ? (args[typeFlag + 1] as RunType) : "digest";

  const outputDir = process.env.SCRAPER_OUTPUT_DIR ?? join(process.cwd(), "output");
  mkdirSync(outputDir, { recursive: true });

  console.log(`\n🦞 TrendClaw Scraper — ${runType} run`);
  console.log(`   Output: ${outputDir}`);
  console.log(`   Time: ${new Date().toISOString()}\n`);

  const allResults: SourceResult[] = [];

  // Phase 1: API sources (fast, run in parallel)
  console.log("📡 Phase 1: Fetching API sources...");
  const applicableAPIs = API_SOURCES.filter((s) => s.runTypes.includes(runType));
  const apiResults = await Promise.allSettled(
    applicableAPIs.map(async (s) => {
      const start = Date.now();
      const result = await s.collect(runType);
      const duration = Date.now() - start;
      const icon = result.status === "ok" ? "✅" : result.status === "skipped" ? "⏭️" : "❌";
      console.log(`   ${icon} ${result.source}: ${result.items.length} items (${duration}ms)`);
      return result;
    })
  );
  for (const r of apiResults) {
    if (r.status === "fulfilled") allResults.push(r.value);
  }

  // Phase 2: RSS feeds (fast, run in parallel)
  console.log("\n📰 Phase 2: Fetching RSS feeds...");
  const rssResults = await rss.collectAll(runType);
  for (const r of rssResults) {
    const icon = r.status === "ok" ? "✅" : "❌";
    console.log(`   ${icon} ${r.source}: ${r.items.length} items`);
    allResults.push(r);
  }

  // Phase 3: Browser sources (slow, run sequentially to avoid detection)
  const applicableBrowser = BROWSER_SOURCES.filter((s) => s.runTypes.includes(runType));
  if (applicableBrowser.length > 0) {
    console.log("\n🌐 Phase 3: Browser scraping (stealth mode)...");
    for (const s of applicableBrowser) {
      const start = Date.now();
      const result = await s.collect(runType);
      const duration = Date.now() - start;
      const icon = result.status === "ok" ? "✅" : "❌";
      console.log(`   ${icon} ${result.source}: ${result.items.length} items (${duration}ms)`);
      if (result.status === "error") {
        console.log(`      Error: ${result.error}`);
      }
      allResults.push(result);
      // Delay between browser scrapes to look human
      if (applicableBrowser.indexOf(s) < applicableBrowser.length - 1) {
        const delay = 2000 + Math.random() * 3000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    await closeBrowser();
  }

  // Compile output
  const output: CollectedData = {
    runType,
    collectedAt: new Date().toISOString(),
    sources: allResults,
    totalItems: allResults.reduce((sum, r) => sum + r.items.length, 0),
    failedSources: allResults
      .filter((r) => r.status === "error")
      .map((r) => r.source),
  };

  // Write output file
  const filename = `latest-${runType}.json`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, JSON.stringify(output, null, 2));

  // Also write a "latest.json" symlink-style copy
  writeFileSync(join(outputDir, "latest.json"), JSON.stringify(output, null, 2));

  console.log(`\n📊 Summary:`);
  console.log(`   Total items: ${output.totalItems}`);
  console.log(`   Sources OK: ${allResults.filter((r) => r.status === "ok").length}/${allResults.length}`);
  console.log(`   Failed: ${output.failedSources.join(", ") || "none"}`);
  console.log(`   Output: ${filepath}\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  closeBrowser().finally(() => process.exit(1));
});
