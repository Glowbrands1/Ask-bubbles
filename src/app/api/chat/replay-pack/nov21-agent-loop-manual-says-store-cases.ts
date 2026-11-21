import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";
import { PRODUCTION_MANUAL_CHUNKS } from "./nov21-agent-loop-policy-page-agrees-cases";

/**
 * ============================================================================
 * THE MANUAL QUOTED IN THIS APP SAYS STORE, NEVER SALON (QA's live re-test, 21 Nov 2026, item 7 / A5)
 * ============================================================================
 *
 * QA, on Pau's account with the agent loop on (production 3e2c30dd): "The quoted Late Opening policy text shows the word
 * "salon" in Ask Bubbles." Pau wants Bubbles never to say salon (store instead). The shared JBA Policy Manual's Late Opening
 * reads "The manager of the salon will be required to open the salon …". With production's manual rows, the wording the
 * loop's read_policy gives the reply to quote, the reply's source card and the form Create saves all read "store"; the
 * manual's rows, title and heading stay as stored (`MANUAL_DISPLAY_WORDS`, display only). Invented people.
 */

const REPORT = "QA's live re-test (21 Nov 2026, item 7 / A5, Pau's account, agent loop on): the quoted Late Opening policy text shows the word \"salon\" in Ask Bubbles";
const SALON = /\bsalons?\b/i;

export const NOV21_AGENT_LOOP_MANUAL_SAYS_STORE_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-late-opening-quote-says-store",
    title: "\"ca for Fenna Prewitt, she did not open the store on time on 11/12\": the Late Opening wording the reply quotes, its source card and the saved Direct policy say store, never salon; the manual's rows are unchanged",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T16:40:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const stored = PRODUCTION_MANUAL_CHUNKS.find((row) => row.locator === "Page 15 — Late Opening")!;
      const before = String(stored.content);
      expect(before, "production's Late Opening says salon (the case proves something)").toMatch(SALON);
      t.manualIs!(PRODUCTION_MANUAL_CHUNKS);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const policy = lastResult(view, "read_policy") as { wording?: string; source?: string; heading?: string; page?: number } | null;
        if (!policy) return { tool: "read_policy", input: { heading: "Late Opening" } };
        const card = lastResult(view, "propose_form") as { card?: { policy?: string | null } } | null;
        if (!card) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: "Fenna Prewitt did not open the store on time on 11/12.", incident_date: "2026-11-12", policy: "Late Opening", person_evidence: evidenceFrom(view, "Fenna Prewitt") } };
        if (!card.card) return { text: JSON.stringify(card) };
        // A model that follows the rules book quotes the section's wording as read_policy returned it, with its source.
        return { text: `Here's the Corrective Action Form for **Fenna Prewitt**.\n\n**Policy:** ${card.card.policy ?? ""}\n\n> ${(policy.wording ?? "").replace(/\n/g, " ")} ${policy.source ?? ""}` };
      }));
      const thread = t.thread();
      const reply = await thread.say("ca for Fenna Prewitt, she did not open the store on time on 11/12");
      expect(thread.proposal, `no card was made (the case proves nothing):\n${reply.content}`).not.toBeNull();
      expect(reply.content, "the reply quotes no Late Opening wording (the case proves nothing)").toMatch(/required to open the store/);
      expect(reply.content, `the quoted policy says salon:\n${reply.content}`).not.toMatch(SALON);
      const cards = (reply.citations ?? []).filter((card) => /Late Opening/.test(card.locator ?? ""));
      expect(cards.length, "no Late Opening source card").toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.excerpt ?? "", `the source card says salon:\n${card.excerpt}`).not.toMatch(SALON);
        expect(card.locator, "the manual's heading was renamed").toBe("Page 15 — Late Opening");
      }

      const id = await thread.create();
      const direct = t.values(id).policy_language ?? "";
      expect(direct, "Create quoted no Late Opening wording").toMatch(/required to open the store/);
      expect(direct, `the saved Direct policy says salon:\n${direct}`).not.toMatch(SALON);
      expect(direct).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
      expect(String(stored.content), "the stored manual chunk was changed").toBe(before);
    },
  },
];
