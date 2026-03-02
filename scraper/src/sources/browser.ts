import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function getBrowser(): Promise<BrowserContext> {
  if (context) return context;

  const proxyUrl = process.env.PROXY_URL; // e.g. http://user:pass@proxy.scraperapi.com:8001

  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
    ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/New_York",
    // Stealth: override webdriver detection
    bypassCSP: true,
  });

  // Stealth patches
  await context.addInitScript(() => {
    // Hide webdriver
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    // Fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    // Fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Fake chrome runtime
    (window as any).chrome = { runtime: {} };

    // Fake permissions
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: "prompt" } as PermissionStatus)
          : originalQuery(parameters);
    }
  });

  return context;
}

export async function newPage(): Promise<Page> {
  const ctx = await getBrowser();
  const page = await ctx.newPage();
  // Random delay to look human
  await page.waitForTimeout(500 + Math.random() * 1000);
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}
