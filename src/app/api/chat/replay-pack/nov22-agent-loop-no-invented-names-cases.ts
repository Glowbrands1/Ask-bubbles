import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE REPLY NAMES ONLY NAMES THE DIRECTORY HOLDS (QA's live round-2 re-run on production f9461c1, 22 Nov 2026, U23)
 * ============================================================================
 *
 * Pau's account (admin, every store). The manager typed the person's preferred name; the reply said "**<preferred>
 * <last>** (Marguerite — legal name in Woven: …)" and later "Margo note: …": neither is the person's legal or preferred
 * name. Both come from the rules book's own example for legal_name_in_woven ("**Margo Vale** (Marguerite Vale in …)"),
 * which the model copied. propose_form now writes the line itself from the directory (say_exactly), and no example in the
 * rules book or a tool description names a person. Invented person: legal Ellory Quarrender, preferred "Elle".
 * With AGENT_LOOP_LIVE=1 the real model answers in place of the stand-in, and the same assertions hold.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U23, serious): the reply invented names (\"Marguerite — legal name in Woven\", \"Margo note\")";
const ELLORY: DirectoryRow = { id: "e-ellory-quarrender", firstName: "Ellory", lastName: "Quarrender", preferredFirstName: "Elle", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID = "ca for Elle Quarrender at west dodge, she was 20 minutes late on 11/20";
/** Every name the directory holds for this person; the reply may use these and no other. */
const OWN = /^(?:Elle|Ellory)(?: Quarrender)?$|^Quarrender$/;
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

type Legal = { name?: string; say_exactly?: string } | string | undefined;

export const NOV22_AGENT_LOOP_NO_INVENTED_NAMES_CASES: ReplayCase[] = [
  {
    id: "nov22-u23-reply-names-only-directory-names",
    title: `U23: "${SAID}" (the preferred name; Woven's legal name is Ellory), as an admin: the card is Elle Quarrender's, the reply says the legal name once as the directory holds it, and names nobody else (never "Margo", "Marguerite")`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:40:00Z"));
      t.directory([...LOOP_STAFF, ELLORY]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; facts?: { legal_name_in_woven?: Legal } } | null;
        if (!result) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Elle Quarrender", person_evidence: evidenceFrom(view, "Elle Quarrender"), what_happened: "Elle was 20 minutes late on 11/20.", incident_date: "2026-11-20", policy: "Attendance" } };
        /* The rules book: say legal_name_in_woven's say_exactly once, word for word. */
        const legal = result.facts?.legal_name_in_woven;
        return { text: `Here's the Corrective Action Form for ${typeof legal === "object" && legal?.say_exactly ? legal.say_exactly : "**Elle Quarrender**"}.` };
      }));
      const reply = await t.thread().say(SAID);
      expect(reply.formProposal?.employeeName, reply.content).toBe("Elle Quarrender");
      expect(reply.content, `the reply invented a name:\n${reply.content}`).not.toMatch(/Margo|Marguerite|Vale\b/);
      const bold = [...reply.content.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!.trim()).filter((text) => /^\p{Lu}\p{Ll}+(?: \p{Lu}\p{Ll}+)?$/u.test(text) && /Elle|Ellory|Quarrender/.test(text));
      for (const name of bold) expect(name, `a bolded name the directory does not hold:\n${reply.content}`).toMatch(OWN);
      expect(reply.content, `the Woven legal name is not said as the directory holds it:\n${reply.content}`).toMatch(/Ellory Quarrender/);
    },
  },
];
