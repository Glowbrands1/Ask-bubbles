import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE SAVED WRITE-UP CALLS THE EMPLOYEE BY FIRST NAME; THE SECOND MENTION READS NATURALLY
 * (port from the sibling app: Pau via its QA, 17 and 20 Nov 2026, items 15 and 19; and this app's QA2, live, 21 Nov 2026)
 * ============================================================================
 *
 * On the real Create path (createInlineForm → POST /api/forms/instances → POST …/draft; the drafting model is a stand-in
 * that writes what the live one wrote). No she/her/he/him in the saved write-up, including the exit form's Reason line:
 * the first name. The person's second mention in a sentence reads naturally ("did not come into the scheduled shift"),
 * on the card's account, in the reply and in the saved text.
 *
 * QA2's live re-test of this app (21 Nov 2026) found three wordings, each written here first as the manager's account:
 *   "<P> was late on <P>'s last two shifts", "<P> wanted to show <P>'s team <P>'s new puppy" and "<P> was talking on
 *   <P>'s cell phone". Invented people only (`loop-roster.ts`); this app's forms (`dpoa`, `resignation-exit`).
 */

const REPORT = "Pau via the sibling app's QA (17 and 20 Nov 2026, items 15 and 19), ported, and QA2's live re-test here (21 Nov 2026): the saved write-up names the employee by first name, and a second mention reads naturally";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const PRONOUN = /\b(?:she|her|he|him|his)\b/i;

async function created(
  t: ReplayContext,
  said: string,
  person: { id: string; full: string },
  card: Record<string, unknown>,
  drafted: Record<string, string>,
  replyText = "Here's the card.",
) {
  t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
    ? { text: replyText }
    : { tool: "propose_form", input: { employee_id: person.id, person_evidence: evidenceFrom(view, person.full), ...card } }));
  t.draftWrites(drafted);
  const thread = t.thread();
  const reply = await thread.say(said);
  const id = await thread.create();
  const proposal = reply.formProposal as ChatFormProposal | undefined;
  return { values: t.values(id), issue: proposal?.issue ?? "", reply: String(reply.content ?? "") };
}

const FENNA = { id: LOOP_FENNA.id, full: "Fenna Prewitt" };
const THADDEA = { id: LOOP_THADDEA.id, full: "Thaddea Kroll" };

const fixed = (id: string, title: string, run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    start(t);
    await run(t);
  },
});

/** A CA card for <person> whose model reads the manager's pronouns back, and a drafter that writes them in Observed. */
async function caCard(t: ReplayContext, said: string, person: { id: string; full: string }, account: string, observed: string) {
  const first = person.full.split(" ")[0]!;
  return created(
    t,
    said,
    person,
    { template_key: "dpoa", what_happened: account, incident_date: "2026-11-21" },
    { observation: `Observed:\n${observed}\n\nExpectation:\n${first} is expected to follow the store's policies on every shift.` },
    // The live model reads the account back with the manager's pronoun (the reply pass names the person).
    `Here's the Corrective Action Form for **${first}**.\n\n**Observation of Offense:** ${account}`,
  );
}

export const NOV21_AGENT_LOOP_WRITE_UP_FIRST_NAME_CASES: ReplayCase[] = [
  fixed("nov21-write-up-second-mention-natural", `The sibling app's item 19, ported: "ca for Fenna Prewitt, she did not come into her scheduled shift today": the card's account reads "Fenna did not come into the scheduled shift", never "Fenna's" after Fenna, and no she/her`, async (t) => {
    const saved = await caCard(t, "ca for Fenna Prewitt, she did not come into her scheduled shift today", FENNA, "Fenna did not come into her scheduled shift today.", "Fenna did not come into her scheduled shift on November 21, 2026.");
    expect(saved.issue, `the card's account:\n${saved.issue}`).toBe("Fenna did not come into the scheduled shift today.");
    expect(saved.reply, `the reply:\n${saved.reply}`).toMatch(/Fenna did not come into the scheduled shift/);
    expect(saved.reply).not.toMatch(/Fenna's scheduled|\b(?:she|her)\b/i);
    expect(saved.values.observation ?? "").toMatch(/Fenna did not come into the scheduled shift/);
    expect(saved.values.observation ?? "").not.toMatch(PRONOUN);
  }),
  fixed("nov21-write-up-observation-first-name", `The sibling app's item 15, ported: "ca for Fenna Prewitt, she was 20 minutes late to her shift on 11/14", the drafter writes "her shift" and "she will call": the saved Observation names Fenna, never she/her`, async (t) => {
    const saved = await created(
      t,
      "ca for Fenna Prewitt, she was 20 minutes late to her shift on 11/14",
      FENNA,
      { template_key: "dpoa", what_happened: "Fenna was 20 minutes late to her shift on 11/14.", incident_date: "2026-11-14" },
      { observation: "Observed:\nFenna was 20 minutes late to her shift on November 14, 2026.\n\nExpectation:\nFenna is expected to arrive on time for every scheduled shift, and she will call ahead if she is running late." },
    );
    const observation = saved.values.observation ?? "";
    expect(observation, "no Observation was saved (the case proves nothing)").toMatch(/20 minutes late/);
    expect(observation, `the Observation keeps a pronoun for Fenna:\n${observation}`).not.toMatch(PRONOUN);
  }),
  fixed("nov21-write-up-exit-reason-natural", `The sibling app's c151 shape and item 19, ported: "Reason for resignation: she said her new job pays more": the saved Reason reads "Fenna said …", never she/her and never "Fenna said Fenna's new job"`, async (t) => {
    const saved = await created(
      t,
      "create exit form for Fenna Prewitt. Last day worked 11-5-26. Immediate Vol resignation. Reason for resignation: she said her new job pays more",
      FENNA,
      {
        template_key: "resignation-exit",
        exit_evidence: { message_id: "m1", quote: "create exit form for Fenna Prewitt", kind: "asks_for_exit_form" },
        exit_type: "resignation",
        incident_date: "2026-11-05",
        what_happened: "Last day worked 11-5-26. Immediate Vol resignation. Reason for resignation: she said her new job pays more.",
      },
      {},
    );
    const reason = saved.values.resignation_reason ?? "";
    expect(reason, "no Reason was saved (the case proves nothing)").not.toBe("");
    expect(reason, reason).toMatch(/^Fenna said\b/);
    expect(reason, `the Reason keeps a pronoun or a repeated possessive: ${reason}`).not.toMatch(/Fenna's|\b(?:she|her|he|him|his)\b/i);
  }),
  /* QA2's live re-test (21 Nov 2026), item 1: "<P> was late on <P>'s last two shifts". */
  fixed("nov21-write-up-qa2-late-on-last-two-shifts", `QA2, live: "ca for Fenna Prewitt, she was late on her last two shifts": the card, the reply and the saved Observed read "Fenna was late on the last two shifts", never "on Fenna's last two shifts" or "her last two"`, async (t) => {
    const saved = await caCard(t, "ca for Fenna Prewitt, she was late on her last two shifts", FENNA, "Fenna was late on her last two shifts.", "Fenna was late on her last two shifts.");
    expect(saved.issue, `the card's account:\n${saved.issue}`).toBe("Fenna was late on the last two shifts.");
    expect(saved.reply, `the reply:\n${saved.reply}`).toContain("**Observation of Offense:** Fenna was late on the last two shifts.");
    const observation = saved.values.observation ?? "";
    expect(observation, observation).toMatch(/Fenna was late on the last two shifts/);
    for (const text of [saved.issue, saved.reply, observation]) {
      expect(text, text).not.toMatch(/\bon Fenna's\b|\bher last two\b/i);
      expect(text, text).not.toMatch(PRONOUN);
    }
  }),
  /* QA2's live re-test (21 Nov 2026), item 2: "show <P>'s team <P>'s new puppy" (not after a preposition; the sibling app's object-possessive rule, ported, covers it). */
  fixed("nov21-write-up-qa2-show-team-new-puppy", `QA2, live: "ca for Thaddea Kroll, she left the register for 20 minutes because she wanted to show her team her new puppy": the card, the reply and the saved Observed never read "show Thaddea's team Thaddea's new puppy"`, async (t) => {
    const account = "Thaddea left the register for 20 minutes because she wanted to show her team her new puppy.";
    const saved = await caCard(t, "ca for Thaddea Kroll, she left the register for 20 minutes because she wanted to show her team her new puppy", THADDEA, account, account);
    expect(saved.issue, `the card's account:\n${saved.issue}`).toBe("Thaddea left the register for 20 minutes because Thaddea wanted to show the team the new puppy.");
    expect(saved.reply, `the reply:\n${saved.reply}`).toContain("wanted to show the team the new puppy.");
    const observation = saved.values.observation ?? "";
    expect(observation, observation).toMatch(/show the team the new puppy/);
    for (const text of [saved.issue, saved.reply, observation]) {
      expect(text, text).not.toMatch(/Thaddea's (?:team|new puppy)/);
      expect(text, text).not.toMatch(PRONOUN);
    }
  }),
  /* QA2's live re-test (21 Nov 2026), item 3: "talking on her cell phone" became "talking on <P>'s cell phone". */
  fixed("nov21-write-up-qa2-talking-on-cell-phone", `QA2, live: "ca for Fenna Prewitt, she was talking on her cell phone at the register": the card, the reply and the saved Observed read "Fenna was talking on the cell phone", never "on Fenna's cell phone"`, async (t) => {
    const account = "Fenna was talking on her cell phone at the register.";
    const saved = await caCard(t, "ca for Fenna Prewitt, she was talking on her cell phone at the register", FENNA, account, account);
    expect(saved.issue, `the card's account:\n${saved.issue}`).toBe("Fenna was talking on the cell phone at the register.");
    expect(saved.reply, `the reply:\n${saved.reply}`).toContain("**Observation of Offense:** Fenna was talking on the cell phone at the register.");
    const observation = saved.values.observation ?? "";
    expect(observation, observation).toMatch(/Fenna was talking on the cell phone/);
    for (const text of [saved.issue, saved.reply, observation]) {
      expect(text, text).not.toMatch(/Fenna's cell phone/);
      expect(text, text).not.toMatch(PRONOUN);
    }
  }),
];
