import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD KEEPS WHOSE IT IS: "HER PERSONAL LIFE" IS NEVER "THE PERSONAL LIFE" (Pau's round 3, U23, 22 Nov 2026)
 * ============================================================================
 *
 * The tester's chat word for word (production 1c71e11, admin login; invented: legal Odessa Brookfield, preferred Tamsin).
 * T5's card read "Tamsin has talked about the boyfriend or ex boyfriend with customers", and T6's "… constantly bothering
 * them not just about products but about the personal life." The card/reply pronoun pass turned the named person's
 * possessive into "the". QA's ruling (option 2, card/reply pass only): the first possessive keeps its owner; the saved
 * write-up keeps HR's design (3 Oct 2026).
 */

const REPORT = "Pau's round 3 (22 Nov 2026, U23): \"about her personal life\" read \"about the personal life\" on the card and in the reply (and \"her boyfriend\" \"the boyfriend\")";
const TAMSIN: DirectoryRow = { id: "e-odessa-brookfield", firstName: "Odessa", lastName: "Brookfield", preferredFirstName: "Tamsin", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "i need to create a corrective action for Tamsin Brookfield";
const T2 = "She has unprofessional conversations with guests and staff. I have already had a conversation with her about this.";
const T5 = "Multiple times she has talked about her boyfriend or ex boyfriend with customers, she has stated that she takes medication for different things to customers, even stating that she was sick. Today, while checking out a customer, she asked another employee what they would do if they had 8 arms and 8 legs. I could tell the customer was very uncomfortable.";
const T6 = "She will also follow customers around the store, constantly bothering them not just about products but about her personal life. Sometimes she will stand behind the makery and talk to them throughout the store.";
/** The model's account, as live: the manager's sentences with the name for the first "she". */
const ACCOUNT: Record<string, string> = {
  [T2]: "Tamsin has unprofessional conversations with guests and staff.",
  [T5]: "Tamsin has unprofessional conversations with guests and staff. Multiple times Tamsin has talked about her boyfriend or ex boyfriend with customers.",
  [T6]: "Tamsin has unprofessional conversations with guests and staff. Multiple times Tamsin has talked about her boyfriend or ex boyfriend with customers. Tamsin will also follow customers around the store, constantly bothering them not just about products but about her personal life.",
};

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";

export const NOV22_AGENT_LOOP_R3_POSSESSIVE_KEEPS_OWNER_CASES: ReplayCase[] = [
  {
    id: "nov22-r3-u23-possessive-keeps-owner-on-card",
    title: "Round 3 U23: T5 \"… talked about her boyfriend …\" and T6 \"… about her personal life\": the card and the reply read \"Tamsin's boyfriend\" and \"Tamsin's personal life\", never \"the\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, TAMSIN]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: { observation?: string | null } } | null;
        if (result) return { text: `Here's the Corrective Action Form for **Tamsin**.\n\n**Observation of Offense:** ${result.card?.observation ?? ""}` };
        const message = said(view);
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa", employee_id: TAMSIN.id, policy: headingWith(view, /standards of conduct/i),
            person_evidence: evidenceFrom(view, "Tamsin Brookfield", view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length - 1),
            ...(ACCOUNT[message] ? { what_happened: ACCOUNT[message] } : {}),
          },
        };
      }));
      const thread = t.thread();
      for (const turn of [T1, T2]) await thread.say(turn);
      const fifth = await thread.say(T5);
      const issue = () => String((thread.proposal as { issue?: string | null } | null)?.issue ?? "");
      expect(issue(), `T5's card lost whose boyfriend:\n${fifth.content}`).toMatch(/Tamsin's boyfriend/);
      expect(fifth.content).not.toMatch(/the boyfriend/);
      const sixth = await thread.say(T6);
      expect(issue(), `T6's card lost whose personal life:\n${sixth.content}`).toMatch(/Tamsin's personal life/);
      expect(issue()).not.toMatch(/the personal life/);
      expect(sixth.content, "the reply lost whose personal life").not.toMatch(/the personal life/);
    },
  },
];
