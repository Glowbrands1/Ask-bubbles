import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "FIX HER LAST NAME …" ON A CARD NOT YET CREATED (QA, round 5, 8 Nov 2026)
 * ============================================================================
 *
 * The 2 Nov 2026 chat (Bubbles chat_messages, conversation 5957c9db, read-only): the manager asked for a Corrective
 * Action for an employee whose surname they typed wrong, answered the card's questions, then on the card — before
 * Create — wrote "fix her last name <surname>". The reply was "**Nothing on the form has changed yet.**" and the card
 * kept the old name; later turns ("under the employee line the name is supposed to be …", "okay the correct way is
 * …") were answered as if the card had changed, with no card. The manager's words are kept; the people are invented
 * (Odessa Lark Penhallow: a two-word surname, typed with two letters swapped, as in the chat; not on
 * employee_access_directory in either app). PROPOSAL_NAME_CORRECTION_ENABLED: the card's employee becomes the
 * corrected roster person, and nothing else on the card changes.
 */
const FLAG = "PROPOSAL_NAME_CORRECTION_ENABLED";
const REPORT = "The 2 Nov 2026 chat (QA, round 5): \"fix her last name …\" on a card not yet created was not applied";

const ODESSA: DirectoryRow = {
  id: "e-odessa",
  firstName: "Odessa",
  lastName: "Lark Penhallow",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The manager's first two turns, word for word, with the invented name typed as they typed theirs. */
const OPENING = [
  "i have an employee, Odessa Lark Penhallwo that needs a corrective action form with a customer complaint",
  "verbal warning, no payroll deduct, part-time team member,",
];

type Card = NonNullable<ReplayAnswer["formProposal"]>;

async function cardAfter(t: ReplayContext, correction: string): Promise<{ before: Card; after: ReplayAnswer; thread: ReturnType<ReplayContext["thread"]> }> {
  vi.setSystemTime(new Date("2026-11-02T17:54:00Z"));
  t.directory([...STAFF, ODESSA]);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(OPENING[0]!);
  const before = (await thread.say(OPENING[1]!)).formProposal!;
  expect(before?.employeeName, "the opening card does not carry the typed name").toBe("Odessa Lark Penhallwo");
  return { before, after: await thread.say(correction), thread };
}

/**
 * Everything on the card but the employee is as it was. The employee's own fields follow her: the roster's check of
 * her (`employeeVerification`) and where her store was read from (`locationSource`, now her Woven assignment — the
 * store itself, `locationId` / `locationName`, is compared and must not change).
 */
function restUnchanged(before: Card, after: Card): void {
  const EMPLOYEE_FIELDS = new Set(["employeeName", "employeeVerification", "closeMatchNote", "locationSource", "proposalId", "sourceMessageIds"]);
  const rest = (card: Card) => Object.fromEntries(Object.entries(card as Record<string, unknown>).filter(([key]) => !EMPLOYEE_FIELDS.has(key)));
  expect(rest(after), "something else on the card changed").toEqual(rest(before));
}

const CORRECTIONS: Record<string, string> = {
  // The chat's own words.
  "fix-her-last-name": "fix her last name penhallow",
  "supposed-to-be": "under the employee line the name is supposed to be odessa lark penhallow",
  "correct-way": "okay the correct way is Odessa Lark Penhallow",
  // The 3 Nov live re-checks of the same report (nov4-live-regressions).
  "comma-it-is": "fix her last name, it is Penhallow",
  // QA's other phrasings (round 5).
  "last-name-is": "her last name is Penhallow",
  "spelled": "it's spelled Penhallow",
};

/*
 * An off-roster correction (QA, round 6, 8 Nov 2026). This expectation changed on purpose: round 5 kept this app's own
 * "Which of them … — **Odessa Lark Penhallwo** or **Odessa Lark Penhalloe**?" with no one on the card. QA's round-6
 * rule: the card stays, and a spelling on nobody's roster is never offered as a person. One roster person is that
 * close, so the card is for her, nothing else on it changes, and the reply says the typed spelling is not on the roster.
 */
function offRosterKept(before: Card, after: ReplayAnswer): void {
  expect(after.formProposal, `the card was dropped:\n${after.content}`).toBeTruthy();
  expect(after.formProposal?.employeeName, `the card is not for the roster's Odessa:\n${after.content}`).toBe("Odessa Lark Penhallow");
  restUnchanged(before, after.formProposal!);
  expect(after.content, `the typo is offered as a person:\n${after.content}`).not.toMatch(/Which of them|\*\*Odessa Lark Penhalloe\*\*|\*\*Odessa Lark Penhallwo\*\*/);
  expect(after.content, `the reply does not say the spelling is not on the roster:\n${after.content}`).toContain('"Odessa Lark Penhalloe" isn\'t a name on the roster');
}

const ALREADY_HOLDS = new Set(["correct-way"]);

export const NOV8_PROPOSAL_NAME_CORRECTION_CASES: ReplayCase[] = [
  ...Object.entries(CORRECTIONS).map(
    ([key, correction]): ReplayCase => ({
      id: `nov8-proposal-name-correction-${key}`,
      title: `on the card before Create, "${correction}": the card's employee is the roster's Odessa Lark Penhallow, and nothing else changes`,
      report: REPORT,
      // A whole name, capitalised, already re-proposes the card for her with production's flags: a guard there.
      status: ALREADY_HOLDS.has(key) ? "fixed" : { open: "with production's flags the card keeps \"Odessa Lark Penhallwo\"" },
      fixFlags: [FLAG],
      async run(t) {
        const { before, after } = await cardAfter(t, correction);
        expect(after.formProposal?.employeeName, `the card keeps the old name:\n${after.content}`).toBe("Odessa Lark Penhallow");
        restUnchanged(before, after.formProposal!);
        expect(after.content, "the reply says nothing changed").not.toMatch(/Nothing on the form has changed/i);
      },
    }),
  ),
  {
    id: "nov8-proposal-name-correction-off-roster",
    title: "an off-roster spelling (\"fix her last name penhalloe\") keeps the card, for the one roster person that close; the typo is never offered as a person",
    report: REPORT,
    status: { open: "with production's flags the correction is not read, so the reply never names her spelling" },
    fixFlags: [FLAG],
    async run(t) {
      const { before, after } = await cardAfter(t, "fix her last name penhalloe");
      offRosterKept(before, after);
    },
  },
  {
    id: "nov8-proposal-name-correction-typed-off-roster",
    title: "\"change her name to Odessa Lark Penhalloe\" (typed, off the roster) keeps the card, for the one roster person that close; never \"A or B\"",
    report: "QA, round 6 (8 Nov 2026): an off-roster or mistyped correction keeps the card; the typo is never offered as a person",
    // Round 5 marked this fixed (this app's own "A or B" ask); QA's round-6 rule replaces that answer.
    status: { open: "with production's flags the reply asks \"Which of them … — Odessa Lark Penhallwo or Odessa Lark Penhalloe?\" with no one on the card" },
    fixFlags: [FLAG],
    async run(t) {
      const { before, after } = await cardAfter(t, "change her name to Odessa Lark Penhalloe");
      offRosterKept(before, after);
    },
  },
  {
    id: "nov8-proposal-name-correction-different-person",
    title: "negative: \"okay the correct way is Juno Paxton\" (another person, no name shared) is no correction of Odessa's card",
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      const { after } = await cardAfter(t, "okay the correct way is Juno Paxton");
      expect(after.formProposal?.employeeName ?? null, `the card's employee was replaced:\n${after.content}`).not.toBe("Odessa Lark Penhallow");
    },
  },
  ...(
    [
      // The sibling's R6 t5 (two letters swapped) and t7 (a neighbouring key for the first letter), on this file's Odessa.
      ["t5", "under the employee line the name is supposed to be odessa lark penhalow", "Odessa Lark Penhalow"],
      ["t7", "make that change to Odessa Lark Oenhallow", "Odessa Lark Oenhallow"],
    ] as const
  ).map(
    ([turn, said, typo]): ReplayCase => ({
      id: `nov8-proposal-name-correction-r6-${turn}`,
      title: `R6 ${turn} (ported): "${said}" on the card for the roster's Odessa Lark Penhallow keeps the card for her; the typo is never offered or seated`,
      report: `QA, round 6 (8 Nov 2026): the sibling app's nov5-r6-policy-kept-across-turns ${turn} asked "Which of them … — <A> or <the typo>?"`,
      status: { open: "with production's flags the reply asks which, or the typo is put on the card" },
      fixFlags: [FLAG],
      async run(t) {
        const { after: fixed, thread } = await cardAfter(t, "fix her last name penhallow");
        expect(fixed.formProposal?.employeeName, "the premise: the card is for the roster's Odessa").toBe("Odessa Lark Penhallow");
        const after = await thread.say(said);
        expect(after.formProposal, `the card was dropped:\n${after.content}`).toBeTruthy();
        expect(after.formProposal?.employeeName, `the card is not for the roster's Odessa:\n${after.content}`).toBe("Odessa Lark Penhallow");
        expect(after.content, `the typo is offered as a person:\n${after.content}`).not.toMatch(new RegExp(`Which of them|\\*\\*${typo}\\*\\*`));
      },
    }),
  ),
];
