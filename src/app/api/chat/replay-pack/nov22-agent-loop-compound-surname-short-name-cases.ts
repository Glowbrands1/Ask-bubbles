import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A TWO-WORD SURNAME IS NEVER CUT TO ONE WORD ON THE CARD OR THE SAVED FORM (QA's live round 3, U35, 22 Nov 2026)
 * ============================================================================
 *
 * The tester's chat on production 1c71e11 (Pau's admin login), names invented: the person is "<First> <Surname1> <Surname2>".
 * From T4 "fix her last name <surname2>" on, the card's Observation said "<First> <Surname2> received a customer complaint",
 * and the saved Observation kept it. The short-name pass (`short-name.ts`) only knew the full name, so a first name with
 * part of the surname went through. Now any first name + part of the person's own surname is the person and gets the short
 * name (the first name). Invented people: "Anouk Pellinor Duarte" (two-word surname) and "Tovald Brisbee" (the control).
 * With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

const REPORT = "QA's live round 3 (prod 1c71e11, 22 Nov 2026, U35): for \"Liesl Moreno Vargas\" the card and saved Observation said \"Liesl Vargas received a customer complaint\"";
const ANOUK: DirectoryRow = { id: "e-anouk-pellinor-duarte", firstName: "Anouk", lastName: "Pellinor Duarte", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };
const TOVALD: DirectoryRow = { id: "e-tovald-brisbee", firstName: "Tovald", lastName: "Brisbee", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };

/* Live, the model may write no account at all ("What happened with the customer complaint?"): only the invariants hold then. */
const live = process.env.AGENT_LOOP_LIVE === "1";
const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).length;

/** The stand-in: the model's account names the person by first name + the LAST surname word only, as production's did. */
function caFor(row: DirectoryRow, account: string) {
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { what_happened?: string } } | null;
    if (result) return { text: `Here's the Corrective Action Form for **${row.firstName} ${row.lastName}**.\n**Observation of Offense:** ${account}` };
    const turn = users(view);
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: row.id, what_happened: account, warning_level: "verbal", payroll_deduct: "no",
        person_evidence: evidenceFrom(view, `${row.firstName} ${row.lastName}`, turn - 2), payroll_evidence: evidenceFrom(view, "no payroll deduct", turn - 3),
      },
    };
  });
}

async function chat(t: ReplayContext, row: DirectoryRow, account: string, fix: string) {
  vi.setSystemTime(new Date("2026-11-22T16:00:00Z"));
  t.directory([...LOOP_STAFF, ANOUK, TOVALD]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  t.loopModel!(caFor(row, account));
  const thread = t.thread();
  await thread.say(`i have an employee, ${row.firstName} ${row.lastName} that needs a corrective action form with a customer complaint`);
  await thread.say("verbal warning, no payroll deduct, part-time team member,");
  const reply = await thread.say(fix);
  if (live && thread.proposal?.templateKey !== "dpoa") return { reply, issue: "", saved: "" };
  expect(thread.proposal?.templateKey, `no card (the case proves nothing):\n${reply.content}`).toBe("dpoa");
  const card = thread.proposal as { issue?: string };
  const id = await thread.create();
  return { reply, issue: card.issue ?? "", saved: JSON.stringify(t.values(id)) };
}

export const NOV22_AGENT_LOOP_COMPOUND_SURNAME_SHORT_NAME_CASES: ReplayCase[] = [
  {
    id: "nov22-u35-compound-surname-never-cut",
    title: "U35: \"fix her last name duarte\" for Anouk Pellinor Duarte, the model writing \"Anouk Duarte received a customer complaint\": the card, the reply and the saved form say \"Anouk\", never \"Anouk Duarte\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { reply, issue, saved } = await chat(t, ANOUK, "Anouk Duarte received a customer complaint.", "fix her last name duarte");
      expect(issue, issue).not.toMatch(/Anouk\s+(?:Duarte|Pellinor)/i);
      if (!live) expect(issue).toBe("Anouk received a customer complaint.");
      expect(reply.content.replace(/\*\*Anouk Pellinor Duarte\*\*/g, ""), reply.content).not.toMatch(/Anouk\s+(?:Duarte|Pellinor)/i);
      expect(saved, saved).not.toMatch(/Anouk\s+(?:Duarte|Pellinor)(?!\s+Duarte)/i);
    },
  },
  {
    id: "nov22-u35-single-surname-control",
    title: "U35 control: Tovald Brisbee (one-word surname), the model writing \"Tovald Brisbee received a customer complaint\": the card says \"Tovald\", as before",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { issue } = await chat(t, TOVALD, "Tovald Brisbee received a customer complaint.", "fix his last name brisbee");
      expect(issue, issue).not.toMatch(/Tovald\s+Brisbee/i);
      if (!live) expect(issue).toBe("Tovald received a customer complaint.");
    },
  },
];
