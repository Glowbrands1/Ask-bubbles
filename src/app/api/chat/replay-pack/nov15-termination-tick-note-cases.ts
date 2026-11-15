import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A TERMINATION THE APP DOES NOT TICK IS THE MANAGER'S TO TICK (TERMINATION_TICK_NOTE_ENABLED)
 * ============================================================================
 *
 * QA, 15 Nov 2026: when the manager's words mention termination and the stated-termination reader does not tick it,
 * the card asked only "Verbal Warning or Written Warning?", or said nothing about the level, never Termination. With the flag the
 * line says the manager ticks Termination and that it needs DM/HR approval. A termination the reader ticks is
 * unchanged. Names are the pack's invented staff.
 */

const REPORT = "QA, 15 Nov 2026: a termination mentioned in chat and not ticked left only the verbal/written line";
const FLAG = "TERMINATION_TICK_NOTE_ENABLED";
const NOTE = "If this form is a termination, tick Termination on the form yourself; it needs DM/HR approval before it's finalized.";
/** This app's level prompt (QA's re-review: never dropped). */
const LEVEL_LINE = /Is this new corrective action a \*\*Verbal Warning\*\* or a \*\*Written Warning\*\*\?/;

const UNTICKED = [
  "my DM approved her termination, write up the CA for Marnie Holloway, she no call no showed on 11/12",
  // "create a termination for <A>, …" is read as a policy question (no card), reported to QA separately.
  "Marnie Holloway is terminated, make the CA, she no call no showed on 11/12",
  "write a CA, termination, for Marnie Holloway, she no call no showed on 11/12",
];

export const NOV15_TERMINATION_TICK_NOTE_CASES: ReplayCase[] = [
  /*
   * QA's re-review (15 Nov 2026): conditional and future mentions still read as a mention, so the note is neutral and
   * the verbal/written level line is never removed.
   */
  ...[
    "if she does it again she will be terminated, write up Marnie Holloway for being late on 11/12",
    "write up Marnie Holloway for being late on 11/12, next time it's termination",
    "we might terminate her later, for now write up Marnie Holloway for being late on 11/12",
    "I'd hold off on termination, write up Marnie Holloway for being late on 11/12",
  ].map(
    (said, index): ReplayCase => ({
      id: `nov15-termination-tick-note-keeps-level-${index + 1}`,
      title: `"${said}": the level question is never dropped; any note is the neutral one, beside it`,
      report: "QA's re-review of #1010, 15 Nov 2026: a conditional or future mention dropped the level prompt",
      status: "fixed",
      fixFlags: [FLAG],
      async run(t) {
        vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        const thread = t.thread();
        const reply = await thread.say(said, { employeeName: "Marnie Holloway" });
        // Only the neutral wording, ever.
        expect(reply.content).not.toMatch(/^You'll tick Termination on the form yourself/m);
        if (!reply.content.includes(NOTE)) return;
        const lines = reply.content.split("\n").map((line) => line.trim()).filter(Boolean);
        const at = lines.indexOf(NOTE);
        // Beside the level prompt when the card has one (never in its place); after the opening line when it has none.
        if (lines.some((line) => LEVEL_LINE.test(line))) expect(LEVEL_LINE.test(lines[at - 1] ?? ""), reply.content).toBe(true);
        else expect(at, reply.content).toBe(1);
      },
    }),
  ),

  ...UNTICKED.map(
    (said, index): ReplayCase => ({
      id: `nov15-termination-tick-note-${index + 1}`,
      title: `"${said}": no level ticked, and the card says the manager ticks Termination (DM/HR approval)`,
      report: REPORT,
      status: { open: "the card asks only \"Verbal Warning or Written Warning?\", or nothing" },
      fixFlags: [FLAG],
      async run(t) {
        vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        const thread = t.thread();
        const reply = await thread.say(said, { employeeName: "Marnie Holloway" });
        expect((thread.proposal as { warningLevel?: string | null } | undefined)?.warningLevel ?? null, reply.content).toBeNull();
        expect(reply.content).toContain(NOTE);
        // Changed on purpose (QA's re-review of #1010): the level question is never removed; the note goes beside it.
      },
    }),
  ),
  {
    id: "nov15-termination-tick-note-stated-unchanged",
    title: "\"I need a term CA for Marnie Holloway. She didn't show up.\": the stated termination is ticked as before, with no second note",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("I need a term CA for Marnie Holloway. She didn't show up on 11/12.", { employeeName: "Marnie Holloway" });
      expect(reply.content).toContain("Termination, as you said");
      expect(reply.content).not.toContain(NOTE);
    },
  },
  {
    id: "nov15-termination-tick-note-no-termination",
    title: "\"create a CA for Marnie Holloway, she was late on 11/12\": no termination mentioned, the level question as before",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway, she was late on 11/12", { employeeName: "Marnie Holloway" });
      expect(reply.content).not.toContain(NOTE);
    },
  },
  ...[
    "I don't want to terminate her, just document the lateness for Marnie Holloway on 11/12",
    "she is not being terminated, write up Marnie Holloway for being late on 11/12",
  ].map(
    (said, index): ReplayCase => ({
      id: `nov15-termination-tick-note-negation-${index + 1}`,
      title: `"${said}": a negated termination gets no Termination note (QA's review of #1010)`,
      report: "QA's review of #1010, 15 Nov 2026: a negated termination got the Termination note",
      status: "fixed",
      fixFlags: [FLAG],
      async run(t) {
        vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
        t.directory(STAFF);
        t.as("location_manager", WEST_DODGE);
        const thread = t.thread();
        const reply = await thread.say(said, { employeeName: "Marnie Holloway" });
        expect(reply.content).not.toContain(NOTE);
      },
    }),
  ),
  {
    id: "nov15-termination-tick-note-other-person-earlier",
    title: "Remy Calder's termination earlier in the chat, then a CA for Marnie Holloway for lateness: no Termination note on Marnie's card",
    report: "QA's review of #1010, 15 Nov 2026: an earlier turn's termination carried over onto another person's card",
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("my DM approved Remy Calder's termination, write up the CA, he no call no showed on 11/12", { employeeName: "Remy Calder" });
      const reply = await thread.say("now create a CA for Marnie Holloway, she was late on 11/12", { employeeName: "Marnie Holloway" });
      expect(thread.proposal?.employeeName, reply.content).toBe("Marnie Holloway");
      expect(reply.content).not.toContain(NOTE);
    },
  },
];
