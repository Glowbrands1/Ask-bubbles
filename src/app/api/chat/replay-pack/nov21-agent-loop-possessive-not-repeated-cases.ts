import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE REPLY AND THE CARD WRITE THE PERSON'S POSSESSIVE AS THE SAVED WRITE-UP DOES (port from the sibling app: QA2's live R3, 21 Nov 2026)
 * ============================================================================
 *
 * The manager typed "…came into the store to show her team her new puppy". The saved Observation read "… to show the team
 * the new puppy", but the reply and the card's issue text read "to show <P>'s team <P>'s new puppy". Both now read "to show
 * the team the new puppy" (one rule in `reply-pronouns.ts`, the sibling's, which replaced this app's earlier extension).
 * Second case, the sibling's f059 wording: "Her shift lead, <L>, told her to go home and she refused" opens "The shift
 * lead", not a third mention of the name. QA2's wording; invented people (`loop-roster.ts`; Corwin Ashdale is the lead,
 * nobody on the roster).
 */

const REPORT = "The sibling app's QA2, live R3 (21 Nov 2026), ported: the reply and the card repeated \"<P>'s team <P>'s new puppy\"";
const SAID = "coaching for Thaddea Kroll, she came into the store to show her team her new puppy";
const ACCOUNT = "Thaddea came into the store to show her team her new puppy.";
const SAID_TOLD = "coaching for Thaddea Kroll. Her shift lead, Corwin Ashdale, told her to go home and she refused";
const ACCOUNT_TOLD = "Her shift lead, Corwin Ashdale, told her to go home and she refused.";

async function coachingCard(t: ReplayContext, said: string, account: string, topic: string) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
    ? { text: `Here's the Coaching Form for **Thaddea**. What happened: ${account}` }
    : {
        tool: "propose_form",
        input: {
          template_key: "coaching",
          employee_name: "Thaddea Kroll",
          person_evidence: evidenceFrom(view, "Thaddea Kroll"),
          what_happened: account,
          topic,
          topic_evidence: evidenceFrom(view, topic),
          incident_date: "2026-11-21",
        },
      }));
  const thread = t.thread();
  const reply = await thread.say(said);
  const issue = String((thread.proposal as { issue?: string } | null | undefined)?.issue ?? "");
  return { reply: String(reply.content ?? ""), issue };
}

export const NOV21_AGENT_LOOP_POSSESSIVE_NOT_REPEATED_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-possessive-not-repeated-reply-and-card",
    title: `QA2's R3: "${SAID}": the reply and the card's issue read "to show the team the new puppy", never "Thaddea's team Thaddea's new puppy"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, issue } = await coachingCard(t, SAID, ACCOUNT, "new puppy");
      expect(issue, "the card has no issue (the case proves nothing)").toMatch(/new puppy/);
      for (const [where, text] of [["reply", reply], ["card issue", issue]] as const) {
        expect(text, `${where} repeats the possessive:\n${text}`).not.toMatch(/Thaddea's team Thaddea's/);
        expect(text, `${where} keeps a pronoun:\n${text}`).not.toMatch(/\bher\b/);
        expect(text, `${where}:\n${text}`).toMatch(/to show the team the new puppy/);
      }
    },
  },
  {
    id: "nov21-agent-loop-told-listener-opening-possessive-plain",
    title: `QA2's R3 (the sibling's f059 case): "${SAID_TOLD}": the reply and the card read "The shift lead, Corwin Ashdale, told Thaddea to go home and Thaddea refused", never "Thaddea's shift lead … told Thaddea … Thaddea refused"`,
    report: "The sibling app's QA2, live R3 (21 Nov 2026), ported: \"Her shift lead told her to go home and she refused\" read \"<P>'s shift lead, <L>, told <P> to go home and <P> refused\"",
    status: "fixed",
    async run(t) {
      const { reply, issue } = await coachingCard(t, SAID_TOLD, ACCOUNT_TOLD, "go home");
      expect(issue, "the card has no issue (the case proves nothing)").toMatch(/go home/);
      for (const [where, text] of [["reply", reply], ["card issue", issue]] as const) {
        expect(text, `${where} keeps a pronoun:\n${text}`).not.toMatch(/\b(?:her|she)\b/i);
        expect(text, `${where}:\n${text}`).toMatch(/The shift lead, Corwin Ashdale, told Thaddea to go home and Thaddea refused/);
      }
    },
  },
];
