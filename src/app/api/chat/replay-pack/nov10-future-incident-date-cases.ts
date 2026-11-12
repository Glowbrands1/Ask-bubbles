import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * AN INCIDENT DATE AFTER TODAY IS ASKED ABOUT (October rebuild 7, B#217 / #207 BH5, ported from the sibling's #285, 10 Nov 2026)
 * ============================================================================
 *
 * QA, 26 Oct 2026 (U4; the sibling's #285 and this app's #207 BH5 and #217, never merged): a written CA "for not attending the
 * monthly meeting on 12-20-26", written on 10/25, was accepted. QA's October triage (docs/parity-log/oct-pr-triage.md,
 * 10 Nov 2026), with production's flags: a card dated 12/20/2026 and no question, in full and terse typo wording. The
 * manager's words; the employee is the pack's Rowan Kestrel.
 */
const FLAG = "FUTURE_INCIDENT_DATE_ASK_ENABLED";
const REPORT = "QA, 26 Oct 2026 (U4; #217 / #207 BH5; the October triage, 10 Nov 2026)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

const cardDate = (thread: { proposal: unknown }) => (thread.proposal as { formDate?: string | null } | null)?.formDate ?? null;

const WORDINGS = [
  { key: "full", text: "write up rowan kestrel, written warning, for not attending the monthly meeting on 12-20-26" },
  { key: "terse-typo", text: "writen ca rowan kestrel not atending monthly meeting 12-20-26" },
] as const;

export const NOV10_FUTURE_INCIDENT_DATE_CASES: ReplayCase[] = WORDINGS.flatMap((wording) =>
  ([
    ["lower", wording.text],
    ["sentence", wording.text[0]!.toUpperCase() + wording.text.slice(1)],
  ] as const).map(([casing, text]) => ({
    id: `nov10-future-incident-date-${wording.key}-${casing}`,
    title: `"${text}" (written 10/25/2026) — the card is never dated 12/20/2026, and the date is asked about`,
    report: `${REPORT}; ${wording.key}, ${casing}`,
    /*
     * The terse typo wording is not read as a form request in this app at all: "writen ca …" gets a policy answer and
     * no card (10 Nov 2026, with and without the flag). That is its own defect, reported to QA, and stays open here.
     */
    ...(wording.key === "terse-typo"
      ? { status: { open: "\"writen ca …\" is not read as a form request: a policy answer, no card" } }
      : { status: { open: "the card is dated 12/20/2026, after today, and nothing is asked" }, fixFlags: [FLAG] }),
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = await thread.say(text);
      expect(cardDate(thread), `the card is dated by a day after today:\n${reply.content}`).not.toBe("2026-12-20");
      expect(reply.content, `the future date is not asked about:\n${reply.content}`).toMatch(/12\/20\/2026[^\n]*after today|after today[^\n]*12\/20\/2026/i);
      // The manager's answer dates the card, and the question is not asked again.
      const answer = await thread.say("it was 10-20-26");
      expect(cardDate(thread), `the answer does not date the card:\n${answer.content}`).toBe("2026-10-20");
      expect(answer.content, `the date is asked about again:\n${answer.content}`).not.toMatch(/after today/i);
      // Gate-Bubbles-5 (G5-743): the answer only dates the card; the Issue stays the account.
      const issue = (thread.proposal as { issue?: string | null } | null)?.issue ?? "";
      expect(issue, `the answer replaced the Issue:\n${answer.content}`).toMatch(/monthly meeting/i);
      expect(issue, `the answer is the Issue:\n${answer.content}`).not.toMatch(/^\s*it was 10-20-26/i);
    },
  })),
);
