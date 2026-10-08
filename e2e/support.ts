import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Shared steps for the browser tests. Everything goes through the UI a person
 * would use — the demo role picker, the nav, the profile menu — so a spec that
 * passes is evidence the screen works, not that a shortcut does.
 */

export type DemoRole =
  | "employee"
  | "assistant_manager"
  | "location_manager"
  | "district_manager"
  | "regional_manager"
  | "owner";

/** The name and label each demo account carries (src/data/demo/users.ts). */
export const DEMO_IDENTITY: Record<DemoRole, { name: string; roleLabel: string; email: string }> = {
  employee: { name: "Demo Team Member", roleLabel: "Team Member", email: "demo-team-member@demo.invalid" },
  assistant_manager: {
    name: "Demo Assistant Manager",
    roleLabel: "Assistant Manager",
    email: "demo-assistant@demo.invalid",
  },
  location_manager: {
    name: "Demo Location Manager",
    roleLabel: "Location Manager",
    email: "demo-location@demo.invalid",
  },
  district_manager: {
    name: "Demo District Manager",
    roleLabel: "District Manager",
    email: "demo-district@demo.invalid",
  },
  regional_manager: {
    name: "Demo Regional Manager",
    roleLabel: "Regional Manager",
    email: "demo-regional@demo.invalid",
  },
  owner: { name: "Demo Owner", roleLabel: "Owner", email: "demo-owner@demo.invalid" },
};

/** Signs in through the demo role picker on /login and waits for the app. */
export async function signInAsDemo(page: Page, role: DemoRole = "location_manager") {
  await page.goto("/login");
  await page.locator("#demo-role").selectOption(role);
  await page.getByRole("button", { name: "Preview demo" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(mainNav(page).or(page.getByRole("button", { name: "Open navigation" }))).toBeVisible();
}

/** True when the viewport is using the drawer rather than the desktop rail. */
export async function usesDrawer(page: Page): Promise<boolean> {
  return page.getByRole("button", { name: "Open navigation" }).isVisible();
}

/** The main navigation — opens the drawer first on small screens. */
export async function openNav(page: Page): Promise<Locator> {
  if (await mainNav(page).isVisible()) return mainNav(page);
  if (await usesDrawer(page)) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  const nav = mainNav(page);
  await expect(nav).toBeVisible();
  return nav;
}

export function mainNav(page: Page): Locator {
  return page.locator('nav[aria-label="Main"]:visible');
}

/** The profile button at the foot of the rail (inside the drawer on mobile). */
export async function openUserMenuTrigger(page: Page, role: DemoRole): Promise<Locator> {
  await openNav(page);
  const trigger = page
    .getByRole("button", { name: new RegExp(DEMO_IDENTITY[role].name) })
    .filter({ visible: true })
    .first();
  await expect(trigger).toBeVisible();
  return trigger;
}

/** Waits for fonts and images so a screenshot shows the finished page. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => img.addEventListener("load", resolve, { once: true }))),
    );
  });
}
