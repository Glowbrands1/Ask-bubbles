import { expect, vi } from "vitest";

import { TWO_STORES, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_FENNA_OSTRANDER, LOOP_STAFF, LOOP_THADDEA } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * ANOTHER PERSON'S ACCOUNT NEVER GOES ON THIS PERSON'S CARD BEFORE THE MANAGER SAYS WHO (QA's live re-test, 21 Nov 2026, A6, item 9)
 * ============================================================================
 *
 * "create verbal CA for <A> for violating visitors at work policy on 10-10-26. <B> spent 40 minutes talking with friend
 * and ignoring guests. previous coaching was jba policy manual 1-1-26": the loop rightly asked who the form is for, and
 * <A>'s card still showed, ready to Create, with <B>'s account on it. A decision the model makes (QA's classing:
 * INSTRUCTION): the rules book now says to ask the which-person question BEFORE any card, and to propose the card for the
 * person the answer picks. The stand-in decides as the live model did (the card, then the question) unless its system
 * prompt carries that rule; the tools, the card and the request window are real.
 *
 * Also (CODE): the card's account used the full name (the first name is shared by someone else on the staff list) while
 * the saved Expectation used the first name. The saved write-up's convention is the first name (port #993, the draft
 * route's `employeeFirstName`), so the card's account uses it too (`cardAccountName`); the name field keeps the full name.
 *
 * QA's wording; invented people (`loop-roster.ts`): <A> Fenna Prewitt, <B> Thaddea Kroll, and Fenna Ostrander at the
 * other store for the shared first name.
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, 3e2c30dd), A6: Bubbles asked who it's for, but <B>'s account stayed on <A>'s card; the saved Expectation used the first name while the card used the full name";
const SAID = "create verbal CA for Fenna Prewitt for violating visitors at work policy on 10-10-26. Thaddea Kroll spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26";
const ACCOUNT = (name: string) => `${name} spent 40 minutes talking with a friend and ignoring guests on 10/10/2026.`;

const lastSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
const proposeResults = (views: readonly LoopView[]) => views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).map((result) => result.output);

function start(t: ReplayContext, scope: unknown = WEST_DODGE, staff = LOOP_STAFF) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...staff]);
  t.as("location_manager", scope);
}

/**
 * The live model: on the request turn it proposes <A>'s card with the account it was told (under <B>'s name, or moved
 * to <A>'s) and asks who; on the answer turn it proposes the card for the person named in the answer.
 */
/** The rules book line this case is about (rules-book.ts, "Who the form is for"). */
const RULE = /Ask BEFORE any card when the manager's message asks for one person's form and tells what ANOTHER named person did/;

function liveModel(accountUnder: "other" | "card") {
  return loopStandIn((view): LoopDecision => {
    const said = lastSaid(view);
    if (said === SAID && RULE.test(view.system)) return { text: "This account is about **Thaddea Kroll**. Is the form for **Thaddea Kroll** or **Fenna Prewitt**?" };
    const card = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string } | null;
    // Live: the card, and the which-person question beside it.
    if (card) return { text: card.card ? "Here's the Corrective Action Form. This account is about **Thaddea Kroll**. Is the form for **Thaddea Kroll** or **Fenna Prewitt**?" : "Who is this form for?" };
    const forThaddea = /^thaddea/i.test(said);
    const person = forThaddea ? LOOP_THADDEA : LOOP_FENNA;
    const name = forThaddea || accountUnder === "other" ? "Thaddea Kroll" : "Fenna Prewitt";
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: person.id, person_evidence: evidenceFrom(view, said === SAID ? "Fenna Prewitt" : said),
        warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal", said === SAID ? 0 : 1),
        what_happened: ACCOUNT(name), incident_date: "2026-10-10",
      },
    };
  });
}

export const NOV21_AGENT_LOOP_OTHER_PERSONS_ACCOUNT_CASES: ReplayCase[] = [
  ...(["other", "card"] as const).map((accountUnder): ReplayCase => ({
    id: `nov21-agent-loop-other-persons-account-not-on-card-${accountUnder === "other" ? "as-told" : "renamed"}`,
    title: `"${SAID}": the model puts <B>'s account on <A>'s card (${accountUnder === "other" ? "under <B>'s name" : "moved to <A>'s name"}) and asks who: no card that turn, the question asks <A> or <B>; "Thaddea Kroll" makes <B>'s card with the account`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = liveModel(accountUnder);
      t.loopModel!(model);
      const thread = t.thread();
      const asked = await thread.say(SAID);
      expect(proposeResults(model.views).filter((out) => (out as { card?: unknown }).card), "a card for <A> was made with <B>'s account").toEqual([]);
      expect(asked.formProposal ?? null, `a card for <A> showed with <B>'s account:\n${JSON.stringify(asked.formProposal)}`).toBeNull();
      expect(asked.content).toContain("Is the form for **Thaddea Kroll** or **Fenna Prewitt**?");

      await thread.say("Thaddea Kroll");
      expect(thread.proposal?.employeeName, "the answer did not make <B>'s card").toBe("Thaddea Kroll");
      expect((thread.proposal as { issue?: string } | null)?.issue ?? "").toMatch(/spent 40 minutes talking with a friend/);
    },
  })),
  {
    id: "nov21-agent-loop-other-persons-account-answer-card-person-makes-card",
    title: "control: the same request, then the manager answers \"Fenna Prewitt\": the answer is theirs to give, and <A>'s card is made",
    report: `${REPORT}; the answer releases the card`,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(liveModel("card"));
      const thread = t.thread();
      await thread.say(SAID);
      expect(thread.proposal ?? null, "a card showed before the answer").toBeNull();
      await thread.say("Fenna Prewitt");
      expect(thread.proposal?.employeeName, "the answer did not make <A>'s card").toBe("Fenna Prewitt");
    },
  },
  {
    id: "nov21-agent-loop-card-account-first-name-when-shared",
    title: "the card's person shares a first name with someone at the other store: the card's account says \"Fenna\", as the saved Observed and Expectation do (the saved write-up's first-name convention), never the full name on one and the first name on the other",
    report: `${REPORT}; the first-name half, with port #993's saved-write-up convention`,
    status: "fixed",
    async run(t) {
      start(t, TWO_STORES, [...LOOP_STAFF, LOOP_FENNA_OSTRANDER]);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form." };
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"),
            warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"),
            what_happened: ACCOUNT("Fenna Prewitt"), incident_date: "2026-10-10",
          },
        };
      }));
      const thread = t.thread();
      await thread.say("create verbal CA for Fenna Prewitt for violating visitors at work policy on 10-10-26. Fenna Prewitt spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26");
      expect(thread.proposal?.employeeName, "the card's name field keeps the full name").toBe("Fenna Prewitt");
      const issue = (thread.proposal as { issue?: string } | null)?.issue ?? "";
      expect(issue, `the card's account: "${issue}"`).toMatch(/^Fenna spent 40 minutes/);
      t.draftWrites({ observation: `Observed:\n${ACCOUNT("Fenna Prewitt")}\n\nExpectation:\nFenna is expected to stay with guests and keep visits short.` });
      const id = await thread.create();
      const observation = t.values(id).observation ?? "";
      expect(observation, observation).toMatch(/Observed:\s*Fenna spent 40 minutes/);
      expect(observation, observation).toMatch(/Expectation:\s*Fenna is expected/);
    },
  },
];
