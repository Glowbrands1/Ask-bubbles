import { expect, test } from "@playwright/test";

import { DEMO_IDENTITY, mainNav, openNav, openUserMenuTrigger, signInAsDemo, usesDrawer } from "./support";

/**
 * THE SHELL: sign-in, navigation, the profile menu and role-driven nav.
 *
 * These describe behaviour, not looks, so they hold across a redesign — the
 * same file is the regression check before and after a visual change.
 */

test.describe("sign-in", () => {
  test("a demo role signs in and lands inside the app", async ({ page }) => {
    await signInAsDemo(page, "location_manager");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("main#main")).toBeVisible();
  });

  test("the login screen offers password recovery", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("navigation", () => {
  test("every nav item opens its page and is the only one marked current", async ({ page }) => {
    await signInAsDemo(page, "owner");
    const nav = await openNav(page);
    const hrefs = await nav.locator("a[href^='/']").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(4);

    for (const href of hrefs) {
      const current = await openNav(page);
      await current.locator(`a[href='${href}']`).click();
      await page.waitForURL((url) => url.pathname === href || url.pathname.startsWith(`${href}/`));

      await page.waitForLoadState("networkidle");

      const after = await openNav(page);
      const marked = after.locator("[aria-current='page']");
      await expect(marked, `exactly one current item on ${href}`).toHaveCount(1);
      await expect(marked).toHaveAttribute("href", href);

      if (await usesDrawer(page)) {
        await page.getByRole("button", { name: "Close navigation" }).last().click();
        await expect(mainNav(page)).toHaveCount(0);
      }
    }
  });

  test("the drawer closes after choosing a page on small screens", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the desktop rail has no drawer");
    await signInAsDemo(page);
    const nav = await openNav(page);
    await nav.locator("a[href='/history']").click();
    await page.waitForURL(/\/history$/);
    await expect(mainNav(page)).toHaveCount(0);
  });
});

test.describe("profile menu", () => {
  for (const role of ["location_manager", "employee"] as const) {
    test(`shows the signed-in ${role} — name, role, email`, async ({ page }) => {
      const who = DEMO_IDENTITY[role];
      await signInAsDemo(page, role);
      const trigger = await openUserMenuTrigger(page, role);
      await expect(trigger).toContainText(who.name);
      await expect(trigger).toContainText(who.roleLabel);

      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await expect(menu).toContainText(who.email);

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    });
  }

  test("sign out returns to the login screen", async ({ page }) => {
    await signInAsDemo(page);
    const trigger = await openUserMenuTrigger(page, "location_manager");
    await trigger.click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Preview demo" })).toBeVisible();
  });
});

test.describe("permissions drive the rail", () => {
  test("a team member does not see the forms register or admin", async ({ page }) => {
    await signInAsDemo(page, "employee");
    const nav = await openNav(page);
    await expect(nav.locator("a[href='/forms/monitoring']")).toHaveCount(0);
    await expect(nav.locator("a[href^='/admin']")).toHaveCount(0);
  });

  test("an owner sees the forms register and admin", async ({ page }) => {
    await signInAsDemo(page, "owner");
    const nav = await openNav(page);
    await expect(nav.locator("a[href='/forms/monitoring']")).toHaveCount(1);
    await expect(nav.locator("a[href^='/admin']").first()).toBeVisible();
  });
});
