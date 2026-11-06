import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A STORE IS NEVER A MISSING PERSON (QA, the flip-3 gate, 6 Nov 2026;
 * STORE_WORD_NOT_A_MISSING_PERSON_ENABLED)
 * ============================================================================
 *
 * With the name flags of flip 3, a store word typed where a name goes
 * ("coaching form for Dodge, the team was slow …") was said back as "I
 * couldn't find **Dodge** in the Woven roster": the store, as a missing
 * person. The store's own Woven account ("Dodge Account") is already never a
 * person in production (SHARED_LOGIN_NOT_STAFF_ENABLED); the roster here keeps
 * two such rows so that stays checked. A real person whose first name is the
 * store word is still found. The names are invented and on no directory.
 */
const FLAGS = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "OFF_ROSTER_CONFIRM_ENABLED",
  "STORE_WORD_NOT_A_MISSING_PERSON_ENABLED",
];

/** A second store account, as the directory has one per store. */
const KEARNEY_ACCOUNT = { id: "e-8", firstName: "Kearney", lastName: "Account", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Team Member Full Time" };
/** A real person whose first name is a word of their own store's name. */
const DODGE_PELLERIN = { id: "e-9", firstName: "Dodge", lastName: "Pellerin", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

const NOT_FOUND_STORE = /I couldn['’]t find \*\*Dodge\*\* in the Woven roster/;

export const NOV6_STORE_WORD_CASES: ReplayCase[] = [
  {
    id: "nov6-store-word-never-a-missing-person",
    title: "\"coaching form for Dodge, the team was slow at the register on 11/2\": the store is never said back as a person not found, nor offered as the store account",
    report: "QA, the flip-3 gate (6 Nov 2026): a store word was said back as a person not found",
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      t.directory([...STAFF, KEARNEY_ACCOUNT] as never);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("coaching form for Dodge, the team was slow at the register on 11/2");
      expect(reply.content, `the store is said back as a missing person:\n${reply.content}`).not.toMatch(NOT_FOUND_STORE);
      expect(reply.content, `the store account is offered as a person:\n${reply.content}`).not.toMatch(/\*\*Dodge Account\*\*/);
      expect(thread.proposal?.employeeName ?? null, "the store account is the card's employee").not.toBe("Dodge Account");
    },
  },
  {
    id: "nov6-store-word-real-person-full-name",
    title: "the reverse: \"create a ca form for Dodge Pellerin, …\" (a real person whose first name is the store word) is still his card",
    report: "QA, the flip-3 gate (6 Nov 2026): the store-word rule never hides a real person",
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      t.directory([...STAFF, KEARNEY_ACCOUNT, DODGE_PELLERIN] as never);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a ca form for Dodge Pellerin, he was late opening the store on 11/2");
      expect(thread.proposal, `not his card:\n${reply.content}`).toMatchObject({ employeeName: "Dodge Pellerin" });
    },
  },
  {
    id: "nov6-store-word-real-person-first-name",
    title: "the reverse: \"create a ca form for Dodge, …\" with a real Dodge on the roster asks about him, never the store account",
    report: "QA, the flip-3 gate (6 Nov 2026): the store-word rule never hides a real person",
    status: "fixed",
    fixFlags: FLAGS,
    async run(t) {
      t.directory([...STAFF, KEARNEY_ACCOUNT, DODGE_PELLERIN] as never);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a ca form for Dodge, he was late opening the store on 11/2");
      expect(reply.content, `the store account is offered as a person:\n${reply.content}`).not.toMatch(/\*\*Dodge Account\*\*/);
      const asksHim = /\*\*Dodge Pellerin\*\*/.test(reply.content) || thread.proposal?.employeeName === "Dodge Pellerin";
      expect(asksHim, `Dodge Pellerin is neither asked about nor on the card:\n${reply.content}`).toBe(true);
    },
  },
];
