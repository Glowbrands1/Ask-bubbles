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
 * the sibling's fix (its #1208) is not ported; these cases hold the sibling's exact shape here. See
 * docs/parity-log/2026-11-22-possessive-no-apostrophe-already-here.md. Invented person: Wenonah Tindall (on no fixture).
 */

const REPORT = "Sibling app's QA shadow re-run (22 Nov 2026), S1: \"open <First>s ca\" refused as someone else's forms, a stuck loop";
const WENONAH: DirectoryRow = { id: "e-wenonah-tindall", firstName: "Wenonah", lastName: "Tindall", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

type Found = { forms?: { instance_id?: string }[]; best_match?: string; reason_code?: string; ask_exactly?: string };

/** Wenonah Tindall's CA on file, made the way the pack makes one. */
async function onFile(t: ReplayContext, others: readonly DirectoryRow[] = []): Promise<string> {
  vi.setSystemTime(new Date("2026-11-19T15:00:00Z"));
  t.directory([...LOOP_STAFF, WENONAH, ...others]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form") ? { text: "Here's the card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: WENONAH.id, what_happened: "Wenonah was late to open on 11/19.", incident_date: "2026-11-19" } })));
  const setup = t.thread();
  await setup.say("ca for wenonah tindall, late to open on 11/19");
  const id = await setup.create();
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  return id;
}

/** `scripted`: the stand-in plays in a live run too (a control whose condition is its own input). */
async function lookUp(t: ReplayContext, said: string, scripted = false): Promise<Found> {
  const model = loopStandIn((view): LoopDecision => {
    const found = lastResult(view, "find_past_forms") as Found | null;
    if (!found) return { tool: "find_past_forms", input: { employee_name: "Wenonah Tindall", form: "ca", open: true, forms_on_file_evidence: evidenceFrom(view, said) } };
    return { text: found.ask_exactly ?? "Opening the form." };
  });
  t.loopModel!(model, { scripted });
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
      /*
       * CHANGED ON PURPOSE (QA's live regression triage, 22 Nov 2026): the condition is the stand-in's input (find_past_forms
       * for Wenonah Tindall on "open Thaddeas ca"). The real model looks up "Thaddeas" (and is asked "Did you mean Thaddea
       * Kroll?"), so it never sends the call this control guards; the stand-in plays in live runs too.
       */
      const found = await lookUp(t, "open Thaddeas ca", true);
      expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
    },
  },
  /*
   * Board f143 (22 Nov 2026): "show me <last name>s forms", a LAST name's possessive with no apostrophe, was refused in both
   * apps as someone else's forms. A last name only this person holds on the roster names them, as a first name does;
   * its bare-s possessive too, unless the word with the s is itself a roster name.
   */
  opens("nov22-f143-show-lasts-forms-not-someone-else", "f143: \"show me tindalls forms\": find_past_forms for Wenonah Tindall is not refused as someone else's forms; her CA is found", "show me tindalls forms"),
  {
    id: "nov22-f143-other-persons-last-name-still-closed",
    title: "f143 control: \"show me krolls forms\" (another roster person's last name) still keeps Wenonah Tindall's forms closed",
    report: "Board f143 (22 Nov 2026): \"show me <last name>s forms\" refused in both apps",
    status: "fixed",
    async run(t) {
      await onFile(t);
      const found = await lookUp(t, "show me krolls forms");
      expect(found.reason_code, JSON.stringify(found)).toBe("privacy_not_this_person");
    },
  },
  {
    id: "nov22-f143-shared-last-name-not-taken",
    title: "f143 control: two roster people named Tindall: \"show me tindalls forms\" does not open Wenonah Tindall's forms on the last name alone",
    report: "Board f143 (22 Nov 2026): \"show me <last name>s forms\" refused in both apps",
    status: "fixed",
    async run(t) {
      await onFile(t, [{ id: "e-tevrin-tindall", firstName: "Tevrin", lastName: "Tindall", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" }]);
      const found = await lookUp(t, "show me tindalls forms");
      expect(found.forms ?? [], JSON.stringify(found)).toEqual([]);
    },
  },
];
