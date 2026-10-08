import { expect, test, type Page } from "@playwright/test";

import { settle, signInAsDemo } from "./support";

/**
 * ============================================================================
 * VISUAL BASELINES for the approved Buff City Soap design.
 * ============================================================================
 *
 * One screenshot per key screen, per layout (desktop rail, mobile drawer),
 * compared against `e2e/__screenshots__/<project>/visual.spec.ts/`. A change
 * that moves the layout, swaps a colour or drops the logo fails here.
 *
 * WHEN A DESIGN CHANGE IS INTENDED, regenerate and review the new images in
 * the diff before committing them:
 *
 *   npm run e2e:update -- visual
 *
 * The clock is pinned so the greeting and the date in the Home band do not
 * change the picture from one morning to the next. The demo data is seeded,
 * so nothing else on these screens moves.
 */
const FIXED_NOW = new Date("2026-03-18T10:30:00-05:00");

async function pinClock(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
}

async function snap(page: Page, name: string) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false });
}

test.describe("visual", () => {
  test("login", async ({ page }) => {
    await pinClock(page);
    await page.goto("/login");
    await snap(page, "login");
  });

  test("forgot password", async ({ page }) => {
    await pinClock(page);
    await page.goto("/forgot-password");
    await snap(page, "forgot-password");
  });

  test("home", async ({ page }) => {
    await pinClock(page);
    await signInAsDemo(page, "location_manager");
    await page.goto("/");
    await snap(page, "home");
  });

  test("chat, empty", async ({ page }) => {
    await pinClock(page);
    await signInAsDemo(page, "location_manager");
    await page.goto("/chat");
    await snap(page, "chat");
  });

  test("history", async ({ page }) => {
    await pinClock(page);
    await signInAsDemo(page, "location_manager");
    await page.goto("/history");
    await snap(page, "history");
  });

  test("forms register", async ({ page }) => {
    await pinClock(page);
    await signInAsDemo(page, "location_manager");
    await page.goto("/forms/monitoring");
    await snap(page, "forms-register");
  });

  test("navigation open (drawer on mobile)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop rail is already in every desktop baseline");
    await pinClock(page);
    await signInAsDemo(page, "location_manager");
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(page.locator('nav[aria-label="Main"]:visible')).toBeVisible();
    await snap(page, "nav-drawer");
  });
});
