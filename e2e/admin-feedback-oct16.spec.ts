import { expect, test, type Page } from "@playwright/test";

import fixture from "./fixtures/admin-feedback-oct16.json";
import { signInAsDemo } from "./support";

/**
 * ADMIN FEEDBACK, 16 OCT 2026 — WHAT THE MANAGER SEES.
 *
 * The three reports were: the form would not populate, the stores were wrong,
 * and "ask the position of the employee". The server's answers are proven
 * against the real routes in `src/app/api/forms/admin-feedback-oct16-e2e.test.ts`;
 * the demo build cannot propose forms, so — like `multi-form-cards.spec.ts` —
 * this seeds the exact assistant turns that suite produces (the fixture is
 * checked against the server's output by that suite, so it cannot drift) and
 * checks the built chat screen shows them: the store by NAME rather than id,
 * the position and where it came from, the question when it is missing, and
 * the choice between two stores that share a city.
 *
 * Nothing is created: no Create is pressed. Every person is synthetic.
 */

type Scenario = keyof typeof fixture;

async function openConversation(page: Page, scenario: Scenario) {
  const { content, proposal } = fixture[scenario];
  const id = `conv-qa-oct16-${scenario}`;
  const conversation = {
    id,
    title: `Oct 16 ${scenario}`,
    createdAt: "2026-10-16T14:35:32.000Z",
    updatedAt: "2026-10-16T14:35:40.000Z",
    attachedDocumentIds: [],
    messages: [
      { id: "msg-qa-1", role: "user", content: "Create a CA form.", createdAt: "2026-10-16T14:35:32.000Z" },
      {
        id: "msg-qa-2",
        role: "assistant",
        content,
        createdAt: "2026-10-16T14:35:40.000Z",
        mode: "standard",
        coverage: "not_applicable",
        citations: [],
        formProposal: { ...proposal, sourceMessageIds: ["msg-qa-1"] },
      },
    ],
  };

  await signInAsDemo(page, "owner");
  await page.goto("/chat");
  await expect(page.getByRole("textbox").last()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.evaluate(async (stored) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("ask-bubbles-prototype");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("records", "readwrite");
        tx.objectStore("records").put({
          key: `chat_conversations::${stored.id}`,
          collection: "chat_conversations",
          id: stored.id,
          value: stored,
        });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, conversation);
  await page.goto(`/chat?c=${id}`);
  return page.locator("main#main");
}

test("a complete corrective action shows the store by name and the Woven position, and offers Create", async ({ page }) => {
  const main = await openConversation(page, "complete");

  await expect(main).toContainText("Pat Rivera");
  // The store the manager named ("Dodge"), as the roster names it — not `loc-264`.
  await expect(main.getByText("Omaha, NE (West Dodge Rd)").filter({ visible: true }).first()).toBeVisible();
  await expect(main).not.toContainText("loc-264");
  // The position, and where it came from, so a stale one is caught.
  await expect(main.getByText("Operator").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText(/from Woven/).filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByRole("button", { name: /create draft/i }).filter({ visible: true })).toHaveCount(1);
});

test("two stores that share a city are a question naming both, and nothing is offered until one is chosen", async ({ page }) => {
  const main = await openConversation(page, "ambiguousStore");

  await expect(main).toContainText("More than one store matches what you said");
  await expect(main.getByText("Sioux Falls, SD (W 41st St)").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("Sioux Falls, SD (E 18th St)").filter({ visible: true }).first()).toBeVisible();
  await expect(main).not.toContainText("Omaha");
  await expect(main.getByRole("button", { name: /create draft/i }).filter({ visible: true })).toHaveCount(0);
});

test("a missing position is asked for, on the card and in the reply", async ({ page }) => {
  const main = await openConversation(page, "noPosition");

  await expect(main).toContainText("position (job title)?");
  await expect(main.getByText(/Not set — tell Bubbles their position/).filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("Kearney, NE").filter({ visible: true }).first()).toBeVisible();
});
