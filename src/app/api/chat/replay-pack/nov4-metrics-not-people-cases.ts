import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, noRepeatedReply, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * PAU, 4 NOV 2026 / OVERNIGHT SCAN sf-s19: METRICS READ AS PEOPLE
 * (FORM_NAME_FROM_ROSTER_ENABLED, step 5's first piece, default off)
 * ============================================================================
 *
 * "I need a corrective action verbal for <name>. This is for Under Performance
 * on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %."
 *
 * The card was made, but it cited no policy and the reply said "I couldn't
 * find **Bundle Rate** or **Under** in the Woven roster". The name reader takes
 * "Bundle Rate" and "Under" (from "for Under Performance") as names; the
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
 * read as before, except that one lowercase word that is nobody on the roster
 * ("under") is never the employee (the metrics-only case); a roster first name
 * typed in lowercase is still matched.
 *
 * Every person is invented (the repository is public). Corin Bellweather is
 * QA's pau-1 person, shared with `nov4-live-regressions-scenarios.ts`; the
 * others are on this file's own directory fixture only.
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
/** QA's pau-1 person (`nov4-live-regressions-scenarios.ts`), invented. */
const CORIN = person("e-corin-bellweather", "Corin", "Bellweather");

const ROSTER: readonly DirectoryRow[] = [...STAFF, PERPETUA, LEOCADIA, CORIN];

const REPORT = "Pau, 4 Nov 2026 (sf-s19, metrics read as people): a CA for Under Performance on named metrics";
const FLAG = "FORM_NAME_FROM_ROSTER_ENABLED";
const SALES = "CA_SALES_POLICY_ENABLED";
const GLOSSARY = "CHAT_GLOSSARY_ENABLED";

/** Pau's message, word for word, with an invented employee. */
const say = (name: string) =>
  `I need a corrective action verbal for ${name}. This is for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %.`;

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
    title: "sf-s19: Pau's Under Performance CA on UPT, ATV, Average Ticket, Bundle Rate %, Gift %: no roster note, the card cites Standards of Conduct",
    report: `${REPORT}: "I need a corrective action verbal for <name>. This is for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %."`,
    // Changed on purpose (5 Nov 2026): QA flipped CA_SALES_POLICY + REPLY_MATCHES_CARD + TITLE_OF_THE_EMPLOYEE + METRIC_GUARD on in production (production-flags.json), so this case now holds with production's flags.
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Perpetua Thornquist"));
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/couldn't find/i);
      expect(reply.content, `"Bundle Rate" or "Under" is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:Bundle Rate|Under)\*\*/);
      expect(thread.proposal, `no CA card for Perpetua Thornquist:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Perpetua Thornquist" });
      expect(policyLine(reply), `the card does not cite Standards of Conduct:\n${reply.content}`).toMatch(/standards of conduct/i);
      t.draftWrites(
        { observation: "Observed:\nPerpetua Thornquist was below goal on UPT, ATV, Average Ticket, Bundle Rate % and Gift % this period." },
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
    // production-flags.json corrected to Vercel (QA, 5 Nov 2026): GROUNDED_ENTITIES_ENABLED is off in production since 24 Oct (a deliberate rollback), so a name on no roster goes on the card (no close-match note). Recorded OPEN, a production defect.
    // Changed on purpose (5 Nov 2026): QA flipped CA_SALES_POLICY + REPLY_MATCHES_CARD + TITLE_OF_THE_EMPLOYEE + METRIC_GUARD on in production (production-flags.json), so this case now holds with production's flags.
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Leocadia Wexcomb"));
      const said = `${reply.content}\n${JSON.stringify(thread.proposal)}`;
      expect(said, `no close-match note for Leocadia Wexcombe:\n${said}`).toMatch(/Leocadia Wexcombe/);
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/\*\*(?:Bundle Rate|Under)\*\*/);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-unknown",
    title: "negative control: a full name nobody on the roster shares, typed alone, is announced as not on the roster, flag on or off",
    report: `${REPORT}: negative control, a person not on the roster`,
    // production-flags.json corrected to Vercel (QA, 5 Nov 2026): GROUNDED_ENTITIES_ENABLED is off in production since 24 Oct (a deliberate rollback), so a name on no roster goes on the card (the unknown person is not announced). Recorded OPEN, a production defect.
    // Changed on purpose (10 Nov 2026, QA's roster-set gate): OFF_ROSTER_ASK_BEFORE_CARD (on in production) announces the
    // name ("I can't find **<name>** on your roster — …") with the card held, which this case now accepts; it holds with
    // production's flags.
    status: "fixed",
    /*
     * The middle ground (QA, 4 Nov 2026): a nobody-shaped candidate is set
     * aside only when the same message names somebody on the roster. Nobody
     * here is on it, so the message is read as before.
     */
    // The fix-flag run: fails with production's real flags (QA Vercel read 5 Nov); tracked: GROUNDED_ENTITIES_ENABLED (off in production since 24 Oct, a deliberate rollback) — the unknown person is not announced.
    fixFlags: [FLAG, SALES, GLOSSARY],
    // Holds with its fix flags since flip 3 (6 Nov 2026): the fixStatus is removed, as in #515; it does not depend on FORM_NAME_FROM_ROSTER being on in production.
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(say("Zuleika Brightwell"));
      // Changed on purpose (10 Nov 2026, QA's roster-set gate): OFF_ROSTER_ASK_BEFORE_CARD's "I can't find **<name>** on your
      // roster — …" (production) announces the unknown person as the not-found note does.
      expect(reply.content, `the unknown person is not announced:\n${reply.content}`).toMatch(/couldn't find \*\*Zuleika Brightwell\*\*|can't find \*\*Zuleika Brightwell\*\* on your roster/);
      expect(thread.proposal?.employeeName ?? null, "an unknown person is on the card").not.toBe("Zuleika Brightwell");
      // Said again, the chat moves on: not the same reply word for word (no loop).
      const again = await thread.say("Zuleika Brightwell");
      noRepeatedReply([reply, again]);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-metrics-only",
    title: "metrics with no roster name (\"CA for under performance on Bundle Rate % and Gift %\"): no card for \"under\"; it asks who the form is for",
    report: `${REPORT}: metric words with no roster name beside them`,
    /*
     * With CA_SALES_POLICY_ENABLED on, the card was made "for **under**": the
     * "under" of "for under performance" became the card's employee, with or
     * without the middle ground. Approved (QA for Pau, 4 Nov 2026): one word
     * typed all in lowercase that is nobody's first, preferred or last name on
     * the roster is never the employee (`forms/roster-shape.ts`
     * lowercaseNobody). The card asks for the employee, in this app's
     * existing intake wording ("1. Employee's full name"). With production's
     * flags the turn gets no card, so this holds there too.
     */
    status: "fixed",
    fixFlags: [SALES, FLAG],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("CA for under performance on Bundle Rate % and Gift %");
      expect(reply.content, `a metric is announced as a missing person:\n${reply.content}`).not.toMatch(/couldn't find/i);
      expect(reply.content, `"under" is named as the employee:\n${reply.content}`).not.toMatch(/\*\*under\*\*/i);
      expect(thread.proposal?.employeeName ?? "", "a metric is on the card").not.toMatch(/under|bundle rate/i);
      if (thread.proposal) expect(reply.content, `a card with no employee does not ask who it is for:\n${reply.content}`).toMatch(/Who is this (?:\*\*[^*]+\*\* |form )?for\?|Employee's full name/);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-lowercase-roster-name",
    title: "negative control: a roster first name typed alone in lowercase (\"perpetua\"), answering who the form is for, is still matched",
    report: `${REPORT}: negative control, a lowercase roster first name`,
    // Changed on purpose (5 Nov 2026): QA flipped CA_SALES_POLICY + REPLY_MATCHES_CARD + TITLE_OF_THE_EMPLOYEE + METRIC_GUARD on in production (production-flags.json), so this case now holds with production's flags.
    status: "fixed",
    fixFlags: [SALES, FLAG],
    async run(t) {
      const thread = start(t);
      await thread.say("CA for under performance on Bundle Rate % and Gift %");
      const reply = await thread.say("perpetua");
      const said = `${reply.content}\n${JSON.stringify(thread.proposal)}`;
      expect(said, `"perpetua" is not matched to Perpetua Thornquist:\n${said}`).toMatch(/Perpetua Thornquist/);
    },
  },
  {
    id: "nov4-pau-metrics-not-people-lowercase-first-name",
    title: "Pau's message with the first name typed in lowercase (\"for perpetua\"): Perpetua Thornquist, never a \"Bundle Rate\" card; Standards of Conduct cited",
    report: `${REPORT}: "I need a corrective action verbal for perpetua. This is for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %."`,
    /*
     * Approved by QA, 4 Nov 2026: a single lowercase word that is somebody's
     * first or preferred name on the roster anchors the message
     * (`forms/roster-shape.ts` lowercaseRosterFirstNameIn), so "Bundle Rate"
     * and "Under" are set aside. Before, the card was made "for **Bundle
     * Rate**" with these flags on.
     */
    // Changed on purpose (5 Nov 2026): QA flipped CA_SALES_POLICY + REPLY_MATCHES_CARD + TITLE_OF_THE_EMPLOYEE + METRIC_GUARD on in production (production-flags.json), so this case now holds with production's flags.
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("I need a corrective action verbal for perpetua. This is for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %.");
      expect(reply.content, `"Bundle Rate" or "Under" is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:Bundle Rate|Under)\*\*/i);
      expect(thread.proposal?.employeeName ?? "", "a metric is on the card").not.toMatch(/bundle rate|^under$/i);
      const said = `${reply.content}\n${JSON.stringify(thread.proposal)}`;
      expect(said, `neither a card for Perpetua Thornquist nor "Is this for Perpetua Thornquist?":\n${said}`).toMatch(/Perpetua Thornquist/);
      if (thread.proposal?.employeeName === "Perpetua Thornquist") {
        expect(policyLine(reply), `the card does not cite Standards of Conduct:\n${reply.content}`).toMatch(/standards of conduct/i);
      } else {
        const confirmed = await thread.say("yes");
        expect(thread.proposal, `no CA card for Perpetua Thornquist after "yes":\n${confirmed.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Perpetua Thornquist" });
        expect(policyLine(confirmed), `the card does not cite Standards of Conduct:\n${confirmed.content}`).toMatch(/standards of conduct/i);
      }
    },
  },
  {
    id: "nov4-pau-metrics-not-people-pau-1-lowercase-full-name",
    title: "negative control: QA's pau-1 wording, a lowercase full name (\"corin bellweather\") on the roster, is still the card's employee",
    report: `${REPORT}: negative control, QA's pau-1 wording`,
    status: "fixed",
    fixFlags: [FLAG, SALES, GLOSSARY],
    async run(t) {
      const thread = start(t);
      await thread.say("Corrective action: corin bellweather was rude to a guest at the front desk on Monday");
      expect(thread.proposal, "no CA card for Corin Bellweather").toMatchObject({ templateKey: "dpoa", employeeName: "Corin Bellweather" });
    },
  },
  /*
   * QA, 4 NOV 2026, 19:21 UTC: live in the sibling app, a REAL roster employee
   * (never written), Pau's message 1, CA_SALES_POLICY_ENABLED on and
   * FORM_NAME_FROM_ROSTER_ENABLED off made a card whose Employee was "Bundle
   * Rate" — there for a roster person typed by first name only, or by first
   * name and last initial. Here those shapes ask "Is this for Perpetua
   * Thornquist?" with production's flags and with CA_SALES on. With FORM_NAME
   * on, "Perpetua T" made a card for "Perpetua": part 2's
   * typedWithOtherSurname read the initial as another surname. A last initial
   * that starts the roster surname is now that surname (`request-slot.ts`).
   */
  ...(
    [
      ["first-name", "Perpetua"],
      ["first-initial", "Perpetua T"],
    ] as const
  ).map(
    ([shape, typed]): ReplayCase => ({
      id: `nov4-qa-roster-${shape}-metrics-not-people`,
      title: `QA 4 Nov: Pau's message 1 for a roster person typed "${typed}": the card is never "Bundle Rate"; it is for Perpetua Thornquist or asks for her`,
      report: `QA, 4 Nov 2026: "I need a corrective action verbal for <Employee R>. This is for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %." → card Employee "Bundle Rate"`,
      // production-flags.json corrected to Vercel (QA, 5 Nov 2026): GROUNDED_ENTITIES_ENABLED is off in production since 24 Oct (a deliberate rollback), so the typed first name is not matched to the roster. Recorded OPEN, a production defect.
      // Changed on purpose (5 Nov 2026): QA flipped CA_SALES_POLICY + REPLY_MATCHES_CARD + TITLE_OF_THE_EMPLOYEE + METRIC_GUARD on in production (production-flags.json), so both shapes now hold with production's flags.
      status: "fixed",
      fixFlags: [FLAG, SALES, GLOSSARY],
      async run(t) {
        const thread = start(t);
        const reply = await thread.say(say(typed));
        const card = thread.proposal?.employeeName ?? "";
        expect(card, `a metric is the card's employee:\n${reply.content}`).not.toMatch(/bundle rate|average ticket|^under$|upt|atv|gift/i);
        expect(reply.content, `a metric is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:Bundle Rate|Average Ticket|Under)\*\*/i);
        const asked = /Is this for \*\*Perpetua Thornquist\*\*\?/.test(reply.content);
        // Never the short name alone: "Perpetua T" made a card for "Perpetua" before the initial counted as her surname.
        expect(card === "Perpetua Thornquist" || asked, `neither a card for Perpetua Thornquist nor "Is this for Perpetua Thornquist?" (card ${JSON.stringify(card)}):\n${reply.content}`).toBe(true);
      },
    }),
  ),
  /*
   * QA, 4 NOV 2026, production with CA_SALES_POLICY_ENABLED OFF, in the
   * sibling app: the tester's "employee" was a form's name pasted where the
   * person goes ("… for Coaching Form. …"). The named form won (a Coaching
   * Form card), so the Corrective Action's metric-only answer never ran, and
   * there "Bundle Rate" became the employee. Here the card is a Coaching Form
   * with no employee, and for the metrics wordings the reply says "I couldn't
   * find **Bundle Rate** or **Under** in the Woven roster".
   *
   * Pau's decision (via QA, 4 Nov 2026): the CORRECTIVE ACTION WINS. With
   * FORM_NAME_FROM_ROSTER_ENABLED (which no longer needs the sales policy) a
   * registry form named after "for", after a request for a corrective action,
   * is not the form asked for and is never the employee
   * (`forms/template-intent.ts` caForAnotherForm, `forms/request-slot.ts`):
   * a Corrective Action, no metric named as a person, and a card with no
   * employee asks for one. With the sales policy off, a metrics message gets
   * the metric-only answer (no card), which is the policy's answer. Each
   * wording runs with FORM_NAME alone and with FORM_NAME, the sales policy and
   * the glossary. Exact wording.
   */
  ...(
    [
      ["b", "I need a corrective action for Coaching Form. This is for Under Performance on Bundle Rate % and Gift %."],
      ["p1", say("Coaching Form")],
      // QA's (A): no metric in the message. Production asks for the employee, but on a Coaching Form card.
      ["a", "Create a Corrective Action for Coaching Form"],
    ] as const
  ).flatMap(([key, text]) =>
    (
      [
        ["", [FLAG]],
        ["-with-sales", [FLAG, SALES, GLOSSARY]],
      ] as const
    ).map(
      ([suffix, flags]): ReplayCase => ({
        id: `nov4-qa-form-name-as-person-${key}${suffix}`,
        title: `QA 4 Nov (CA_SALES off): "${text.slice(0, 60)}…": a Corrective Action, never a Coaching Form; no metric is named as a person; a card with no employee asks for one`,
        report: `QA, 4 Nov 2026, production with CA_SALES off: "${text}"`,
        // fixed in production by CA_REQUEST_NOT_PRIOR_COACHING_ENABLED, QA round 4, 8 Nov 2026
        status: "fixed",
        fixFlags: [...flags],
        async run(t) {
          const thread = start(t);
          const reply = await thread.say(text);
          const card = thread.proposal?.employeeName ?? "";
          expect(card, `a metric is the card's employee:\n${reply.content}`).not.toMatch(/bundle rate|average ticket|^under$|upt|atv|gift|coaching form/i);
          expect(reply.content, `a metric is named as a person:\n${reply.content}`).not.toMatch(/\*\*(?:Bundle Rate|Average Ticket|Under)\*\*/i);
          expect(reply.content, `the reply says it has the employee:\n${reply.content}`).not.toMatch(/I have the employee/i);
          if (!thread.proposal) return; // the sales policy off: the metric-only answer
          expect(thread.proposal.templateKey, `not a Corrective Action (Pau: the corrective action wins):\n${reply.content}`).toBe("dpoa");
          if (!card) expect(reply.content, `a card with no employee does not ask for one:\n${reply.content}`).toMatch(/Who is this (?:\*\*[^*]+\*\* |form )?for\?|employee'?s full name/i);
        },
      }),
    ),
  ),
];
