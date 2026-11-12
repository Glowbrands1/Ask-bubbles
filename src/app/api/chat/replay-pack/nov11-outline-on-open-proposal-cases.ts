import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN OUTLINE PASTED ON AN OPEN PROPOSAL NEVER COSTS THE PROPOSAL ITS FACTS (QA's Bubbles 17i live test, 11 Nov 2026)
 * ============================================================================
 *
 * Admin, Create never pressed: (a) "create a corrective action for <A>, she was late on 11/3/26" → the card (Issue,
 * Attendance p.14); (b) an Observation / Action Plan outline written for another person → ignored; (c) "same outline but
 * with <A first>'s info" → no Issue, no Policy, a generic plan (live). In the pack, (c)'s Issue takes the outline's date.
 * OUTLINE_ON_OPEN_PROPOSAL_ENABLED. The tester's turns; the people are invented (B is on no roster).
 */
const FLAG = "OUTLINE_ON_OPEN_PROPOSAL_ENABLED";
const ILSA: DirectoryRow = { id: "e-oop-ilsa-varnholt", firstName: "Ilsa", lastName: "Varnholt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const A = "create a corrective action for Ilsa Varnholt, she was late on 11/3/26";
const OUTLINE =
  "Observation of Offense: Corisande Velt arrived 20 minutes late to her opening shift on 10/12/26 and did not call the manager on duty.\nAction Plan: The Leadership Team will coach Corisande on the Attendance policy and review call-in expectations. Further late arrivals may result in additional corrective action up to and including termination.";
const C = "same outline but with Ilsa's info";

function start(t: ReplayContext) {
  t.directory([...STAFF, ILSA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function keepsStepA(reply: { content: string }, card: Record<string, unknown> | null, step: string) {
  expect(card, `${step}: no card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Ilsa Varnholt" });
  expect(String(card?.issue ?? ""), `${step}: the Issue is not step (a)'s:\n${reply.content}`).toMatch(/late on 11\/3\/26/);
  expect(reply.content, `${step}: the outline's person or date is on the card:\n${reply.content}`).not.toMatch(/Corisande|10\/12\/26/);
  expect(reply.content, `${step}: the Attendance policy is lost:\n${reply.content}`).toMatch(/\*\*Policy:\*\*[^\n]*Attendance/);
}

export const NOV11_OUTLINE_ON_OPEN_PROPOSAL_CASES: ReplayCase[] = [
  {
    id: "nov11-17i-outline-on-open-proposal",
    title: "a proposal, an outline for another person pasted, then \"same outline but with Ilsa's info\": step (a)'s Issue, date and Attendance policy are kept",
    report: "QA's Bubbles 17i live test, 11 Nov 2026 (admin; Create never pressed)",
    status: { open: "\"same outline but with Ilsa's info\" re-reads the outline as her account: the Issue takes the outline's date 10/12/26 (live: no Issue, no Policy)" },
    fixFlags: [FLAG],
    async run(t) {
      const thread = start(t);
      const a = await thread.say(A);
      keepsStepA(a, thread.proposal as Record<string, unknown> | null, "a");
      const b = await thread.say(OUTLINE);
      keepsStepA(b, thread.proposal as Record<string, unknown> | null, "b");
      const c = await thread.say(C);
      keepsStepA(c, thread.proposal as Record<string, unknown> | null, "c");
      // QA (11 Nov 2026): Create after the three turns — the outline's person, date and events never reach the draft.
      t.draftWrites({ observation: "Observed:\nIlsa Varnholt was late on 11/3/26." });
      const id = await thread.create();
      const described = t.draftPrompts().map((prompt) => prompt.split("WHAT THE MANAGER DESCRIBED:")[1] ?? "").join("\n");
      expect(described, `the outline reached the drafting model:\n${described}`).not.toMatch(/Corisande|10\/12\/26|did not call the manager/i);
      expect(described, `step (a)'s account did not reach the drafting model:\n${described}`).toMatch(/late on 11\/3\/26/);
      const saved = Object.values(t.values(id)).join("\n");
      expect(saved, `the outline's person or date is on the draft:\n${saved}`).not.toMatch(/Corisande|10\/12\/26/);
    },
  },
];

/*
 * Changed on purpose (12 Nov 2026, QA round 17o): these guards dated her account 11/3/26, after the pack's TODAY
 * (2026-10-26). With FUTURE_INCIDENT_DATE_ASK on in production a future incident date is asked, never put on the card,
 * so the date check failed for a reason the guards are not about. They now use 10/3/26, before TODAY; every assertion
 * is the same.
 *
 * Gate-Bubbles-4's NO-GO on B#802 (G4-802, 12 Nov 2026): the manager's own account, labelled or asking for "this format",
 * was read as an outline and lost. Guards: production keeps it, and so does the flag (an outline names another person).
 */
const OWN_ACCOUNT = [
  ["labelled-account", "create a corrective action for Ilsa Varnholt", "Date: 10/3/26\nWhat happened: Ilsa Varnholt arrived 40 minutes late and did not call in.", /40 minutes late/],
  ["this-format", "create a corrective action for Ilsa Varnholt", "Ilsa Varnholt was late on 10/3/26. Use this format for the action plan.", /late on 10\/3\/26/],
  // Gate-Sunny-3's NO-GO on the sibling's S#875 (12 Nov 2026): her account names a coworker who covered.
  ["coworker-named", "create a corrective action for Ilsa Varnholt", "Date: 10/3/26\nWhat happened: Ilsa was 40 minutes late to her opening shift. Jordan had to cover the front desk until she arrived", /40 minutes late/],
  // Gate-Sunny-3's round 3 (12 Nov 2026): her account in the form's own labels, a pronoun subject and a coworker named.
  ["form-labels-pronoun-subject", "create a corrective action for Ilsa Varnholt", "Observation of Offense: she arrived 40 minutes late to her opening shift on 10/3/26. Jordan had to open the store.\nAction Plan: Leadership will review the attendance policy with her", /40 minutes late/],
] as const;

export const NOV12_OUTLINE_OWN_ACCOUNT_CASES: ReplayCase[] = OWN_ACCOUNT.map(([key, request, account, kept]) => ({
  id: `nov12-g4-802-own-account-kept-${key}`,
  title: `"${request}", then "${account.replace(/\n/g, " / ")}": her own account reaches the card and the draft`,
  report: "Gate-Bubbles-4's NO-GO on OUTLINE_ON_OPEN_PROPOSAL (G4-802, 12 Nov 2026)",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t) {
    const thread = start(t);
    await thread.say(request);
    const reply = await thread.say(account);
    expect(thread.proposal, `no card for Ilsa Varnholt:\n${reply.content}`).toMatchObject({ employeeName: "Ilsa Varnholt" });
    expect(reply.content, `her account was read as an outline:\n${reply.content}`).not.toMatch(/pasted example/);
    // Gate-Sunny-3 (round 3): the card keeps the date she gave.
    if (/10\/3\/26/.test(account)) expect((thread.proposal as { formDate?: string | null } | null)?.formDate ?? null, `the card lost the date:\n${reply.content}`).toBe("2026-10-03");
    t.draftWrites({ observation: "Observed:\nIlsa Varnholt was late." });
    await thread.create();
    const described = t.draftPrompts().map((prompt) => prompt.split("WHAT THE MANAGER DESCRIBED:")[1] ?? "").join("\n");
    expect(described, `her account did not reach the drafting model:\n${described}`).toMatch(kept);
  },
}));

/*
 * QA's 17o live test (12 Nov 2026, main 815ae303; HIGH; names invented). (1) "create a CA for <A>, she was late on
 * 11/3/26" made A's card; (2) a paste with real line breaks, "Name: <E>\nDate: 10/12/26\nObservation: <E> did not call
 * in", made a NEW card for E (Issue "Observation: <E> did not call in", 10/12/26) and A's card was superseded; (3) "same
 * outline but with <A first>'s info" said "I've kept **<E>**'s own details; nothing from the person in the pasted
 * example goes on this card." A labelled outline pasted while a card is open is the open card's outline, never a new
 * request; the note never names the outline's person.
 */
export const NOV12_OUTLINE_LABELLED_PASTE_CASES: ReplayCase[] = [
  {
    id: "nov12-17o-labelled-paste-not-a-new-request",
    title: "\"Name: <E> / Date: 10/12/26 / Observation: <E> did not call in\" pasted on A's open card makes no card for E; \"same outline but with <A>'s info\" keeps A's card",
    report: "QA's Bubbles 17o live test, 12 Nov 2026 (HIGH): the labelled paste made a new card for E and the note said E's details were kept",
    // OUTLINE_ON_OPEN_PROPOSAL is on in production since 17o; before this fix both arms made a card from the paste.
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
      const thread = start(t);
      const a = await thread.say("create a CA for Ilsa Varnholt, she was late on 11/3/26");
      keepsStepA(a, thread.proposal as Record<string, unknown> | null, "1");
      const b = await thread.say("Name: Corisande Velt\nDate: 10/12/26\nObservation: Corisande Velt did not call in");
      keepsStepA(b, thread.proposal as Record<string, unknown> | null, "2");
      const c = await thread.say("same outline but with Ilsa's info");
      keepsStepA(c, thread.proposal as Record<string, unknown> | null, "3");
      expect(c.content, "the note names the outline's person as the one kept").not.toMatch(/kept \*\*Corisande/);
    },
  },
];
