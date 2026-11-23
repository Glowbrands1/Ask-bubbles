import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * ONE TAB NEVER GETS ANOTHER TAB'S CARD (QA, 23 Nov 2026: the duplicate-tab finding)
 * ============================================================================
 *
 * The open chat's id is in the address (`?c=<id>`, `chat-address.ts`), and a tab opened on that address (Duplicate tab,
 * a copied address) joins the same conversation id. The loop's records (the card, the name question, the which-form
 * question) are read by conversation id, so the second tab's turn took the first tab's card as the chat's card. A
 * record counts for this turn only when it is this request's own: its message is in this tab's history (by id, or by
 * its question key), or it is older than this history's window. A fresh tab's first turn has none.
 */

const REPORT = "QA (23 Nov 2026): a manager's two tabs on one conversation id (a duplicated tab) — tab B's turn took tab A's card";

export const NOV23_AGENT_LOOP_TWO_TABS_ONE_CHAT_CASES: ReplayCase[] = [
  {
    id: "nov23-two-tabs-one-conversation-no-crossed-card",
    title: "Two tabs on one conversation id: tab A makes <P>'s Corrective Action card; tab B, a fresh thread on the same id, says \"make it a written warning\" and never gets tab A's card",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      /* The stand-in proposes the card in tab A; in tab B it answers with no card call. Hand-backs it is given are kept. */
      const handedBack: string[] = [];
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const check = view.turns.filter((turn) => turn.role === "user").map((turn) => turn.text).find((text) => text.includes("[app check]"));
        if (check) handedBack.push(check);
        const result = lastResult(view, "propose_form") as { card?: { employee?: string }; ask_exactly?: string } | null;
        if (result) return { text: result.card ? `Here's the Corrective Action Form for **${result.card.employee}**.` : (result.ask_exactly ?? "Who is this for?") };
        const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
        if (/fenna/i.test(said)) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), what_happened: "Fenna was late on 11/12.", policy: headingWith(view, /^attendance/i) } };
        /* Tab B: a reply with no card call, about "her" (the person tab B's manager has in mind; no card in tab B). */
        return { text: "**Type of Warning:** Written Warning, as you said. She will get a written warning." };
      }));
      const tabA = t.thread({ idPrefix: "a" });
      await tabA.say("ca for Fenna Prewitt, she was late on 11/12");
      expect(tabA.proposal?.employeeName, "tab A has no card").toBe("Fenna Prewitt");
      handedBack.length = 0; // tab A's own hand-backs (its reply's Policy line) are not this case's
      const tabB = t.thread({ conversationId: tabA.conversationId, idPrefix: "b" });
      const reply = await tabB.say("make it a written warning");
      expect(tabB.proposal?.employeeName ?? null, `tab B got tab A's card:\n${reply.content}`).not.toBe("Fenna Prewitt");
      expect(reply.content, "tab B's reply names tab A's person").not.toMatch(/Fenna/);
      /* Tab B has no card, so its reply is never checked against tab A's card ("No card was proposed this turn, so the card on the manager's screen …"). */
      expect(handedBack.join("\n---\n"), "tab B's reply was handed back against tab A's card").toBe("");
      expect(reply.content, "tab B's reply was checked against tab A's card").not.toMatch(/isn't on the card yet|on the card on screen/i);
    },
  },
];
