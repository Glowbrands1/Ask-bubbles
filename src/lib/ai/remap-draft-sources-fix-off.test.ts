import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftNotesFromConversation } from "@/lib/forms/draft-notes";
import type { ChatFormProposal } from "@/types";

import { withRemapDraftSources } from "./remap-draft-sources";
import type { AskResponse } from "./types";

/**
 * ============================================================================
 * REMAP_DRAFT_SOURCES_ENABLED ON, REMAP_INCIDENT_FIX_ENABLED OFF == MAIN
 * ============================================================================
 *
 * `withRemapDraftSources` (main, QA H1) picks a remap card's draft turns with
 * `currentRequestStart`, whatever REMAP_INCIDENT_FIX_ENABLED says. This
 * branch's reader changes ("coaching document" is a request; prior steps,
 * who/where-only clauses and payroll reasons are not the incident) are all
 * behind REMAP_INCIDENT_FIX_ENABLED, so with that flag off the turns are
 * main's, case for case (QA-3, 26 Oct 2026: before the gate, 6 turn lists
 * read [0,0,0,0,1,1] against main's [0,1,0,1,1,0]).
 *
 * The expectations below were measured against main (dafa3d9's
 * `remap-incident.ts`) with the real `slotClause`, in every register.
 *
 * With the fix on, the turns change on purpose, pinned in the second block:
 *   - a follow-up that only places the employee, or adds a coaching they
 *     already had, keeps the incident turn (main read "kearney" or "being
 *     late" as a new incident and dropped it);
 *   - "create a coaching document for … regarding <new incident>" is a new
 *     form (main did not read "coaching document" as a request);
 *   - QA-3's example stays a new form: "…at kearney, she skipped the
 *     disinfect" tells its own incident in a sentence about her.
 *
 * Corvin Mallow is invented; Test Employee is QA's placeholder.
 */

type Register = readonly [label: string, type: (text: string) => string];

const NAMES = ["Corvin Mallow", "Test Employee"];

function sentenceCase(text: string, capitalizeName: boolean): string {
  let out = text.toLowerCase();
  if (capitalizeName) for (const name of NAMES) out = out.replace(new RegExp(`\\b${name.toLowerCase()}\\b`, "g"), name);
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

const REGISTERS: readonly Register[] = [
  ["all lowercase", (text) => text.toLowerCase()],
  ["sentence case, name lowercase", (text) => sentenceCase(text, false)],
  ["sentence case, name Capitalized", (text) => sentenceCase(text, true)],
];

const COACHING_1 = "create a coaching document for Corvin Mallow regarding on 10-16-26 Corvin did not complete her closing checklist";
const COACHING_2 = "create a coaching document for Corvin Mallow";
const COACHING_NEW = "create a coaching document for Corvin Mallow regarding on 10-18-26 Corvin left the register open";
const CA_1 = "create a verbal ca for Corvin Mallow at kearney. on 10-16-26 Corvin was not properly weighing product. payroll deduct is not applicable";
const CA_PRIOR = "create a written ca for Corvin Mallow. previous coaching jba manual 1-1-26";
const CA_PLACE = "create a ca for Corvin Mallow at kearney";
const CA_COACHED = "create a ca for Corvin Mallow, she was coached on 9-15 for being late";
const CA_NEW = "create a ca form for Corvin Mallow for a register shortage on 10-20-26";
const CA_PAYROLL = "create a ca for Corvin Mallow. payroll deduct will be applied for late open on 10-21-26";
// QA-3's probe, 26 Oct 2026, word for word.
const QA3_FIRST = "create a CA for Test Employee, she opened late";
const QA3_SECOND = "create a CA form for Test Employee at kearney, she skipped the disinfect";
const CA_LATE = "create a ca for Corvin Mallow, she opened late";

function card(templateKey: string, name: string): ChatFormProposal {
  return {
    proposalId: "card-1",
    templateKey,
    templateName: templateKey === "coaching" ? "Coaching Form" : "Corrective Action Form",
    supportsInlineDraft: true,
    variantKey: null,
    employeeName: name,
    employeeRole: null,
    formDate: "2026-10-16",
    payrollDeduct: null,
    warningLevel: null,
    issue: null,
    priorActions: null,
    locationId: "loc-1",
    locationName: "Kearney, NE",
    locationResolution: "resolved",
    authorizedLocationIds: ["loc-1"],
    status: "ready",
    sourceMessageIds: [],
  } as unknown as ChatFormProposal;
}

/** The second manager turn is being answered; the remap card names no turns, as main's remap builds it. */
function sources(templateKey: string, first: string, second: string, name: string) {
  const messages = [
    { id: "msg_turn_1", role: "user" as const, content: first },
    { id: "msg_card_1", role: "assistant" as const, content: "Here is the form." },
    { id: "msg_turn_2", role: "user" as const, content: second },
  ];
  const response = { content: "Here is the form.", citations: [], formProposal: card(templateKey, name) } as unknown as AskResponse;
  const ids = withRemapDraftSources(response, {
    history: messages.slice(0, 2),
    question: second,
    questionMessageId: "msg_turn_2",
  }).formProposal!.sourceMessageIds;
  return { ids, notes: draftNotesFromConversation(messages, ids).text };
}

const BOTH = ["msg_turn_1", "msg_turn_2"];
const NEWEST = ["msg_turn_2"];

/** [case, template, first turn, second turn, employee, turns with the fix off (= main), turns with the fix on]. */
const CASES: readonly (readonly [string, string, string, string, string, string[], string[]])[] = [
  ["QA-3: a later CA with its own incident, placed", "dpoa", QA3_FIRST, QA3_SECOND, "Test Employee", NEWEST, NEWEST],
  ["a bare repeat coaching-document request", "coaching", COACHING_1, COACHING_2, "Corvin Mallow", BOTH, BOTH],
  ["a follow-up that adds only a prior step", "dpoa", CA_1, CA_PRIOR, "Corvin Mallow", BOTH, BOTH],
  ["a follow-up that only places the employee", "dpoa", CA_1, CA_PLACE, "Corvin Mallow", NEWEST, BOTH],
  ["a follow-up that adds a coaching they had", "dpoa", CA_1, CA_COACHED, "Corvin Mallow", NEWEST, BOTH],
  ["a new coaching-document request with its own incident", "coaching", COACHING_1, COACHING_NEW, "Corvin Mallow", BOTH, NEWEST],
  ["a later CA request with its own incident", "dpoa", CA_1, CA_NEW, "Corvin Mallow", NEWEST, NEWEST],
  ["a later CA that gives the payroll reason", "dpoa", CA_LATE, CA_PAYROLL, "Corvin Mallow", BOTH, NEWEST],
];

const GRID = CASES.flatMap(([label, ...rest]) =>
  REGISTERS.map(([register, type]) => [`${register}: ${label}`, type, ...rest] as const),
);

describe("REMAP_DRAFT_SOURCES_ENABLED on, REMAP_INCIDENT_FIX_ENABLED off: the turns are main's", () => {
  beforeEach(() => {
    vi.stubEnv("REMAP_DRAFT_SOURCES_ENABLED", "true");
    vi.stubEnv("REMAP_INCIDENT_FIX_ENABLED", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(GRID)("%s", (_label, type, templateKey, first, second, name, offIds) => {
    for (const employee of [name, name.toLowerCase()]) {
      expect(sources(templateKey, type(first), type(second), employee).ids).toEqual(offIds);
    }
  });
});

describe("REMAP_DRAFT_SOURCES_ENABLED on, REMAP_INCIDENT_FIX_ENABLED on: the turns this branch changes", () => {
  beforeEach(() => {
    vi.stubEnv("REMAP_DRAFT_SOURCES_ENABLED", "true");
    vi.stubEnv("REMAP_INCIDENT_FIX_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(GRID)("%s", (_label, type, templateKey, first, second, name, _offIds, onIds) => {
    for (const employee of [name, name.toLowerCase()]) {
      expect(sources(templateKey, type(first), type(second), employee).ids).toEqual(onIds);
    }
  });

  it.each(REGISTERS)("%s: QA-3, the draft carries the newer incident only", (_label, type) => {
    const { notes } = sources("dpoa", type(QA3_FIRST), type(QA3_SECOND), "Test Employee");
    expect(notes.toLowerCase()).toContain("skipped the disinfect");
    expect(notes.toLowerCase()).not.toContain("opened late");
  });

  it.each(REGISTERS)("%s: a follow-up that only places the employee keeps the incident in the draft", (_label, type) => {
    const { notes } = sources("dpoa", type(CA_1), type(CA_PLACE), "Corvin Mallow");
    expect(notes.toLowerCase()).toContain("was not properly weighing product");
  });
});
