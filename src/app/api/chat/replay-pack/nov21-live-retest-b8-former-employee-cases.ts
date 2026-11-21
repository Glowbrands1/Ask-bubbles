import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * QA'S LIVE RE-TEST B8 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): AN EXIT FOR A FORMER EMPLOYEE
 * ============================================================================
 *
 * "The reply says the person \"isn't on the Woven staff list\" and in the same reply \"Woven shows <A> as no longer
 * active\" — contradictory." And "the job title typed \"assistant store manager\" was saved as \"Assistant General Manager
 * (from your words)\"". Invented people: <A> is a former employee, inactive in Woven at the pack's store. The stand-in
 * says what the live model said, both lines; everything else is the app's own code.
 */
const CORISANDE: DirectoryRow = { id: "e-corisande-velt", firstName: "Corisande", lastName: "Velt", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-264"], positionName: "Assistant General Manager" };

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd), B8";
const SAID = "exit form for Corisande Velt, assistant store manager, last day worked 11/14, she quit with no notice";
const T2 = "her job title is assistant store manager";
/** The live reply's two lines about the person, word for word as the rules book teaches each. */
const LIVE_REPLY = (title: string) =>
  `Here's the Resignation/Exit Form for **Corisande Velt**. **Corisande Velt** isn't on your store's Woven staff list, so I've used the name as you typed it. Check it before you press Create. **Corisande Velt** shows as no longer active in Woven; I've used the name as you typed it.\n\n**Job title:** ${title} (from your words)`;

/** The form Create made, once the manager pressed it (the second turn edits it). */
let created: string | null = null;

function model(view: LoopView): LoopDecision {
  const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
  if (said === T2 && created) {
    // The live model copied the reply's read-back line, note and all, into the saved form's field.
    if (lastResult(view, "edit_form")) return { text: "**Job title:** Assistant General Manager (from your words)" };
    return { tool: "edit_form", input: { instance_id: created, values: { job_title: "Assistant General Manager (from your words)" } } };
  }
  const card = lastResult(view, "propose_form") as { card?: { job_title?: string } } | null;
  if (card) return { text: LIVE_REPLY(card.card?.job_title ?? "") };
  return {
    tool: "propose_form",
    input: {
      template_key: "resignation-exit", employee_name: "Corisande Velt",
      exit_evidence: { ...evidenceFrom(view, "exit form for Corisande Velt"), kind: "asks_for_exit_form" },
      person_evidence: evidenceFrom(view, "exit form for Corisande Velt"),
      what_happened: "Corisande quit with no notice, last day worked 11/14.",
    },
  };
}

async function say(t: Parameters<ReplayCase["run"]>[0]) {
  created = null;
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, CORISANDE]);
  t.as("location_manager", WEST_DODGE);
  const standIn = loopStandIn(model);
  t.loopModel!(standIn);
  const thread = t.thread();
  const reply = await thread.say(SAID);
  return { thread, reply, standIn };
}

export const NOV21_LIVE_RETEST_B8_FORMER_EMPLOYEE_CASES: ReplayCase[] = [
  {
    id: "nov21-live-retest-b8-former-employee-one-statement",
    title: "B8 (item 23): an exit for a former employee says once that Woven shows her as no longer active, never also that she isn't on the staff list",
    report: `${REPORT}: "The reply says the person \\"isn't on the Woven staff list\\" and in the same reply \\"Woven shows <A> as no longer active\\" — contradictory."`,
    status: "fixed",
    async run(t) {
      const { reply, thread } = await say(t);
      expect(thread.proposal?.employeeName ?? null, `no card for the former employee:\n${reply.content}`).toBe("Corisande Velt");
      expect(reply.content, `the reply lost the inactive line:\n${reply.content}`).toMatch(/no longer active in Woven/);
      expect(reply.content, `the reply contradicts itself:\n${reply.content}`).not.toMatch(/isn['’]t on (?:your [^.\n]*['’]s |the )Woven staff list/);
    },
  },
  {
    id: "nov21-live-retest-b8-title-from-words-saved-plain",
    title: "B8 (item 23): \"assistant store manager\" is saved as \"Assistant General Manager\", never with \"(from your words)\"",
    report: `${REPORT}: "the job title typed \\"assistant store manager\\" was saved as \\"Assistant General Manager (from your words)\\""`,
    status: "fixed",
    /*
     * The card's own title is code-built and clean, and edit_form never writes the Job Title, so this case holds on the
     * paths the pack drives; Create's own guard (`forms/read-back-note.ts`) is proven failing-first in
     * src/app/api/forms/create-title-read-back-note.test.ts. Here: a model copying the read-back line into a field never saves it.
     */
    async run(t) {
      const { thread } = await say(t);
      const id = await thread.create();
      created = id;
      expect(t.values(id).job_title ?? "", `the job title Create saved: ${JSON.stringify(t.values(id))}`).toBe("Assistant General Manager");
      await thread.say(T2);
      expect(t.values(id).job_title ?? "", `the saved job title: ${JSON.stringify(t.values(id))}`).toBe("Assistant General Manager");
    },
  },
];
