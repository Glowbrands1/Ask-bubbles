import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * THE REGULAR CHAT'S ADMIN CARD ASKS WHICH STORE; CREATE NEVER SAVES ONE WITH NO STORE (QA, 23 Nov 2026, after A2 #1087)
 * ============================================================================
 *
 * QA's ruling (i) on A2 left the old chat's admin cards as they were: a login that covers every store got "Your account
 * covers every store, so the form won't name one", and Create saved the form with location null. Now that card asks
 * which store, every store offered (`forms/proposal.ts`, as a manager over several stores is asked), and Create refuses
 * any card with no store (`create-inline-form.ts`), unless the manager stated it is for no store (U04, the loop's). A store
 * named in the manager's words, or the person's Woven store, still fills the card as before. Invented people.
 */

const REPORT = "QA (23 Nov 2026, after A2 #1087): the regular chat's admin cards (\"your account covers every store\") saved location null";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
/** No Woven store: nothing can fill the card's store. */
const NO_STORE: readonly DirectoryRow[] = REFUSAL_ROSTER.map((row) => ({ ...row, locationIds: [] }));
const ASK = "create a coaching form for Marnie Holloway, she was late to her shift on 11/8/26";

type Card = { status?: string; locationId?: string | null; locationResolution?: string; authorizedLocationIds?: string[]; supportsInlineDraft?: boolean } | undefined;

function start(t: ReplayContext, rows: readonly DirectoryRow[]) {
  vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
  t.directory(rows);
  t.as("admin", ADMIN);
}

async function refused(create: () => Promise<unknown>): Promise<string | null> {
  try {
    await create();
    return null;
  } catch (thrown) {
    return String((thrown as Error)?.message ?? thrown);
  }
}

export const NOV23_REGULAR_ADMIN_CARD_ASKS_STORE_CASES: ReplayCase[] = [
  {
    id: "nov23-regular-admin-card-asks-store",
    title: `The regular chat, an admin, "${ASK}" (the person at no Woven store): the card asks which store, every store offered; Create on it saves nothing`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, NO_STORE);
      const thread = t.thread();
      const reply = await thread.say(ASK);
      const card = thread.proposal as Card;
      expect(card?.locationId ?? null, JSON.stringify(card)).toBeNull();
      expect(card?.locationResolution, "the card does not ask which store").toBe("needs_selection");
      expect((card?.authorizedLocationIds ?? []).length, "not every store offered").toBeGreaterThan(1);
      expect(reply.content, reply.content).toMatch(/Which store is this about\?/);
      expect(reply.content, reply.content).not.toMatch(/won't name one/);
      const before = t.forms().length;
      expect(await refused(() => thread.create()), "Create on a card with no store was not refused").toMatch(/Which store is this about\?/);
      expect(t.forms().length, "Create saved a form with no store").toBe(before);
    },
  },
  {
    id: "nov23-regular-admin-card-store-picked-saved",
    title: "The regular chat, an admin: with the store picked on the card, Create saves the form at that store",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, NO_STORE);
      const thread = t.thread();
      await thread.say(ASK);
      const id = await thread.create("loc-264");
      expect((t.forms() as Array<{ id: string; location_id?: string | null }>).find((row) => row.id === id)?.location_id).toBe("loc-264");
    },
  },
  {
    id: "nov23-regular-admin-card-woven-store-filled",
    title: "Control: the regular chat, an admin, the person at one Woven store: the card is filed there and Create saves it, as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t, REFUSAL_ROSTER);
      const thread = t.thread();
      await thread.say(ASK);
      const card = thread.proposal as Card;
      expect(card?.locationResolution, JSON.stringify(card)).toBe("resolved");
      const id = await thread.create();
      expect((t.forms() as Array<{ id: string; location_id?: string | null }>).find((row) => row.id === id)?.location_id).toBe(card?.locationId);
    },
  },
];
