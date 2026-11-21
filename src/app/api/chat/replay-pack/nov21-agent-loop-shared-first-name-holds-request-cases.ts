import { expect, vi } from "vitest";

import { TWO_STORES, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_FENNA_OSTRANDER, LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * TWO PEOPLE SHARE THE FIRST NAME: ASK WHICH ONCE, BY STORE, AND KEEP WHAT THE MANAGER SAID (QA's live re-test, 21 Nov 2026, A9, item 12)
 * ============================================================================
 *
 * "Create a coaching form." → "<first name>" → two employees share the first name, and Bubbles asked "which one" 7 turns in
 * a row, ignoring the topic ("ship from store, when to press ready for pick up and when to press mark as shipped") and
 * the observation ("<first name> marked an order as shipped but the customer hadn't picked up yet"). A decision the
 * model makes (QA's classing: INSTRUCTION), so the rules book now says: ask which one ONCE, with each full name and store
 * from find_staff's matches; while it waits, the manager's messages are kept for the form and the question is not asked
 * again; an answer naming one person's store or full name picks them, looked up by full name, and the card carries the
 * topic and the account. The stand-in decides as the live model did, unless its instructions carry that rule (it reads
 * its system prompt, as the live model does); the tools, the card and the request window are real.
 *
 * QA's wording ("Michelle" → the invented "Fenna"); invented people: Fenna Prewitt at West Dodge, Fenna Ostrander at
 * Bellevue (`loop-roster.ts`), a store manager over both stores (`TWO_STORES`).
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, 3e2c30dd), A9: two employees share the first name; Bubbles asked \"which one\" 7 turns in a row and ignored the topic and the observation";
const TOPIC = "ship from store, when to press ready for pick up and when to press mark as shipped";
const OBSERVED = "Fenna marked an order as shipped but the customer hadn't picked up yet";

const managerTurns = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
const lastSaid = (view: LoopView) => managerTurns(view).at(-1)?.text ?? "";
/** Evidence quoting the manager turn that holds `words`. */
const quoting = (view: LoopView, words: string) => {
  const turn = managerTurns(view).find((entry) => entry.text.includes(words));
  return { message_id: turn?.messageIds?.at(-1) ?? "current", quote: words };
};

type Found = { matches?: { employee_id: string; name: string; stores: string[] }[]; reason_code?: string } | null;

/** The rules book line this case is about (rules-book.ts, "Who the form is for"). */
const RULE = /ask which one ONCE, with each full name and/;
const ASKED = /^Which \*\*Fenna\*\* is this for:/;

/**
 * The live model, or one that follows the rule when its instructions carry it. Live: no name yet, it asks who; then it
 * looks the first name up every turn and asks "which one" every turn. With the rule: it asks once with each full name and
 * store, keeps the manager's next messages, and on an answer naming a store or full name looks that full name up and
 * proposes the coaching card with the topic and the account.
 */
function liveModel() {
  return loopStandIn((view): LoopDecision => {
    if (!managerTurns(view).some((turn) => /\bfenna\b/i.test(turn.text))) return { text: "Who is this Coaching Form for?" };
    const card = lastResult(view, "propose_form") as { card?: unknown; error?: string } | null;
    if (card) return { text: card.card ? "Here's the Coaching Form." : card.error ?? "" };
    const found = lastResult(view, "find_staff") as Found;
    const ruled = RULE.test(view.system);
    const question = view.turns.find((turn) => turn.role === "assistant" && ASKED.test(turn.text))?.text ?? null;
    if (ruled && question && !found) {
      // The answer picks by store or full name, from the question's own "**<full name>** at <store>" pairs.
      const said = lastSaid(view).toLowerCase();
      const pairs = [...question.matchAll(/\*\*([^*]+)\*\* at ([^*?]+?)(?= or \*\*|\?|$)/g)].map((match) => ({ name: match[1]!, store: match[2]! }));
      const picked = pairs.filter((pair) => said.includes(pair.name.toLowerCase()) || said.split(/\s+/).filter((word) => word.length > 3).every((word) => pair.store.toLowerCase().includes(word)));
      if (picked.length !== 1) return { text: "Got it, I've kept that for the Coaching Form; it's made once you tell me which Fenna." };
      return { tool: "find_staff", input: { name: picked[0]!.name, person_evidence: quoting(view, "Fenna") } };
    }
    if (!found) return { tool: "find_staff", input: { name: "fenna", person_evidence: quoting(view, "Fenna") } };
    if (found.matches?.length === 1) {
      return {
        tool: "propose_form",
        input: {
          template_key: "coaching", employee_id: found.matches[0]!.employee_id, person_evidence: quoting(view, "Fenna"),
          topic: "ship from store", topic_evidence: quoting(view, TOPIC), what_happened: `${OBSERVED}.`,
          request_evidence: [quoting(view, TOPIC), quoting(view, OBSERVED)],
        },
      };
    }
    if (ruled) return { text: `Which **Fenna** is this for: ${(found.matches ?? []).map((match) => `**${match.name}** at ${match.stores.join(" and ")}`).join(" or ")}?` };
    return { text: "There are two people named Fenna. Which one do you mean?" };
  });
}

async function untilAnswered(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, LOOP_FENNA_OSTRANDER]);
  t.as("location_manager", TWO_STORES);
  const model = liveModel();
  t.loopModel!(model);
  const thread = t.thread();
  await thread.say("Create a coaching form.");
  const which = await thread.say("Fenna");
  expect(which.content, `the question does not tell the two apart by store:\n${which.content}`).toMatch(/Fenna Prewitt\*{0,2} \(?(?:at )?[^)\n]*West Dodge/i);
  expect(which.content, which.content).toMatch(/Fenna Ostrander\*{0,2} \(?(?:at )?[^)\n]*Bellevue/i);
  const topic = await thread.say(TOPIC);
  const observed = await thread.say(OBSERVED);
  for (const [said, reply] of [[TOPIC, topic], [OBSERVED, observed]] as const) {
    expect(reply.content, `"${said}": "which one" was asked again, the manager's words ignored:\n${reply.content}`).not.toBe(which.content);
  }
  expect(thread.proposal ?? null, "a card was made before the manager said which").toBeNull();
  return thread;
}

export const NOV21_AGENT_LOOP_SHARED_FIRST_NAME_HOLDS_REQUEST_CASES: ReplayCase[] = [
  ...([
    ["west dodge", LOOP_FENNA, "Fenna Prewitt"],
    ["bellevue", LOOP_FENNA_OSTRANDER, "Fenna Ostrander"],
    ["Fenna Ostrander", LOOP_FENNA_OSTRANDER, "Fenna Ostrander"],
  ] as const).map(([answer, , name]): ReplayCase => ({
    id: `nov21-agent-loop-shared-first-name-${answer.toLowerCase().replace(/\s+/g, "-")}-picks`,
    title: `"Create a coaching form." → "Fenna" (two Fennas) → the topic → the observation → "${answer}": asked which once, by store; the topic and observation are kept, and "${answer}" makes ${name}'s Coaching card with both`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = await untilAnswered(t);
      await thread.say(answer);
      expect(thread.proposal?.employeeName, `"${answer}" did not pick ${name}`).toBe(name);
      expect(thread.proposal?.templateKey).toBe("coaching");
      expect((thread.proposal as { issue?: string } | null)?.issue ?? "", "the observation was lost").toMatch(/marked an order as shipped/);
      expect((thread.proposal as { coachingTopic?: string } | null)?.coachingTopic ?? "", "the topic was lost").toMatch(/ship from store/i);
    },
  })),
];
