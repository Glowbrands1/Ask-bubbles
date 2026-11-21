import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * "OPEN <FIRST>S CA" ASKS ABOUT <FIRST>'S FORMS (port of the sibling app's QA shadow re-run S1, 22 Nov 2026; a stuck loop)
 * ============================================================================
 *
 * The sibling app: M1 "open <First>s ca" (a possessive typed with no apostrophe): find_past_forms refused it as "about
 * someone else, not this person, so this person's forms stay closed", find_staff matched <First> <Last>, and
 * find_past_forms got the same refusal again; the manager's "1" went round five more turns. This app already reads a
 * first name's bare-s possessive in the same guard (QA's live re-test item 15, "bring up fennas corrective action"), so
 * the sibling's fix (Ask Sunny #1208) is not ported; these cases hold the sibling's exact shape here. See
 * docs/parity-log/2026-11-22-possessive-no-apostrophe-already-here.md. Invented person: Wenonah Tindall (on no fixture).
 */

const REPORT = "Sibling app's QA shadow re-run (22 Nov 2026), S1: \"open <First>s ca\" refused as someone else's forms, a stuck loop";
const WENONAH: DirectoryRow = { id: "e-wenonah-tindall", firstName: "Wenonah", lastName: "Tindall", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

type Found = { forms?: { instance_id?: string }[]; best_match?: string; reason_code?: string; ask_exactly?: string };

/** Wenonah Tindall's CA on file, made the way the pack makes one. */
async function onFile(t: ReplayContext): Promise<string> {
  vi.setSystemTime(new Date("2026-11-19T15:00:00Z"));
  t.directory([...LOOP_STAFF, WENONAH]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form") ? { text: "Here's the card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: WENONAH.id, what_happened: "Wenonah was late to open on 11/19.", incident_date: "2026-11-19" } })));
  const setup = t.thread();
  await setup.say("ca for wenonah tindall, late to open on 11/19");
  const id = await setup.create();
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  return id;
}

async function lookUp(t: ReplayContext, said: string): Promise<Found> {
  const model = loopStandIn((view): LoopDecision => {
    const found = lastResult(view, "find_past_forms") as Found | null;
    if (!found) return { tool: "find_past_forms", input: { employee_name: "Wenonah Tindall", form: "ca", open: true, forms_on_file_evidence: evidenceFrom(view, said) } };
    return { text: found.ask_exactly ?? "Opening the form." };
  });
  t.loopModel!(model);
  await t.thread().say(said);
  return lastResult(model.views.at(-1)!, "find_past_forms") as Found;
}

const opens = (id: string, title: string, said: string): ReplayCase => ({
  id,
  title,
  report: REPORT,
  status: "fixed",
  async run(t) {
    const form = await onFile(t);
    const found = await lookUp(t, said);
    expect(found.reason_code ?? null, JSON.stringify(found)).not.toBe("privacy_not_this_person");
    expect([found.best_match, ...(found.forms ?? []).map((row) => row.instance_id)], JSON.stringify(found)).toContain(form);
  },
});

export const NOV22_AGENT_LOOP_POSSESSIVE_NO_APOSTROPHE_OPENS_CASES: ReplayCase[] = [
  opens("nov22-s1-open-firsts-ca-not-someone-else", "S1: \"open Wenonahs ca\": find_past_forms for Wenonah Tindall is not refused as someone else's forms; her CA is found", "open Wenonahs ca"),
  {
    id: "nov22-s1-open-other-persons-ca-still-closed",
    title: "Control: \"open Thaddeas ca\" (another roster person's possessive) still keeps Wenonah Tindall's forms closed",
    report: REPORT,
    status: "fixed",
    async run(t) {
      await onFile(t);
      const found = await lookUp(t, "open Thaddeas ca");
      expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
    },
  },
];
