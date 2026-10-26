import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draftNotesFromConversation } from "@/lib/forms/draft-notes";
import type { ChatFormProposal } from "@/types";

import { withRemapDraftSources } from "./remap-draft-sources";
import type { AskResponse } from "./types";

/**
 * ============================================================================
 * REMAP_DRAFT_SOURCES_ENABLED ON, REMAP_INCIDENT_FIX_ENABLED OFF
 * ============================================================================
 *
 * `withRemapDraftSources` (main, QA H1) picks a remap card's draft turns with
 * `currentRequestStart`. That function does not read REMAP_INCIDENT_FIX_ENABLED.
 * It counts the create requests, and a later request "with its own incident"
 * (`turnIncident`) starts a new form. This branch changes two things that
 * function uses, whatever the incident-fix flag says:
 *
 *   - FORM_WORDS also names "coaching document/doc/paperwork", so
 *     "create a coaching document for …" counts as a request (H7).
 *   - `turnIncident` skips prior steps ("previous coaching jba manual
 *     1-1-26") and clauses that only name or place the employee.
 *
 * Pinned here with the draft-sources flag on and the incident fix off, in
 * the manager's words typed all lowercase or in sentence case. In no case
 * does this branch drop the manager's incident turn; a later request that
 * states its own incident starts a new form, which is main's own rule.
 * Measured against main (dafa3d9) on 26 Oct 2026:
 *
 *   A. Same as main. A bare repeat request ("create a coaching document for
 *      Corvin Mallow") has no incident: both turns are sources, and the notes
 *      carry turn 1's incident. A follow-up that adds only a prior step
 *      ("… previous coaching jba manual 1-1-26") is the same.
 *   B. Better than main. A follow-up request that only places the employee
 *      ("create a ca for corvin mallow at kearney") or adds a coaching they
 *      already had ("…, she was coached on 9-15 for being late"). On main,
 *      `turnIncident` read "at kearney" or "being late" as a new incident,
 *      started the form at turn 2 and left turn 1's incident out of the
 *      draft. Here both turns are sources.
 *   C. Changed from main, by main's own rule. "create a coaching document for
 *      … regarding on 10-18-26 corvin left the register open" is a new
 *      request with its own incident, so only that turn is a source. On main
 *      "coaching document" was not a request, so both incidents went into one
 *      draft.
 *   D. Same as main. "… for a register shortage on 10-20-26" is a new form.
 *      Only that turn is a source.
 *
 * The name is invented.
 */

type Register = readonly [label: string, type: (text: string) => string];

const NAME = "corvin mallow";

function sentenceCase(text: string, capitalizeName: boolean): string {
  let out = text.toLowerCase();
  if (capitalizeName) out = out.replace(new RegExp(`\\b${NAME}\\b`, "g"), "Corvin Mallow");
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

beforeEach(() => {
  vi.stubEnv("REMAP_DRAFT_SOURCES_ENABLED", "true");
  vi.stubEnv("REMAP_INCIDENT_FIX_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("REMAP_DRAFT_SOURCES_ENABLED on, REMAP_INCIDENT_FIX_ENABLED off: which turns the draft is written from", () => {
  it.each(REGISTERS)("%s: A, a bare repeat request keeps the incident turn (as main)", (_label, type) => {
    const { ids, notes } = sources("coaching", type(COACHING_1), type(COACHING_2), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_1", "msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("did not complete her closing checklist");
  });

  it.each(REGISTERS)("%s: A, a follow-up that adds only a prior step keeps the incident turn (as main)", (_label, type) => {
    const { ids, notes } = sources("dpoa", type(CA_1), type(CA_PRIOR), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_1", "msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("was not properly weighing product");
    expect(notes.toLowerCase()).toContain("previous coaching jba manual 1-1-26");
  });

  it.each(REGISTERS)("%s: B, a follow-up that only places the employee keeps the incident turn (main dropped it)", (_label, type) => {
    const { ids, notes } = sources("dpoa", type(CA_1), type(CA_PLACE), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_1", "msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("was not properly weighing product");
  });

  it.each(REGISTERS)("%s: B, a follow-up that adds a coaching they had keeps the incident turn (main dropped it)", (_label, type) => {
    const { ids, notes } = sources("dpoa", type(CA_1), type(CA_COACHED), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_1", "msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("was not properly weighing product");
    expect(notes.toLowerCase()).toContain("coached on 9-15 for being late");
  });

  it.each(REGISTERS)("%s: C, a new coaching-document request with its own incident is a new form", (_label, type) => {
    const { ids, notes } = sources("coaching", type(COACHING_1), type(COACHING_NEW), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("left the register open");
    expect(notes.toLowerCase()).not.toContain("closing checklist");
  });

  it.each(REGISTERS)("%s: D, a later CA request with its own incident is a new form (as main)", (_label, type) => {
    const { ids, notes } = sources("dpoa", type(CA_1), type(CA_NEW), type("Corvin Mallow"));
    expect(ids).toEqual(["msg_turn_2"]);
    expect(notes.toLowerCase()).toContain("register shortage");
    expect(notes.toLowerCase()).not.toContain("weighing product");
  });
});
