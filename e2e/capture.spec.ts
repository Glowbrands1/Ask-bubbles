import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { test } from "@playwright/test";

import { openNav, settle, signInAsDemo } from "./support";

/**
 * FULL-PAGE SCREENSHOTS FOR REVIEW, not assertions.
 *
 * Skipped unless E2E_CAPTURE_DIR is set, so it never slows the normal run:
 *
 *   E2E_CAPTURE_DIR=./test-results/screens/after npx playwright test capture
 *
 * Run it on two commits to get a before-and-after set with matching names.
 */
const OUT = process.env.E2E_CAPTURE_DIR;

const SCREENS: { name: string; path: string }[] = [
  { name: "home", path: "/" },
  { name: "chat", path: "/chat" },
  { name: "history", path: "/history" },
  { name: "forms-register", path: "/forms/monitoring" },
  { name: "form-templates", path: "/forms/templates" },
  { name: "knowledge", path: "/knowledge" },
  { name: "integrations", path: "/admin/integrations" },
];

test.describe("capture", () => {
  test.skip(!OUT, "set E2E_CAPTURE_DIR to capture screenshots");

  test("login", async ({ page }, info) => {
    const dir = join(OUT!, info.project.name);
    mkdirSync(dir, { recursive: true });
    await page.goto("/login");
    await settle(page);
    await page.screenshot({ path: join(dir, "login.png"), fullPage: true });
    await page.goto("/forgot-password");
    await settle(page);
    await page.screenshot({ path: join(dir, "forgot-password.png"), fullPage: true });
  });

  test("app screens", async ({ page }, info) => {
    test.setTimeout(180_000);
    const dir = join(OUT!, info.project.name);
    mkdirSync(dir, { recursive: true });
    await signInAsDemo(page, "owner");

    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await settle(page);
      await page.screenshot({ path: join(dir, `${screen.name}.png`), fullPage: false });
    }

    // The template editor, reached the way a person reaches it.
    await page.goto("/forms/templates");
    const template = page.getByRole("link", { name: /Check-In/i }).first();
    if (await template.isVisible()) {
      await template.click();
      await page.waitForURL(/\/forms\/templates\/.+/);
      await settle(page);
      await page.screenshot({ path: join(dir, "form-editor.png") });
    }

    // Navigation open: the drawer on mobile, the profile menu on both.
    await page.goto("/");
    await settle(page);
    await openNav(page);
    const profile = page.getByRole("button", { name: /Demo Owner/ }).filter({ visible: true }).first();
    if (await profile.isVisible()) {
      await profile.click();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: join(dir, "nav-and-profile-menu.png") });
  });
});
