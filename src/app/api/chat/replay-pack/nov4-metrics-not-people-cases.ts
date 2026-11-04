import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, noRepeatedReply, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * PAU, 4 NOV 2026 / OVERNIGHT SCAN sf-s19: METRICS READ AS PEOPLE
 * (FORM_NAME_FROM_ROSTER_ENABLED, step 5's first piece, default off)
 * ============================================================================
 *
 * "I need a corrective action verbal for <name>. This is for Under Performance
 * on PPTA, LPSVA, Club Average, Club Close %, and Spa %."
 *
 * The card was made, but it cited no policy and the reply said "I couldn't
 * find **Club Close** or **Under** in the Woven roster". The name reader takes
 * "Club Close" and "Under" (from "for Under Performance") as names; the
 * grounding step stripped each from the question as an unknown person, so the
 * policy reader never saw "Under Performance". With the flag on, a candidate
 * that is not shaped like anyone on the scoped roster (no roster first name
 * for a 2+ word candidate, no roster first or last name for one word) is left
 * in the question and not announced, and the name reader drops it, so it is
 * never the card's employee. See `forms/roster-shape.ts`. The flag needs
 * CA_SALES_POLICY_ENABLED (alone, "Under Performance" kept in the question is
 * read as metric-only and the card is refused).
 *
 * The overnight scan's sf-s19 (`nov4-overnight-scan-cases.ts`) is the same
 * message; it stays OPEN without this flag in its fixFlags: turn 1 holds with
 * it, turn 2 ("Corrective Action") repeats turn 1 word for word.
 *
 * Only beside somebody on the roster (the middle ground, QA 4 Nov 2026): a
 * message that names nobody on the roster is read as before.
 *
 * Negative controls: a typo of a roster person still gets the close-match
 * note; a full name nobody on the roster shares, typed alone, is still
 * announced, flag on or off. Metric words with no roster name beside them are
 * read as before (the metrics-only case says what that means).
 *
 * Every person is invented (the repository is public) and is on this file's
 * own directory fixture only.
 */

type T = ReplayContext;

const STORE = "loc-264";

const person = (id: string, firstName: string, lastName: string): DirectoryRow => ({
  id,
  firstName,
  lastName,
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
});

const PERPETUA = person("e-perpetua-thornquist", "Perpetua", "Thornquist");
const LEOCADIA = person("e-leocadia-wexcombe", "Leocadia", "Wexcombe");

const ROSTER: readonly DirectoryRow[] = [...STAFF, PERPETUA, LEOCADIA];

const REPORT = "Pau, 4 Nov 2026 (sf-s19, metrics read as people): a CA for Under Performance on named metrics";
const FLAG = "FORM_NAME_FROM_ROSTER_ENABLED";
const SALES = "CA_SALES_POLICY_ENABLED";
const GLOSSARY = "CHAT_GLOSSARY_ENABLED";

/** Pau's message, word for word, with an invented employee. */
const say = (name: string) =>
  `I need a corrective action verbal for ${name}. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %.`;

function start(t: T) {
  vi.setSystemTime(new Date("2026-11-04T15:30:00Z"));
  t.directory(ROSTER);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function policyLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Policy:?\*\*/i.test(line)) ?? "";
}

export const NOV4_METRICS_NOT_PEOPLE_CASES: ReplayCase[] = [
  {
    id: "nov4-pau-metrics-not-people",
    title: "sf-s19: Pau's Under Performance CA on PPTA, LPSVA, Club Average, Club Close %, Spa %: no roster note, the card cites Standards of Conduct",
    report: `${REPORT}: "I need a corrective action verbal for <name>. This is for Under Performance on PPTA, LPSVA, Club Average, Club Close %, and Spa %."`,
    status: { open: 'the reply says "I couldn\'t find Club Close or Under in the Woven roster" and the card cites no policy' },
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Perpetua Thornquist"));
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/couldn't find/i);
      expect(reply.content, `"Club Close" or "Under" is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:Club Close|Under)\*\*/);
      expect(thread.proposal, `no CA card for Perpetua Thornquist:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Perpetua Thornquist" });
      expect(policyLine(reply), `the card does not cite Standards of Conduct:\n${reply.content}`).toMatch(/standards of conduct/i);
      t.draftWrites(
        { observation: "Observed:\nPerpetua Thornquist was below goal on PPTA, LPSVA, Club Average, Club Close % and Spa % this period." },
        { offense_type: ["under_performance"] },
      );
      const id = await thread.create();
      const values = t.values(id);
      expect(values.policy_violated ?? "", "Policy Violated is not Standards of Conduct").toMatch(/standards of conduct/i);
      expect(values.policy_language ?? "", "Direct policy does not name the Standards of Conduct").toMatch(/standards of conduct/i);
      expect(values.employee_name ?? "", "the form's employee is not Perpetua Thornquist").toMatch(/Perpetua Thornquist/);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-typo",
    title: "negative control: a typo of a roster person on the same message still gets the close-match note",
    report: `${REPORT}: negative control, a typo of a roster name`,
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Leocadia Wexcomb"));
      const said = `${reply.content}\n${JSON.stringify(thread.proposal)}`;
      expect(said, `no close-match note for Leocadia Wexcombe:\n${said}`).toMatch(/Leocadia Wexcombe/);
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/\*\*(?:Club Close|Under)\*\*/);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-unknown",
    title: "negative control: a full name nobody on the roster shares, typed alone, is announced as not on the roster, flag on or off",
    report: `${REPORT}: negative control, a person not on the roster`,
    status: "fixed",
    /*
     * The middle ground (QA, 4 Nov 2026): a nobody-shaped candidate is set
     * aside only when the same message names somebody on the roster. Nobody
     * here is on it, so the message is read as before.
     */
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Zuleika Brightwell"));
      expect(reply.content, `the unknown person is not announced:\n${reply.content}`).toMatch(/couldn't find \*\*Zuleika Brightwell\*\*/);
      expect(thread.proposal?.employeeName ?? null, "an unknown person is on the card").not.toBe("Zuleika Brightwell");
      // Said again, the chat moves on: not the same reply word for word (no loop).
      const again = await thread.say("Zuleika Brightwell");
      noRepeatedReply([reply, again]);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-metrics-only",
    title: "metrics with no roster name (\"CA for under performance on Club Close % and Spa %\"): no metric is said back as a person; no card either, flag on or off",
    report: `${REPORT}: metric words with no roster name beside them`,
    /*
     * QA, 4 Nov 2026: report it, don't hide it. Nothing in the message names
     * somebody on the roster, so the middle ground reads it as before. Through
     * the route, with production's flags and with these on alike, the turn
     * gets the answering model's reply and no card, so no name is said back.
     * The grounding step itself, were a card proposed, would still say back
     * "under" (from "for under performance") as not on the roster: pinned in
     * `forms/form-name-from-roster.test.ts`. Put to Pau.
     */
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for under performance on Club Close % and Spa %");
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/couldn't find/i);
      expect(thread.proposal?.employeeName ?? "", "a metric is on the card").not.toMatch(/under|club close/i);
    },
  },
];
