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
 * adding them, so those forms would be OFFERED. An archived form is never on file, and a form under one word only is the
 * person's only when that word is unique on the roster and is this person. Invented people (Briony Kask; another Briony).
 */

const REPORT = "QA (23 Nov 2026; the sibling app's live chat): archived forms filed under the first name alone were read as the person's forms on file";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const OTHER_BRIONY: DirectoryRow = { id: "e-briony-ostrander", firstName: "Briony", lastName: "Ostrander", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
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
    const reply = await t.thread().say(T1);
    if (offered) expect(reply.content, reply.content).toMatch(OFFER);
    else expect(reply.content, `a form that is not on file was offered:\n${reply.content}`).not.toMatch(/on file from 09\/10\/2026/);
  },
});

export const NOV23_AGENT_LOOP_ON_FILE_ARCHIVED_OR_SHARED_FIRST_NAME_CASES: ReplayCase[] = [
  offerCase("nov23-on-file-archived-first-name-not-offered", "As live in the sibling app: an ARCHIVED finalized Written CA (09/10) under the first name alone (\"Briony\"): never offered", { name: "Briony", archived: true }, undefined, false),
  offerCase("nov23-on-file-archived-full-name-not-offered", "An ARCHIVED finalized Written CA (09/10) under the full name: not on file, never offered", { name: "Briony Kask", archived: true }, undefined, false),
  offerCase("nov23-on-file-shared-first-name-not-offered", "An active finalized Written CA under \"Briony\" alone while two Brionys are on the roster: not this person's, never offered", { name: "Briony", archived: false }, [BRIONY, OTHER_BRIONY], false),
  offerCase("nov23-on-file-control-unique-first-name-offered", "Control: an active finalized Written CA under \"Briony\" alone, and Briony is unique on the roster: offered", { name: "Briony", archived: false }, undefined, true),
  offerCase("nov23-on-file-control-full-name-offered", "Control: an active finalized Written CA under the full name: offered", { name: "Briony Kask", archived: false }, undefined, true),
];
