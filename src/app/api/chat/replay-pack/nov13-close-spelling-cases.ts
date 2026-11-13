import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * CLOSE_SPELLING_MATCH — A POLICY OR A STORE NAMED A LETTER OFF (Pau, via QA, 13 Nov 2026)
 * ============================================================================
 *
 * QA's direction from Pau, 13 Nov 2026: "Match the manager's words against our own lists instead of exact spellings,
 * for names, stores/salons and policy titles. Allow close spellings ("Care and Clening" → "Care and Cleaning"). Put
 * the list's correct spelling on the form. Ask "Did you mean …?" when there is more than one possible match, or when
 * the match isn't confident." The wording below is invented (QA: invented people, no production rows).
 *
 * On production flags a policy named a letter off cites nothing ("Woven does not see a section … for "care and
 * clening""), so the policy cases are open; with CLOSE_SPELLING_MATCH_ENABLED they hold.
 */
const FLAG = "CLOSE_SPELLING_MATCH_ENABLED";
const REPORT = "Pau via QA, 13 Nov 2026 (CLOSE_SPELLING_MATCH; invented wording)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
  return t.thread();
}

/** A confident close spelling: the card cites the manual's own heading, with its spelling. */
const CONFIDENT: readonly { key: string; turn: string; heading: string }[] = [
  {
    key: "anmals-in-the-workplace",
    turn: "create a verbal ca for rowan kestrel for violating the anmals in the workplace policy, he brought his puppy to work today",
    heading: "Animals in the Workplace",
  },
  {
    key: "vistors-at-work",
    turn: "create a verbal ca for remy calder for violating the vistors at work policy, her boyfriend stayed behind the counter for an hour today",
    heading: "Visitors in the Workplace",
  },
];

export const NOV13_CLOSE_SPELLING_POLICY_CASES: ReplayCase[] = CONFIDENT.map((wording) => ({
  id: `nov13-close-spelling-policy-${wording.key}`,
  title: `"${wording.turn}" — the card cites ${wording.heading}, spelled as the manual spells it`,
  report: `${REPORT}; ${wording.key}`,
  status: { open: "a policy named a letter off cites no section of the manual" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const thread = start(t);
    const reply = (await thread.say(wording.turn)).content;
    expect(reply, `the card does not cite ${wording.heading}:\n${reply}`).toContain(`**Policy:** ${wording.heading}, as you said`);
    expect(reply, `the card still says no section was found:\n${reply}`).not.toMatch(/see a section of the current policy manual for/);
  },
}));

/*
 * QA's own example. A station left a mess is a cleaning duty, which the card records under Other (sf-s15, an earlier
 * ruling, unchanged); the policy the manager named is the one the plan reviews. On production flags "care and clening"
 * names no section, so the plan says "the applicable company policy"; with the flag the plan names the manual's
 * section, spelled as the manual spells it.
 */
export const NOV13_CLOSE_SPELLING_QA_EXAMPLE_CASES: ReplayCase[] = [
  {
    id: "nov13-close-spelling-policy-care-and-clening",
    title: `"… violating the care and clening policy …" — the card names Care and Cleaning of Equipment and Facilities`,
    report: `${REPORT}; QA's example "Care and Clening"`,
    status: { open: `"care and clening" names no section: the plan reviews "the applicable company policy"` },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (
        await thread.say("create a verbal ca for marnie holloway for violating the care and clening policy, she left her station a mess at close today")
      ).content;
      expect(reply, `the manual's spelling is not on the card:\n${reply}`).toContain("Care and Cleaning of Equipment and Facilities");
      expect(reply, `the card says no section was found:\n${reply}`).not.toMatch(/see a section of the current policy manual for/);
    },
  },
];

/** Not confident (two words off): nothing is cited, and the manager is asked. */
export const NOV13_CLOSE_SPELLING_POLICY_ASK_CASES: ReplayCase[] = [
  {
    id: "nov13-close-spelling-policy-not-confident-asks",
    title: `"… violating the anmals in the wrkplace policy …" — not cited; "Did you mean **Animals in the Workplace**?"`,
    report: `${REPORT}; two words off`,
    status: { open: `no question: the card says no section was found for "anmals in the wrkplace"` },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (
        await thread.say("create a verbal ca for rowan kestrel for violating the anmals in the wrkplace policy, he brought his puppy to work today")
      ).content;
      expect(reply, `no "Did you mean":\n${reply}`).toMatch(/Did you mean \*\*Animals in the Workplace\*\* \(page \d+\)\?/);
      expect(reply, `cited without asking:\n${reply}`).not.toMatch(/\*\*Policy:\*\* Animals in the Workplace, as you said/);
    },
  },
  {
    // Guard: a policy spelled as the manual spells it is cited as before, with or without the flag.
    id: "nov13-close-spelling-policy-exact-unchanged",
    title: `"… violating the visitors at work policy …" — cited as before`,
    report: `${REPORT}; guard`,
    status: "fixed",
    async run(t: ReplayContext) {
      const thread = start(t);
      const reply = (
        await thread.say("create a verbal ca for remy calder for violating the visitors at work policy, her boyfriend stayed behind the counter for an hour today")
      ).content;
      expect(reply, `not cited:\n${reply}`).toContain("**Policy:** Visitors in the Workplace, as you said");
      expect(reply, `asked when spelled right:\n${reply}`).not.toMatch(/Did you mean/);
    },
  },
];

/*
 * GUARD: a store typed a letter off is already read on production flags, by the store resolver's typo reading
 * (`lib/stores/resolver.ts`: a typo of one of the manager's own stores is used; any other is flagged `confirm` and
 * asked). CLOSE_SPELLING_MATCH adds no second store reading; these hold on production flags and with the flag.
 * A manager who covers Bellevue, NE (their primary) and Kearney, NE types "kearny ne".
 */
const KEARNEY = "loc-66";
const BELLEVUE_AND_KEARNEY = { level: "location", primaryAreaId: "loc-67", alsoCoversAreaIds: ["loc-66"] };

export const NOV13_CLOSE_SPELLING_STORE_CASES: ReplayCase[] = (
  [
    { key: "at-kearny-ne", turns: ["create a ca for kira dunmore at kearny ne, she was late today"] },
    { key: "bare-kearny-comma-ne", turns: ["create a ca for kira dunmore, she was late today", "kearny, ne"] },
  ] as const
).map((wording) => ({
  id: `nov13-close-spelling-store-${wording.key}`,
  title: `${wording.turns.map((turn) => `"${turn}"`).join(" → ")} — the card's store is Kearney, NE`,
  report: `${REPORT}; a store a letter off (${wording.key})`,
  status: "fixed",
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    t.directory([...STAFF]);
    t.as("location_manager", BELLEVUE_AND_KEARNEY);
    const thread = t.thread();
    let reply = "";
    for (const turn of wording.turns) reply = (await thread.say(turn)).content;
    expect((thread.proposal as { locationId?: string | null } | null)?.locationId ?? null, `the card's store:\n${reply}`).toBe(KEARNEY);
  },
}));
