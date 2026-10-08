import { expect, test } from "@playwright/test";

import { signInAsDemo } from "./support";

/**
 * KEY WORKFLOWS, end to end in the demo build: asking Bubbles, the forms
 * register, the template library and editor, history and search.
 */

test.describe("workflows", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsDemo(page, "owner");
  });

  test("Home offers the ask bar and the shortcuts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("textbox").first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });

  test("a starter prompt gets an answer from Bubbles", async ({ page }) => {
    await page.goto("/chat");
    const prompt = page.getByRole("button", { name: /attendance/i }).first();
    await expect(prompt).toBeVisible();
    await prompt.click();
    // The question appears in the thread, then an answer citing a source.
    await expect(page.getByText(/attendance/i).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Rate this conversation" })).toBeVisible();
  });

  test("the composer accepts a typed question", async ({ page }) => {
    await page.goto("/chat");
    const box = page.getByRole("textbox").last();
    await box.fill("How do I open the store for the day?");
    await expect(box).toHaveValue("How do I open the store for the day?");
  });

  /*
   * Forms live in the database, and the demo build has none connected, so
   * these screens say so rather than showing sample rows. Against a build with
   * a database (E2E_BASE_URL pointed at one) the same tests walk the real
   * register and editor.
   */
  const FORMS_OFFLINE = /Forms are not connected in this deployment/;

  test("the forms register lists forms with their follow-up state", async ({ page }) => {
    await page.goto("/forms/monitoring");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("main#main")).toContainText(
      new RegExp(`Employee|No forms yet|${FORMS_OFFLINE.source}`),
    );
  });

  test("the template library opens the template editor", async ({ page }) => {
    await page.goto("/forms/templates");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const main = page.locator("main#main");
    await expect(main).toContainText(new RegExp(`Check-In|${FORMS_OFFLINE.source}`, "i"));
    test.skip(FORMS_OFFLINE.test((await main.textContent()) ?? ""), "no forms database in this build");

    const template = page.getByRole("link", { name: /Check-In/i }).first();
    await template.click();
    await page.waitForURL(/\/forms\/templates\/.+/);
    await expect(main).toContainText(/Check-In/i);
  });

  test("history opens", async ({ page }) => {
    await page.goto("/history");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("global search opens from the top bar", async ({ page }) => {
    await page.goto("/");
    // Mobile: "Search Ask Bubbles" (icon button). Desktop: the search pill,
    // "Search documents, forms, locations and screens in Ask Bubbles".
    await page
      .getByRole("button", { name: /^Search\b.*\bAsk Bubbles$/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
