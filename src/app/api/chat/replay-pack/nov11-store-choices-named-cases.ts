import { expect, vi } from "vitest";

import { locationById } from "@/lib/locations";

import { STAFF, TWO_STORES, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * PROBLEM 20 (Bubbles production, 10 Nov 2026): THE STORE QUESTION NEVER NAMED THE STORES (STORE_CHOICES_NAMED_ENABLED)
 * ============================================================================
 *
 * A manager covering two stores, in their words: "Can you make a coaching form for my employees that had a lower than
 * $50 average transaction for laundry sale this weekend" → "Who is this form for?" → "This is for <name>" → "I won't
 * choose which store this belongs to. Which store is this about?" (the person works at both stores in Woven) → the same
 * request sent again → "I still need to know which location this is about…" and the same question, with no store named;
 * no card was made. The person and stores here are invented; the manager's words are kept.
 */
const ASK = "Can you make a coaching form for my employees that had a lower than $50 average transaction for laundry sale this weekend";
const FIX = ["STORE_CHOICES_NAMED_ENABLED"];
const REPORT = "Problem 20, Bubbles production (10 Nov 2026): the store question repeated with no store named, no card made";

const WREN: DirectoryRow = {
  id: "e-wren-tallis-p20",
  firstName: "Wren",
  lastName: "Tallis",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-67", "loc-264"],
  positionName: "Team Member Part Time",
};

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T20:39:00Z"));
  t.directory([...STAFF, WREN]);
  t.as("location_manager", TWO_STORES);
  return t.thread();
}

const STORES = () => [locationById("loc-67")!.name, locationById("loc-264")!.name];

export const NOV11_STORE_CHOICES_NAMED_CASES: ReplayCase[] = [
  {
    id: "nov11-p20-store-question-names-the-stores",
    title: "the store question names Wren's two stores, and the request sent again is answered with them, not the bare question",
    report: REPORT,
    status: { open: "\"Which store is this about?\" names no store, on the first ask and again after the request is sent again" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(ASK);
      const named = await thread.say("This is for Wren Tallis");
      expect(thread.proposal, `no card for Wren:\n${named.content}`).toMatchObject({ employeeName: "Wren Tallis", status: "needs_location" });
      for (const store of STORES()) expect(named.content, `the store question does not name ${store}`).toContain(store);
      const again = await thread.say(ASK);
      for (const store of STORES()) expect(again.content, `sent again, the reply does not name ${store}`).toContain(store);
      expect(again.content, "sent again, the bare question came back").not.toContain("I won't choose which store this belongs to. Which store is this about?");
    },
  },
  {
    id: "nov11-p20-account-kept-for-the-named-person",
    title: "once the store is named, Wren's card is made and the draft is handed the manager's account (the $50 average transaction)",
    report: `${REPORT} (the account is kept)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(ASK);
      await thread.say("This is for Wren Tallis");
      await thread.say(ASK);
      const chosen = await thread.say(STORES()[0]!);
      expect(thread.proposal, `no ready card:\n${chosen.content}`).toMatchObject({ employeeName: "Wren Tallis", status: "ready" });
      t.draftWrites({ coaching_details: "Wren's average transaction for the laundry sale was under $50 this weekend." });
      await thread.create();
      expect(t.draftPrompts().join("\n"), "the draft was not handed the account").toMatch(/lower than \$50 average transaction for laundry sale/i);
    },
  },
];
