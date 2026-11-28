import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * LABELLED GENERAL ADVICE WHEN THE DOCUMENTS HAVE NOTHING (GENERAL_ADVICE_ENABLED; the owner, 28 Nov 2026)
 * ============================================================================
 *
 * The owner, asked "Should the AI give clearly labelled general advice when company documents don't cover something?
 * Never for policy, pay or legal.", said "yes" (port from the sibling app). Until now a harmless management question the knowledge base has nothing
 * on was answered only "the knowledge base does not have that": search_knowledge's note and the rules book said "never
 * answer from memory". On: a general question may get short general advice under "General advice (not from Buff
 * City Soap documents):"; a pay or legal question never does (it says it is not in the documents and points to HR or their
 * manager), a cited policy answer never carries it, and the code holds all three (`ai/general-advice.ts`).
 *
 * The stand-in shows the code's side: what the rule and the tool's note tell the model, and what the code does to a
 * reply that ignores them. The questions are a manager's natural words; the policy passage is invented test text.
 */

const FLAG = "GENERAL_ADVICE_ENABLED";
const REPORT = "The owner, 28 Nov 2026: \"Should the AI give clearly labelled general advice when company documents don't cover something? Never for policy, pay or legal.\" — \"yes\"";
const LABEL = "General advice (not from Buff City Soap documents):";

const NOT_FOUND = "I couldn't find anything on team huddles in the Buff City Soap documents.";
const HUDDLE_TIPS = [
  "1. Keep it to ten minutes, standing, at the start of the shift.",
  "2. Open with one win from yesterday.",
  "3. Give today's one focus and who owns it.",
  "4. End on time and ask if anyone needs help.",
].join("\n");

const CELL_PHONE_POLICY = {
  chunk_id: "kb-cell-phones",
  document_id: "doc-floor-standards",
  document_title: "FLOOR STANDARDS TEST DOCUMENT",
  category: "operations",
  locator: "Phones on the floor",
  page: 3,
  section: "Phones on the floor",
  content: "Phones stay in the back room during a shift. A phone may be used on a break, away from guests.",
  similarity: 0.81,
};

const handedBack = (view: LoopView) => /\[app check\]/.test(view.turns.at(-1)?.text ?? "");
const searchNotes = (views: readonly LoopView[]) => views.flatMap((view) => view.results).filter((result) => result.tool === "search_knowledge").map((result) => String(result.output.note ?? ""));

function start(t: ReplayContext, rows: readonly Record<string, unknown>[] = []) {
  vi.setSystemTime(new Date("2026-11-28T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.knowledgeHas!(rows);
}

const loopCase = (id: string, title: string, status: ReplayCase["status"], run: (t: ReplayContext) => Promise<void>): ReplayCase => ({
  id, title, report: REPORT, status, fixFlags: [FLAG],
  async run(t) {
    if (process.env.AGENT_LOOP_LIVE === "1") return;
    await run(t);
  },
});

/** The model searches first, then replies with what `reply` makes of the turn (the rule and the tool's note it was shown). */
function searchesThen(query: string, reply: (view: LoopView) => string) {
  return loopStandIn((view: LoopView): LoopDecision => (lastResult(view, "search_knowledge") ? { text: reply(view) } : { tool: "search_knowledge", input: { query } }));
}

export const NOV28_GENERAL_ADVICE_CASES: ReplayCase[] = [
  loopCase(
    "nov28-general-advice-huddle",
    "\"how do I run a good team huddle?\" with nothing in the documents: short general advice, under the label, no source, no card",
    { open: "the rule is not in the prompt and the search's note says \"never answer from memory\": the reply is only \"not found\"" },
    async (t) => {
      start(t);
      // A model that follows what it is told: labelled general advice only when the rule and the note allow it.
      const standIn = searchesThen("running a team huddle", (view) => {
        const allowed = view.system.includes(LABEL) && searchNotes([view]).some((note) => note.includes(LABEL));
        return allowed ? `${NOT_FOUND}\n\n${LABEL}\n${HUDDLE_TIPS}` : NOT_FOUND;
      });
      t.loopModel!(standIn);
      const reply = await t.thread().say("how do I run a good team huddle?");
      expect(standIn.views[0]?.system ?? "", "the general advice rule is not in the prompt").toContain(`"${LABEL}"`);
      expect(reply.content, reply.content).toContain(LABEL);
      expect(reply.content, reply.content).toMatch(/one focus/);
      expect(reply.citations ?? [], "a source was named that the search never returned").toEqual([]);
      expect(reply.formProposal ?? null, "a card was made for an advice question").toBeNull();
    },
  ),
  loopCase(
    "nov28-general-advice-label-added",
    "\"tips for giving feedback to a new hire\", answered with general tips after a search that found nothing, without the label: the code labels it (no extra model call)",
    { open: "the tips reach the manager with no label: they read as company guidance" },
    async (t) => {
      start(t);
      const tips = "1. Give it the same day, in private.\n2. Name what they did and what good looks like.\n3. Ask what would help them.\n4. Check back at the end of the week.";
      const standIn = searchesThen("feedback for a new hire", () => tips);
      t.loopModel!(standIn);
      const reply = await t.thread().say("tips for giving feedback to a new hire");
      expect(reply.content.startsWith(LABEL), reply.content).toBe(true);
      expect(reply.content, reply.content).toContain("Give it the same day");
      // The coaching how-to check may hand a feedback answer back (its prep package); the label itself never costs a call.
      expect(standIn.views.some((view) => handedBack(view) && (view.turns.at(-1)?.text ?? "").includes(LABEL)), "a missing label cost a model call").toBe(false);
    },
  ),
  loopCase(
    "nov28-general-advice-pay-never",
    "\"what should I pay a new hire starting next week?\": the search's note points to HR, and labelled general advice the model writes anyway never reaches the manager",
    { open: "the labelled pay advice (\"most shops start a little above minimum wage\") reaches the manager" },
    async (t) => {
      start(t);
      const standIn = searchesThen("starting pay new hire", () => `That isn't in the Buff City Soap documents.\n\n${LABEL}\n- Most shops start a little above minimum wage.`);
      t.loopModel!(standIn);
      const reply = await t.thread().say("what should I pay a new hire starting next week?");
      expect(searchNotes(standIn.views).join("\n"), "the note does not point a pay question to HR").toMatch(/HR or their manager/);
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).not.toMatch(/minimum wage/i);
      expect(reply.content, reply.content).toMatch(/HR or your manager/);
    },
  ),
  loopCase(
    "nov28-general-advice-legal-never",
    "\"can I fire someone for complaining about their schedule?\" answered from memory after a search that found nothing: never sent; it says it is not in the documents and points to HR",
    { open: "the model's own legal advice (\"in an at-will state you can usually let them go\") reaches the manager" },
    async (t) => {
      start(t);
      const fromMemory = "1. In an at-will state you can usually let them go.\n2. Document the complaint first.\n3. Give them a final warning.";
      const standIn = searchesThen("terminate employee complaint schedule", () => fromMemory);
      t.loopModel!(standIn);
      const reply = await t.thread().say("can I fire someone for complaining about their schedule?");
      expect(reply.content, reply.content).not.toMatch(/at-will|let them go/i);
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).toMatch(/HR or your manager/);
      expect(standIn.views.some(handedBack), "the legal answer from memory was not handed back first").toBe(true);
    },
  ),
  loopCase(
    "nov28-general-advice-policy-cites",
    "\"whats our policy on cell phones on the floor\" with the policy in the documents: the answer cites it and carries no general advice",
    "fixed",
    async (t) => {
      start(t, [CELL_PHONE_POLICY]);
      const standIn = searchesThen("cell phone policy", () => "Phones stay in the back room during a shift, and may be used on a break away from guests [S1].");
      t.loopModel!(standIn);
      const reply = await t.thread().say("whats our policy on cell phones on the floor");
      expect((reply.citations ?? []).map((citation) => citation.documentTitle), reply.content).toContain(CELL_PHONE_POLICY.document_title);
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).toMatch(/back room/);
    },
  ),
  loopCase(
    "nov28-general-advice-policy-never-mixed",
    "The same policy question, the model adding labelled tips under its cited answer: the tips are cut and the cited answer kept",
    { open: "labelled general advice is mixed into the cited policy answer" },
    async (t) => {
      start(t, [CELL_PHONE_POLICY]);
      const cited = "Phones stay in the back room during a shift, and may be used on a break away from guests [S1].";
      const standIn = searchesThen("cell phone policy", () => `${cited}\n\n${LABEL}\n- Put a basket in the back for phones.`);
      t.loopModel!(standIn);
      const reply = await t.thread().say("whats our policy on cell phones on the floor");
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).not.toMatch(/basket/);
      expect(reply.content, reply.content).toMatch(/back room/);
      expect((reply.citations ?? []).map((citation) => citation.documentTitle), reply.content).toContain(CELL_PHONE_POLICY.document_title);
    },
  ),
  /* The chat's own path (no agent loop: a turn the loop does not take, such as one with report context). */
  {
    id: "nov28-general-advice-chat-huddle",
    title: "The chat's path: \"how do I run a good team huddle?\" with nothing in the documents: the prompt allows labelled general advice, and uncited tips get the label",
    report: REPORT,
    status: { open: "the prompt's no-match line names no topic general advice must never touch, and uncited tips carry no label" },
    fixFlags: [FLAG],
    async run(t) {
      start(t);
      t.modelSays(`${NOT_FOUND}\n\n${HUDDLE_TIPS}`);
      const reply = await t.thread().say("how do I run a good team huddle?");
      expect(t.lastSystem!(), "the general advice rule is not in the chat's prompt").toContain(`"${LABEL}"`);
      expect(reply.content, reply.content).toContain(`${NOT_FOUND}\n\n${LABEL}`);
    },
  },
  {
    id: "nov28-general-advice-chat-benefits-never",
    title: "The chat's path: \"how much PTO do my shift leads get\" answered with labelled general advice: cut, and pointed to HR",
    report: REPORT,
    status: { open: "the labelled PTO advice reaches the manager" },
    fixFlags: [FLAG],
    async run(t) {
      start(t);
      t.modelSays(`That isn't in the documents I can see.\n\n${LABEL}\n- Most retailers give two weeks a year.`);
      const reply = await t.thread().say("how much PTO do my shift leads get");
      expect(reply.content, reply.content).not.toContain(LABEL);
      expect(reply.content, reply.content).not.toMatch(/two weeks/);
      expect(reply.content, reply.content).toMatch(/HR or your manager/);
    },
  },
];
