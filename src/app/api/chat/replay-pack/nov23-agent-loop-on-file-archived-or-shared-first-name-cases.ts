import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AN ARCHIVED FORM, OR ONE UNDER A SHARED FIRST NAME ALONE, IS NOT ON FILE (QA, 23 Nov 2026)
 * ============================================================================
 *
 * The sibling app's live chat behind Pau's review: two ARCHIVED Written CAs dated 09/10, filed under the person's first
 * name alone, were read as the person's forms on file and put on a new card. Here #1089 offers forms on file instead of
 * adding them, so those forms would be OFFERED. An archived form is never on file. A form under the first name alone is
 * the person's (Pau: "its right"), unless another person with that first name is at the form's store (Pau: "there might
 * be other Paulynes in store, or Kim or Mary"). Invented people (Briony Kask; other Brionys).
 */

const REPORT = "QA (23 Nov 2026; the sibling app's live chat): archived forms filed under the first name alone were read as the person's forms on file";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const OTHER_BRIONY: DirectoryRow = { id: "e-briony-ostrander", firstName: "Briony", lastName: "Ostrander", preferredFirstName: null, employmentStatus: "active", locationIds: [WEST_DODGE.primaryAreaId!], positionName: "Team Member Part Time" };
/** Another Briony at a different store (not the form's). */
const BRIONY_ELSEWHERE: DirectoryRow = { ...OTHER_BRIONY, id: "e-briony-elsewhere", lastName: "Tallis", locationIds: ["loc-67"] };
const T1 = "create a written CA for Briony Kask. On 11-1-26 Briony violated care and cleaning of facilities policy";
const ACCOUNT = "On 11/1/26 Briony violated the care and cleaning of facilities policy.";
const OFFER = /has a Written CA on file from 09\/10\/2026\. Want me to add it to Prior actions\?/;

function start(t: ReplayContext, onFile: { name: string; archived: boolean }, roster: DirectoryRow[] = [BRIONY]): void {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, ...roster]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  (t.forms() as Record<string, unknown>[]).push({
    id: "ca-briony-0910", ...t.templateIds!("dpoa"), variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "chat", status: "finalized", follow_up_date: null,
    archived_at: onFile.archived ? "2026-09-14T20:58:00Z" : null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: onFile.name, form_date: "2026-09-10",
    created_at: "2026-09-10T23:28:00Z", updated_at: "2026-09-10T23:28:00Z",
  });
  t.checkOnForm!("ca-briony-0910", { warning_type: ["written"] });
}

const managerSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && !turn.text.includes("[app check]")).at(-1)?.text ?? "";

/** The card from T1; the reply ends with any offer. */
const model = () => loopStandIn((view): LoopDecision => {
  const result = lastResult(view, "propose_form") as { facts?: { prior_on_file?: { ask_exactly?: string } } } | null;
  if (result) return { text: ["Here's the Corrective Action Form for **Briony Kask**.", ...(result.facts?.prior_on_file?.ask_exactly ? [result.facts.prior_on_file.ask_exactly] : [])].join("\n\n") };
  return {
    tool: "propose_form",
    input: {
      template_key: "dpoa", employee_id: BRIONY.id, person_evidence: evidenceFrom(view, "Briony Kask", managerSaid(view).startsWith(T1) ? 0 : 1),
      warning_level: "written", level_evidence: evidenceFrom(view, "written"),
      what_happened: ACCOUNT, incident_date: "2026-11-01", policy: headingWith(view, /care and cleaning/i),
    },
  };
});

const offerCase = (id: string, title: string, onFile: { name: string; archived: boolean }, roster: DirectoryRow[] | undefined, offered: boolean): ReplayCase => ({
  id, title, report: REPORT, status: "fixed",
  async run(t) {
    start(t, onFile, roster);
    t.loopModel!(model());
    const thread = t.thread();
    const reply = await thread.say(T1);
    // CHANGED ON PURPOSE (Pau, 26 Nov 2026: "Ai saw prior forms but i need them here"; PRIOR_ON_FILE_ON_CARD_ENABLED, port from Ask Sunny): forms on file are put on the card's Prior actions by the app, each saying what it is, and never offered. "offered" now reads "on the card".
    const held = (thread.proposal as { priorActions?: string | null } | null)?.priorActions ?? "";
    if (offered) expect(held, reply.content).toMatch(/09\/10\/2026/);
    else expect(held, `a form that is not on file is on the card:\n${reply.content}`).not.toMatch(/09\/10\/2026/);
  },
});

export const NOV23_AGENT_LOOP_ON_FILE_ARCHIVED_OR_SHARED_FIRST_NAME_CASES: ReplayCase[] = [
  // REMOVED ON PURPOSE (Pau, 23 Nov 2026, archiving removed): the two cases here for an ARCHIVED form under the first name and
  // under the full name asserted that an archived form is never on file. A form is only Draft or Finalized now, so there is no
  // archived form to leave out; the shared-first-name cases below still hold.
  offerCase("nov23-on-file-shared-first-name-at-store-not-attributed", "Pau (23 Nov 2026): an active finalized Written CA under \"Briony\" alone while another Briony is at the form's store: attributed to neither, never offered", { name: "Briony", archived: false }, [BRIONY, OTHER_BRIONY], false),
  offerCase("nov23-on-file-first-name-other-store-still-counts", "Pau (23 Nov 2026): another Briony at a DIFFERENT store does not matter: the form under \"Briony\" is offered", { name: "Briony", archived: false }, [BRIONY, BRIONY_ELSEWHERE], true),
  offerCase("nov23-on-file-control-unique-first-name-offered", "Pau (23 Nov 2026), control: an active finalized Written CA under \"Briony\" alone, no other Briony at the store: offered", { name: "Briony", archived: false }, undefined, true),
  offerCase("nov23-on-file-control-full-name-offered", "Control: an active finalized Written CA under the full name: offered", { name: "Briony Kask", archived: false }, undefined, true),
];
