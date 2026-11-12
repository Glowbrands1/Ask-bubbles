import { expect } from "vitest";

import { nameLineCommaEnabled, stepBAddUnderObservedEnabled } from "@/lib/config/chat-quality-flags";

import { WEST_DODGE, noClaimWithoutUpdate, replyMatchesDiff, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { CA_CHAIN, GATE_EDIT_WORDINGS, GATE_QUESTION_WORDINGS, LIVE_ROSTER, OBSERVATION_AFTER } from "./nov4-live-regressions-scenarios";

/**
 * ============================================================================
 * STEP 3 — THE EDIT TOOL IN THE MAIN CALL (FORM_EDIT_TOOL_IN_STREAM_ENABLED)
 * ============================================================================
 *
 * QA's CA chat (4 Nov 2026, the tester's exact turns, people invented), with
 * the answering model offered `edit_form` and scripted to call it. Production
 * has the flag off, so each case turns it (and the single writer it needs) on
 * for its own run, as the Step 2a case beside it does
 * (`nov4-live-regressions-cases.ts`). `fixFlags: []`.
 *
 *   T2 "fix her last name, it is Quill-Hart": the live write — the
 *      Observation replaced by "Quill-Hart was late …", dropping "Marnie" —
 *      now made as a tool call. Refused by the one writer, nothing written,
 *      and the turn handed to the old chain (the scripted revision keeps
 *      "Marnie Quill-Hart"). The tool's text is never shown.
 *   T6 "Add that she Must Practice …": the tool's "append" is written, the
 *      reply is the saved diff, and no revision runs: one model call.
 */

type T = ReplayContext;

const TOOL_FLAGS = ["FORM_EDIT_SINGLE_WRITER_ENABLED", "FORM_EDIT_TOOL_IN_STREAM_ENABLED"] as const;

async function withEditTool(run: () => Promise<void>): Promise<void> {
  const saved = TOOL_FLAGS.map((name) => [name, process.env[name]] as const);
  for (const name of TOOL_FLAGS) process.env[name] = "true";
  try {
    await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** T1 and Create: Marnie Quill's draft, with the drafting model's baseline Observation. */
async function marnieDraft(t: T) {
  t.directory(LIVE_ROSTER);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(CA_CHAIN[0]);
  expect(thread.proposal, "T1 made no card for Marnie Quill").toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Quill" });
  t.draftWrites({ observation: OBSERVATION_AFTER[0]! });
  const id = await thread.create();
  return { thread, id };
}

const REPORT = "QA's Step B flip test, 3–4 Nov 2026, the tester's exact turns; Step 3 makes the live write a tool call in the main call";

export const NOV4_EDIT_TOOL_CASES: readonly ReplayCase[] = [
  {
    id: "nov4-edit-tool-ca-t2-drops-marnie",
    title: `CA chat T2 "${CA_CHAIN[1]}" with the edit tool ON — the tool's set dropping "Marnie" is refused, nothing is written by it, and the old chain answers`,
    report: `${REPORT}: live, "Quill-Hart was late …" replaced the Observation and dropped "Marnie"`,
    status: "fixed",
    fixFlags: [],
    async run(t) {
      await withEditTool(async () => {
        const { thread, id } = await marnieDraft(t);
        const before = savedForm(t, id);
        const calls = t.calls();
        t.modelSays("I've fixed her last name on the form.");
        t.modelCallsEditTool!({ ops: [{ op: "set", field: "observation", value: "Quill-Hart was late to open on 10-20-26." }] });
        t.revisionWrites({ observation: OBSERVATION_AFTER[1]! });
        const reply = await thread.say(CA_CHAIN[1]);
        replyMatchesDiff(t, id, before, reply, CA_CHAIN[1]);
        noClaimWithoutUpdate(reply);
        const observation = t.values(id).observation ?? "";
        expect(observation, "the tool's replace reached the form").not.toMatch(/^Quill-Hart was late/);
        expect(observation, "Marnie was dropped").toMatch(/\bMarnie Quill-Hart\b/);
        expect(reply.content, "the tool's text was shown").not.toContain("I've fixed her last name");
        // Changed on purpose (QA, 11 Nov 2026): with NAME_LINE_COMMA_ENABLED the turn is the app's own name correction
        // (header and drafted account together), so no model call is made and edit_form is never offered.
        if (nameLineCommaEnabled()) {
          expect(t.editToolOffers!().offered, "edit_form was offered for a name correction").toBe(0);
          expect(t.calls().chat - calls.chat).toBe(0);
          return;
        }
        expect(t.editToolOffers!().offered, "the main call was not offered edit_form").toBe(1);
        expect(t.editToolOffers!().lastData ?? "", "the open form was not in the DATA block").toContain('"key":"observation"');
        // Handed off: the revision ran after the one main call.
        expect(t.calls().chat - calls.chat).toBe(1);
        expect(t.calls().revision - calls.revision).toBe(1);
      });
    },
  },
  {
    id: "nov4-edit-tool-ca-t6-append",
    title: `CA chat "${CA_CHAIN[5]}" with the edit tool ON — the append is written, the reply is the saved diff, one model call`,
    report: `${REPORT}: T6, the "add" as a tool call`,
    status: "fixed",
    fixFlags: [],
    async run(t) {
      await withEditTool(async () => {
        const { thread, id } = await marnieDraft(t);
        const before = savedForm(t, id);
        const calls = t.calls();
        t.modelSays("Done — I added that to the form.");
        t.modelCallsEditTool!({ ops: [{ op: "append", field: "observation", value: "she Must Practice the sanitizing checklist every shift." }] });
        const reply = await thread.say(CA_CHAIN[5]);
        replyMatchesDiff(t, id, before, reply, CA_CHAIN[5]);
        expect(reply.formUpdate?.updated).toEqual(["observation"]);
        // Changed on purpose (12 Nov 2026, QA's ruling (b) extended; Gate-Bubbles-2 on #814): with STEP_B_ADD_UNDER_OBSERVED
        // the instruction goes under "Expectation:" as its own line, its first letter a capital as the field's other lines
        // have; flag off, it is appended as typed.
        expect(t.values(id).observation ?? "").toMatch(
          stepBAddUnderObservedEnabled()
            ? /\nExpectation:\n[^]*\nShe Must Practice the sanitizing checklist every shift\.$/
            : /she Must Practice the sanitizing checklist every shift\.$/,
        );
        expect(t.values(id).observation ?? "", "the first name was dropped").toMatch(/\bMarnie Quill\b/);
        // Changed on purpose (12 Nov 2026, Gate-Sunny-2's finding on the sibling app): with STEP_B_REPLY_KEEPS_LINES on, a field
        // written on several lines is quoted line by line ("Changed Observation of Offense to:\n> …").
        expect(reply.content).toMatch(/^Changed Observation of Offense to(?: "|:\n> )/);
        expect(reply.content, "the tool's text was shown").not.toContain("I added that");
        // One model call: the main one; no revision, no draft.
        expect(t.calls().chat - calls.chat).toBe(1);
        expect(t.calls().revision - calls.revision).toBe(0);
        expect(t.calls().draft - calls.draft).toBe(0);
      });
    },
  },
];

/*
 * THE QUESTION GATE (QA and Pau, 4 Nov 2026): with Marnie's draft open, a real
 * edit asked as a question reaches edit_form. Since Pau's ruling A3 (4 Nov
 * 2026) a question reaches it too — no reading of the words decides the offer
 * — and the no-op guard (FORM_EDIT_NOOP_GUARD_ENABLED) is what keeps a pure
 * question from writing: answered in text, the text is the reply; a tool call
 * that changes nothing writes nothing and says so. The model does not call the
 * tool on the edits here, so an edit is handed to the old chain, whose
 * revision writes nothing.
 */
const GUARD_LINE = "I didn't change anything on the form. Tell me which part to change and what it should say.";

export const NOV4_EDIT_TOOL_GATE_CASES: readonly ReplayCase[] = [
  ...GATE_EDIT_WORDINGS.map((said, index): ReplayCase => ({
    id: `nov4-edit-tool-gate-edit-${index + 1}`,
    title: `with Marnie's Corrective Action open, "${said}" is an edit request: the main call is offered edit_form`,
    report: "QA and Pau, 4 Nov 2026: the non-question gate must not skip real edits phrased as questions",
    status: "fixed",
    fixFlags: [],
    async run(t) {
      await withEditTool(async () => {
        const { thread, id } = await marnieDraft(t);
        const before = savedForm(t, id);
        t.revisionWrites({});
        const reply = await thread.say(said);
        replyMatchesDiff(t, id, before, reply, said);
        noClaimWithoutUpdate(reply);
        expect(t.editToolOffers!().offered, `"${said}" was not offered edit_form`).toBe(1);
      });
    },
  })),
  ...GATE_QUESTION_WORDINGS.map((said, index): ReplayCase => ({
    id: `nov4-edit-tool-gate-question-${index + 1}`,
    // Changed on purpose (Pau's ruling A3, 4 Nov 2026): the question is now offered edit_form; it still writes nothing.
    title: `with Marnie's Corrective Action open, "${said}" is a question: offered edit_form (Pau's ruling A3), nothing written; a text answer is the reply, a no-op tool call gets the guard line`,
    report: "QA and Pau, 4 Nov 2026: negative control for the edit tool's offer; Pau's ruling A3 (4 Nov 2026): offered on questions too, the no-op guard keeps them from writing",
    status: "fixed",
    fixFlags: [],
    async run(t) {
      await withEditTool(async () => {
        const { thread, id } = await marnieDraft(t);
        const before = savedForm(t, id);
        t.modelSays("That is in the attendance section of the policy manual.");
        const reply = await thread.say(said);
        expect(t.editToolOffers!().offered, `"${said}" was not offered edit_form (Pau's ruling A3)`).toBe(1);
        expect(savedForm(t, id), `"${said}" wrote to the form`).toBe(before);
        expect(reply.formUpdate).toBeUndefined();
        expect(reply.content, "a question answered in text is not its answer").toBe("That is in the attendance section of the policy manual.");
        // The model calls the tool with a no-op: with the no-op guard on, nothing is written and the reply is the guard line.
        process.env.FORM_EDIT_NOOP_GUARD_ENABLED = "true";
        try {
          t.modelSays("That is in the attendance section of the policy manual.");
          t.modelCallsEditTool!({ ops: [{ op: "set", field: "observation", value: t.values(id).observation! }] });
          t.revisionWrites({});
          const noop = await thread.say(said);
          expect(savedForm(t, id), `"${said}": a no-op tool call wrote to the form`).toBe(before);
          expect(noop.formUpdate).toBeUndefined();
          expect(noop.content).toBe(GUARD_LINE);
        } finally {
          delete process.env.FORM_EDIT_NOOP_GUARD_ENABLED;
        }
      });
    },
  })),
];
