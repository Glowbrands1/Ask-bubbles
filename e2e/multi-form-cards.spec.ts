import { expect, test } from "@playwright/test";

import { signInAsDemo } from "./support";

/**
 * TWO FORMS IN ONE MESSAGE, IN THE BROWSER.
 *
 * Owner's signed-in QA, 8 Oct 2026: "coaching form for Avery Testperson and a
 * CA for Jordan Testperson" showed ONE card asking which of the two it was for.
 * The server now answers with one proposal per form (proven against the real
 * routes in `src/app/api/forms/multi-form-chat-e2e.test.ts`). The demo build
 * cannot propose forms, so this seeds that answer exactly as the chat stores it
 * and checks the built page renders it as two independent cards — each naming
 * its own person, each with its own Create — on desktop and mobile. Nothing is
 * created: no Create is pressed.
 *
 * All people are synthetic.
 */

const CONVERSATION_ID = "conv-qa-two-forms";

function card(proposalId: string, templateKey: string, templateName: string, employeeName: string, clause: string) {
  return {
    proposalId,
    templateKey,
    templateName,
    supportsInlineDraft: true,
    variantKey: null,
    employeeName,
    employeeRole: null,
    formDate: null,
    locationId: null,
    locationName: null,
    locationResolution: "not_applicable",
    authorizedLocationIds: [],
    status: "ready",
    sourceMessageIds: ["msg-qa-1"],
    sourceExcerpts: { "msg-qa-1": clause },
  };
}

const coaching = card("prop-qa-avery", "coaching", "Coaching Form", "Avery Testperson", "coaching form for Avery Testperson");
const ca = card("prop-qa-jordan", "dpoa", "Corrective Action Form", "Jordan Testperson", "a CA for Jordan Testperson");

const CONVERSATION = {
  id: CONVERSATION_ID,
  title: "Two forms QA",
  createdAt: "2026-10-08T23:29:09.000Z",
  updatedAt: "2026-10-08T23:29:10.000Z",
  attachedDocumentIds: [],
  messages: [
    {
      id: "msg-qa-1",
      role: "user",
      content: "coaching form for Avery Testperson and a CA for Jordan Testperson",
      createdAt: "2026-10-08T23:29:09.000Z",
    },
    {
      id: "msg-qa-2",
      role: "assistant",
      content:
        "You asked for two forms, so here are two separate cards — each is created and drafted on its own, only from what you said about that person.",
      createdAt: "2026-10-08T23:29:10.000Z",
      mode: "standard",
      coverage: "not_applicable",
      citations: [],
      formProposal: coaching,
      formProposals: [coaching, ca],
    },
  ],
};

test("two forms asked for in one message render as two independent cards", async ({ page }) => {
  await signInAsDemo(page, "location_manager");
  await page.goto("/chat");
  /*
   * Seeded only once the app has hydrated: its first write-back replaces the
   * stored conversations with what is in memory, and would erase a record put
   * there any earlier.
   */
  await expect(page.getByRole("textbox").last()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.evaluate(async (conversation) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("ask-bubbles-prototype");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("records", "readwrite");
        tx.objectStore("records").put({
          key: `chat_conversations::${conversation.id}`,
          collection: "chat_conversations",
          id: conversation.id,
          value: conversation,
        });
        tx.oncomplete = () => {
          open.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, CONVERSATION);

  await page.goto(`/chat?c=${CONVERSATION_ID}`);
  const main = page.locator("main#main");
  await expect(main).toContainText("You asked for two forms");

  const creates = main.getByRole("button", { name: /create draft/i }).filter({ visible: true });
  await expect(creates).toHaveCount(2);
  await expect(main.getByText("Avery Testperson").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("Jordan Testperson").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("Coaching Form").filter({ visible: true }).first()).toBeVisible();
  await expect(main.getByText("Corrective Action Form").filter({ visible: true }).first()).toBeVisible();
  // Never the old single card's question.
  await expect(main).not.toContainText("Which of them");
});
