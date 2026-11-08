import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "TAKE THE ATTENDANCE POLICY OFF THE FORM" LEFT IT ON THE CARD (QA, 8 Nov 2026)
 * ============================================================================
 *
 * Live in this app (00:20, 8 Nov 2026) and in the sibling app's flip-7 tester ("take the policy off" not honoured):
 * on a proposal card (no draft yet), "take the attendance policy off the form", sent after the manager had named the
 * Attendance policy, left the card's Attendance citation and "Policy: Attendance, as you said", and the sentence was
 * read back as account. REMOVE_POLICY_NOT_NAMED (live) only stops the take-off sentence from naming the policy; its
 * replay (nov7-a1-*) asserts only that. PROPOSAL_POLICY_SET_ASIDE_ENABLED (`forms/policy-set-aside.ts`). The
 * manager's words; the person is the pack's invented Marnie Holloway.
 */

const SAID = "take the attendance policy off the form";
const REMARK = "In the past we have quoted the standards of conduct for creating a ca due to underperformance";
const CA_REQUEST = "create a corrective action for marnie holloway for violating the attendance policy, she was 30 minutes late to her shift on 10/31";
const COACHING_REQUEST = "create a coaching form for marnie holloway, she was 30 minutes late to her shift on 10/31. cite the attendance policy";
const FIX = ["PROPOSAL_POLICY_SET_ASIDE_ENABLED"];
const REPORT = "QA, 8 Nov 2026 (live in both apps): \"take the attendance policy off the form\" after naming it left the Policy line on the card";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The card's Policy row and its manual citations: what the card says it will cite. */
function policyLines(reply: ReplayAnswer): string[] {
  return reply.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\*\*Policy:\*\*/.test(line) || (/JBA Policy Manual/i.test(line) && !line.startsWith("**Action")))
    // The card's own line saying the policy came off cites nothing.
    .filter((line) => !/\btook the\b[^\n]*\bpolicy off\b/i.test(line));
}

/** This app's card gives the account on its Issue line (a Corrective Action) or not at all (a Coaching Form). */
function observationLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*(?:Observation of Offense|Issue):?\*\*/i.test(line)) ?? "";
}

function takenOff(reply: ReplayAnswer): void {
  const lines = policyLines(reply);
  expect(lines.filter((line) => /attendance/i.test(line)), `the Attendance policy is still on the card:\n${reply.content}`).toEqual([]);
  expect(reply.content, "the reply does not say the policy came off").toMatch(/took the (?:Attendance )?policy off/i);
  expect(observationLine(reply), "the take-off is read as account").not.toMatch(/take the|off the form/i);
}

export const NOV8_PROPOSAL_POLICY_SET_ASIDE_CASES: ReplayCase[] = [
  {
    id: "nov8-policy-set-aside-ca-card",
    title: "CA card, Attendance named: \"take the attendance policy off the form\" takes it off the card and says so",
    report: REPORT,
    status: { open: "the card keeps \"Policy: Attendance, as you said\" and the manual citation, and the sentence is added to the Observation" },
    // Changed on purpose (coding 2, 8 Nov 2026): since Bubbles main e7a7ba9 this CA-card take-off is answered as a policy
    // question first; TAKE_OFF_STAYS_CARD_ENABLED keeps it a card turn (and proposes the card from the request turn, with
    // the take-off in its sources, so Create keeps the account), so with both flags on it holds.
    fixFlags: [...FIX, "TAKE_OFF_STAYS_CARD_ENABLED"],
    fixFlags: FIX,
    // Changed on purpose (8 Nov 2026, merging main e7a7ba9c): since main, the route answers this take-off turn as a
    // policy question before the card is built, as it already did on a Coaching card. It holds again with coding 2's
    // TAKE_OFF_STAYS_CARD_ENABLED (Glowbrands1/Ask-bubbles#578, stacked on this branch); open with this flag alone until then.
    fixStatus: { open: "the route answers the take-off as a policy question before the card is built (TAKE_OFF_STAYS_CARD, #578)" },
    async run(t) {
      const thread = start(t);
      const first = await thread.say(CA_REQUEST);
      expect(policyLines(first).some((line) => /attendance/i.test(line)), "the card cites Attendance first").toBe(true);
      const reply = await thread.say(SAID);
      expect(thread.proposal?.templateKey).toBe("dpoa");
      takenOff(reply);
      expect(observationLine(reply), "the account is kept").toMatch(/attendance policy|30 minutes late/i);
    },
  },
  {
    id: "nov8-policy-set-aside-coaching-card",
    title: "Coaching card, Attendance named: \"take the attendance policy off the form\" takes it off the card and says so",
    report: REPORT,
    status: { open: "the take-off is answered as a policy question (\"A grounded answer from the policy manual.\"), never on the card" },
    // Changed on purpose (coding 2, 8 Nov 2026): the turn never reached the card, because the route answered it as a
    // policy question first. TAKE_OFF_STAYS_CARD_ENABLED (`ai/take-off-stays-card.ts`, server-ask.ts) keeps it a card
    // turn, so with both flags on it holds; fixStatus removed.
    fixFlags: [...FIX, "TAKE_OFF_STAYS_CARD_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(COACHING_REQUEST);
      const reply = await thread.say(SAID);
      expect(thread.proposal?.templateKey).toBe("coaching");
      takenOff(reply);
    },
  },
  {
    id: "nov8-policy-set-aside-stays-off",
    title: "…and a later turn on the card keeps it off",
    report: REPORT,
    status: { open: "the card keeps \"Policy: Attendance, as you said\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(CA_REQUEST);
      await thread.say(SAID);
      const reply = await thread.say("she also left 10 minutes early that day");
      expect(policyLines(reply).filter((line) => /attendance/i.test(line)), `the Attendance policy came back:\n${reply.content}`).toEqual([]);
    },
  },
  {
    id: "nov8-policy-set-aside-ca-create",
    title: "…then Create: the Corrective Action Form's Policy Violated and Policy Language do not cite Attendance",
    report: REPORT,
    status: { open: "the draft's Policy Violated is \"Attendance Policy, JBA Policy Manual p.14\" with its Policy Language" },
    // Changed on purpose (coding 2, 8 Nov 2026): since Bubbles main e7a7ba9 this CA-card take-off is answered as a policy
    // question first; TAKE_OFF_STAYS_CARD_ENABLED keeps it a card turn (and proposes the card from the request turn, with
    // the take-off in its sources, so Create keeps the account), so with both flags on it holds.
    fixFlags: [...FIX, "TAKE_OFF_STAYS_CARD_ENABLED"],
    fixFlags: FIX,
    // Changed on purpose (8 Nov 2026, merging main e7a7ba9c): since main, the route answers this take-off turn as a
    // policy question before the card is built, as it already did on a Coaching card. It holds again with coding 2's
    // TAKE_OFF_STAYS_CARD_ENABLED (Glowbrands1/Ask-bubbles#578, stacked on this branch); open with this flag alone until then.
    fixStatus: { open: "the route answers the take-off as a policy question before the card is built (TAKE_OFF_STAYS_CARD, #578)" },
    async run(t) {
      const thread = start(t);
      await thread.say(CA_REQUEST);
      await thread.say(SAID);
      const id = await thread.create();
      const values = t.values(id);
      expect(values.policy_violated ?? "", "Policy Violated cites Attendance").not.toMatch(/attendance/i);
      expect(values.policy_language ?? "", "Policy Language quotes Attendance").not.toMatch(/attendance/i);
      expect(values.observation ?? "", "the account is kept").toMatch(/late/i);
      for (const [key, value] of Object.entries(values)) expect(value, `${key} holds the take-off`).not.toMatch(/off the form/i);
    },
  },
  {
    id: "nov8-policy-set-aside-coaching-create",
    title: "…Coaching Create: the Details carry no \"Policy reference: Attendance …\" line",
    report: REPORT,
    // Holds here with production's flags (checked 8 Nov 2026): this app's take-off turn is answered as a policy question
    // and its Coaching draft carries no "Policy reference" line for it. A guard for the port.
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(COACHING_REQUEST);
      await thread.say(SAID);
      const id = await thread.create();
      const details = t.values(id).coaching_details ?? "";
      expect(details, "the Details cite Attendance").not.toMatch(/Policy reference:[^\n]*attendance/i);
      expect(details, "the Details hold the take-off").not.toMatch(/off the form/i);
    },
  },
  {
    id: "nov8-policy-set-aside-unnamed",
    title: "the flip-7 tester's \"take the policy off\": whatever policy the card cites comes off",
    report: `${REPORT} (the sibling app's flip-7 tester: "take the policy off" not honoured)`,
    status: { open: "the take-off is answered as a policy question, never on the card" },
    // Changed on purpose (coding 2, 8 Nov 2026): "take the policy off" read as a question (QUESTION_NOT_FORM) and was
    // answered before the card. TAKE_OFF_STAYS_CARD_ENABLED keeps it a card turn; with both flags on it holds; fixStatus removed.
    fixFlags: [...FIX, "TAKE_OFF_STAYS_CARD_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(CA_REQUEST);
      const reply = await thread.say("take the policy off");
      expect(policyLines(reply).filter((line) => /attendance/i.test(line)), `the policy is still on the card:\n${reply.content}`).toEqual([]);
      expect(reply.content).toMatch(/took the policy off/i);
    },
  },
  {
    id: "nov8-policy-set-aside-named-again",
    title: "negative: naming the policy again after taking it off puts it back",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(CA_REQUEST);
      await thread.say(SAID);
      const reply = await thread.say("actually it is the attendance policy");
      expect(policyLines(reply).some((line) => /attendance/i.test(line)), `the policy named again is not cited:\n${reply.content}`).toBe(true);
      expect(reply.content).not.toMatch(/took the (?:Attendance )?policy off/i);
    },
  },
  /*
   * QA, 8 Nov 2026 (pre-existing; the sibling app's live chat 1cc79ee9 on 6 Nov, and again that night; this app too):
   * the manager's follow-up about which policy to quote is no account. The policy readers settle it (Standards of
   * Conduct); the card's account stays what happened. Here the card's Issue was REPLACED by the remark.
   */
  {
    id: "nov8-policy-remark-not-account",
    title: "\"In the past we have quoted the standards of conduct for creating a ca due to underperformance\": the policy is the Standards of Conduct, and the card's account stays the under performance",
    report: "QA, 8 Nov 2026 (pre-existing, live): a remark about which policy to use was put on the card as the account",
    status: { open: "the card's Issue becomes \"In the past we have quoted the standards of conduct …\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say("put together a corrective action for marnie holloway due to under performance in store metrics for the month of october");
      const reply = await thread.say(REMARK);
      expect(thread.proposal?.templateKey).toBe("dpoa");
      expect(reply.content, "the policy is not the Standards of Conduct").toMatch(/\*\*Policy:\*\*\s*Standards of Conduct/i);
      const account = observationLine(reply);
      expect(account, `the remark is on the card as the account:\n${reply.content}`).not.toMatch(/in the past|quoted/i);
      expect(account, "the account lost what happened").toMatch(/under performance/i);
    },
  },
];
