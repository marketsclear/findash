import type { Browser, BrowserContext } from "playwright";

/** Shared headless Chromium for the adapters that need a real browser. */
let browser: Browser | null = null;

export async function browserContext(): Promise<BrowserContext> {
  if (!browser) {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ args: ["--disable-blink-features=AutomationControlled"] });
  }
  return browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1280, height: 900 },
  });
}

export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = null;
  if (b) await b.close().catch(() => {});
}
