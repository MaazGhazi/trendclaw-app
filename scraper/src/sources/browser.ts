import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

let browser: Browser | null = null;
let context: BrowserContext | null = null;

export async function getBrowser(): Promise<BrowserContext> {
  if (context) return context;

  const proxyUrl = process.env.PROXY_URL; // e.g. http://user:pass@proxy.scraperapi.com:8001

  try {
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
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
      // Stealth: override webdriver detection
      bypassCSP: true,
    });
  } catch (e) {
    // Clean up partial state if context creation failed after browser launched
    if (browser && !context) {
      try { await browser.close(); } catch { /* ignore */ }
      browser = null;
    }
    throw e;
  }

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

    // WebGL vendor/renderer spoofing
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param: number) {
      if (param === 0x9245) return "Intel Inc.";           // UNMASKED_VENDOR_WEBGL
      if (param === 0x9246) return "Intel Iris OpenGL Engine"; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, param);
    };

    // navigator.connection spoofing
    Object.defineProperty(navigator, "connection", {
      get: () => ({ effectiveType: "4g", rtt: 50, downlink: 10, saveData: false }),
    });

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

/** Safely close a page — never throws */
export async function safeClosePage(page: Page | null): Promise<void> {
  if (!page) return;
  try {
    await page.close();
  } catch {
    // Page may already be closed or browser crashed — ignore
  }
}

export async function closeBrowser(): Promise<void> {
  try {
    if (context) {
      await context.close();
      context = null;
    }
  } catch {
    context = null;
  }
  try {
    if (browser) {
      await browser.close();
      browser = null;
    }
  } catch {
    browser = null;
  }
}
