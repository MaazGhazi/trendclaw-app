import { newPage, safeClosePage } from "./browser.js";
import type { RunType, ScrapedItem, SourceResult } from "../types.js";

export async function collect(runType: RunType): Promise<SourceResult> {
  const items: ScrapedItem[] = [];
  let page: Awaited<ReturnType<typeof newPage>> | null = null;

  try {
    page = await newPage();

    // Today's trending
    await page.goto("https://github.com/trending", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const repos = await page.$$("article.Box-row");
    const limit = runType === "pulse" ? 10 : 20;

    for (const repo of repos.slice(0, limit)) {
      try {
        const nameEl = await repo.$("h2 a");
        const name = (await nameEl?.textContent())?.trim().replace(/\s+/g, "") ?? "";
        const href = await nameEl?.getAttribute("href");

        const descEl = await repo.$("p");
        const description = (await descEl?.textContent())?.trim() ?? "";

        const langEl = await repo.$("[itemprop='programmingLanguage']");
        const language = (await langEl?.textContent())?.trim() ?? "";

        const starsEl = await repo.$("a[href$='/stargazers']");
        const starsText = (await starsEl?.textContent())?.trim().replace(/,/g, "") ?? "0";
        const stars = parseInt(starsText) || 0;

        const todayEl = await repo.$("span.d-inline-block.float-sm-right");
        const todayStars = (await todayEl?.textContent())?.trim() ?? "";

        items.push({
          title: name,
          url: href ? `https://github.com${href}` : undefined,
          description,
          language,
          stars,
          extra: { todayStars },
        });
      } catch {
        // Individual repo parse failure is ok
      }
    }

    return {
      source: "GitHub Trending",
      status: items.length > 0 ? "ok" : "error",
      error: items.length === 0 ? "No repos parsed" : undefined,
      items,
      scrapedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      source: "GitHub Trending",
      status: "error",
      error: String(e),
      items,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await safeClosePage(page);
  }
}
