import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A LOOP CARD BECOMES THE RIGHT FORM AT CREATE (the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * The loop's card (`fromAgentLoop`) goes through the real Create (`createInlineForm` → POST /api/forms/instances → the
 * draft route), as the browser does it. These cases hold the hand-off: each of the forms the loop treats specially
 * lands with this app's own template key (`BUBBLES_CONFIG.formKeys`: dpoa, coaching, follow-up-coaching), and a
 * termination is ticked only when the manager's own words carry a termination word (the sibling app's design of
 * 15 Nov 2026: the model decides, code only locks it, and Create checks the word again, server-side). Mechanism only;
 * invented people (`loop-roster.ts`).
 */

const REPORT = "QA, 21 Nov 2026 (the loop port): the loop's card through the real Create route";
const ACCOUNT = "She was a no call no show on 11/12.";
const HEDGE = "If this form is a termination, tick Termination on the form yourself; it needs DM/HR approval before it's finalized.";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-14T22:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** One card for Fenna Prewitt of this form, then a reply. */
function cardModel(templateKey: string, extra: Record<string, unknown> = {}) {
  return loopStandIn((view): LoopDecision => {
    if (!lastResult(view, "propose_form")) {
      return { tool: "propose_form", input: { template_key: templateKey, employee_id: LOOP_FENNA.id, what_happened: "Fenna Prewitt was 20 minutes late on 11/12.", incident_date: "2026-11-12", person_evidence: evidenceFrom(view, "fenna prewitt"), ...extra } };
    }
    return { text: "Here's the card for **Fenna Prewitt**." };
  });
}

/** A Corrective Action card where the stand-in model decides `termination` or not, as the rules book teaches. */
async function terminationCard(t: ReplayContext, words: string, termination: boolean) {
  start(t);
  t.loopModel!(loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { facts?: { termination_stated?: { approval: string }; termination_mentioned_not_stated?: boolean } } | null;
    if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "fenna prewitt" } };
    if (!result) return { tool: "propose_form", input: { level_evidence: evidenceFrom(view), template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: ACCOUNT, incident_date: "2026-11-12", ...(termination ? { warning_level: "termination" } : {}) } };
    const stated = result.facts?.termination_stated;
    return {
      text: stated
        ? `Here's the Corrective Action Form for **Fenna Prewitt**.\n\n**Type of Warning:** Termination, as you said — I'll tick it on the form. Tell me if that should change.\n${stated.approval}\n\n**Observation of Offense:** ${ACCOUNT}`
        : `Here's the Corrective Action Form for **Fenna Prewitt**.\n\n${result.facts?.termination_mentioned_not_stated ? `${HEDGE}\n\n` : ""}**Observation of Offense:** ${ACCOUNT}`,
    };
  }));
  const thread = t.thread();
  const reply = await thread.say(`ca for fenna prewitt. ${words} ${ACCOUNT}`);
  return { thread, reply };
}

export const NOV21_AGENT_LOOP_CREATE_FROM_CARD_CASES: ReplayCase[] = [
  ...([
    ["dpoa", "ca for fenna prewitt, she was 20 minutes late on 11/12"],
    ["coaching", "coaching form for fenna prewitt, she was 20 minutes late on 11/12"],
    ["follow-up-coaching", "follow up coaching for fenna prewitt, she was 20 minutes late again on 11/12"],
  ] as const).map(([templateKey, said]): ReplayCase => ({
    id: `nov21-agent-loop-create-from-card-${templateKey}`,
    title: `"${said}": the loop's card (fromAgentLoop) is created through the real Create route as a ${templateKey} form for the card's person`,
    report: `${REPORT}; this app's form keys (BUBBLES_CONFIG.formKeys)`,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(cardModel(templateKey));
      const thread = t.thread();
      await thread.say(said);
      expect(thread.proposal, "no card was made (the case proves nothing)").not.toBeNull();
      expect((thread.proposal as { fromAgentLoop?: boolean }).fromAgentLoop, "the card is not the loop's").toBe(true);
      expect(thread.proposal?.templateKey).toBe(templateKey);
      const id = await thread.create();
      const row = t.forms().find((entry) => entry.id === id) as { template_key?: string; employee_name?: string; status?: string; location_id?: string | null } | undefined;
      expect(row?.template_key, "Create made a different form from the card").toBe(templateKey);
      expect(row?.employee_name).toBe("Fenna Prewitt");
      expect(row?.status).toBe("draft");
      expect(t.forms(), "more than one form was created").toHaveLength(1);
    },
  })),
  {
    id: "nov21-agent-loop-create-termination-stated-is-ticked",
    title: "\"we're terminating her\": the model decides this form is a termination; the card says Termination, as you said, with the DM/HR approval line, and Create ticks Termination",
    report: `${REPORT}; the sibling app's termination design (15 Nov 2026), the manager's own termination word`,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminationCard(t, "we're terminating her", true);
      expect(reply.content, `not carded as a termination:\n${reply.content}`).toMatch(/\*\*Type of Warning:\*\* Termination, as you said/);
      expect(reply.content).toContain("DM/HR approval");
      const id = await thread.create();
      expect(t.checked(id).warning_type, "Create did not tick Termination").toEqual(["termination"]);
    },
  },
  {
    id: "nov21-agent-loop-create-termination-warning-not-ticked",
    title: "\"if this happens again it will result in termination\": a warning, not this form's termination; the hedge line, and Create ticks nothing",
    report: `${REPORT}; a termination word that is about the future is never this form's level`,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminationCard(t, "if this happens again it will result in termination", false);
      expect(reply.content, "carded as a termination").not.toMatch(/Termination, as you said/);
      expect(reply.content).toContain(HEDGE);
      const id = await thread.create();
      expect(t.checked(id).warning_type ?? [], "Create ticked Termination").not.toContain("termination");
    },
  },
  {
    id: "nov21-agent-loop-create-termination-no-word-locked",
    title: "\"write her up, she has two prior warnings\" and the model asks for a termination anyway: no termination word in the manager's words, so the lock refuses it on the card and Create ticks nothing",
    report: `${REPORT}; code locks a termination to the manager's own word, whatever the model sends`,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await terminationCard(t, "write her up, she has two prior warnings", true);
      expect(reply.content, "carded as a termination with no termination word").not.toMatch(/Termination, as you said/);
      expect((thread.proposal as { warningLevel?: string | null } | null)?.warningLevel ?? null, "the card's level is a termination").not.toBe("termination");
      const id = await thread.create();
      expect(t.checked(id).warning_type ?? [], "Create ticked Termination with no termination word").not.toContain("termination");
    },
  },
];
