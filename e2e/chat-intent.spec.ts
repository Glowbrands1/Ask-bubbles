import { expect, test, type Page } from "@playwright/test";

import { signInAsDemo } from "./support";

/**
 * HOW BUBBLES READS A MANAGER'S WORDS, IN THE BROWSER.
 *
 * The demo build cannot propose a form — it has no template library and no
 * verified scope, and says so — but it reads the sentence with the same
 * `detectTemplateIntent` the server uses. So a form request typed in workplace
 * shorthand gets the preview's "I can't propose a form" answer, and anything
 * else gets an ordinary answer. That makes the built bundle's reading of
 * "final written", "phone screen", "c/a" and "don't make a form" observable
 * end to end, through the real composer and thread.
 *
 * All people are synthetic.
 */

const FORM_REQUEST = /can't propose a form in preview mode/i;

/**
 * Sends a question through the composer, waits for Bubbles to finish
 * answering it, and returns the text of the thread AFTER that question — the
 * newest answer, not anything earlier on the page.
 */
async function ask(page: Page, question: string): Promise<string> {
  const main = page.locator("main#main");
  await page.getByRole("textbox").last().fill(question);
  await page.getByRole("button", { name: "Send message" }).filter({ visible: true }).last().click();
  await expect(page.getByText(question, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  const answer = async () => {
    const text = (await main.textContent()) ?? "";
    return text.slice(text.lastIndexOf(question) + question.length);
  };
  await expect
    .poll(
      async () => {
        if ((await page.getByText("Bubbles is thinking").count()) > 0) return false;
        const after = await answer();
        // The answer's own header ("Bubbles") and some prose after it.
        return after.includes("Bubbles") && after.length > 120;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return answer();
}

test.describe("chat reads shorthand, jargon and negation", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsDemo(page, "location_manager");
    await page.goto("/chat");
  });

  for (const request of [
    "final written for jordan testperson",
    "pls start a c/a for jordan testperson",
    "phone screen for a candidate named Sam Rivera",
    "step jordan testperson down to associate",
  ]) {
    test(`'${request}' is read as a form request`, async ({ page }) => {
      expect(await ask(page, request)).toMatch(FORM_REQUEST);
    });
  }

  for (const notARequest of [
    "actually don't make a form, how do I talk to her about lateness?",
    "how do i fill out an interview form?",
    "phone screen tips?",
  ]) {
    test(`'${notARequest}' is answered, not treated as a form request`, async ({ page }) => {
      expect(await ask(page, notARequest)).not.toMatch(FORM_REQUEST);
    });
  }

  test("a two-turn conversation: advice first, then the form in shorthand", async ({ page }) => {
    expect(await ask(page, "how should I handle an employee who keeps showing up late?")).not.toMatch(FORM_REQUEST);
    expect(await ask(page, "ok, final written for jordan testperson")).toMatch(FORM_REQUEST);
  });
});
