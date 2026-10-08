import { defineConfig } from "@playwright/test";

/**
 * ============================================================================
 * BROWSER TESTS — visual and functional checks of the real UI.
 * ============================================================================
 *
 * They run against a DEMO build: seeded data, no database, no API keys, so the
 * same suite works on a laptop, in CI and in a cloud session. Nothing here
 * talks to Supabase, Anthropic or Woven.
 *
 *   npm run e2e            build the demo app, start it, run every spec
 *   npm run e2e:update     same, and rewrite the visual baselines
 *   E2E_BASE_URL=http://localhost:3000 npm run e2e
 *                          run against a server you already started
 *
 * Two projects cover the two layouts the shell has: the desktop rail and the
 * mobile drawer. Every spec runs in both unless it opts out with
 * `test.skip(isMobile, …)`.
 *
 * The browser is the one `@playwright/test` ships with; set
 * PLAYWRIGHT_BROWSERS_PATH if your machine keeps it somewhere else.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results/e2e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { outputFolder: "./test-results/e2e-report", open: "never" }]],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Font hinting differs a little between machines; layout changes do not
      // hide under 1%.
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Chicago",
  },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run e2e:build && npx next start -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 600_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
