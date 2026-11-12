import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { splitAppCitationLine } from "./app-citation-line";
import { planRevision, type CurrentValue } from "./revision";

/*
 * Ported from the sibling app (its production-flags read and bisect, 5 Nov 2026): a chat edit on a Coaching draft whose
 * Details end in the app's own citation line was refused, because keepsSubstance missed the line's page numbers in the
 * revision. In this app the line is written by EDIT_POLICY_ASK_ENABLED ("please list the policy"). The person is invented.
 */
const FIELDS = [{ key: "coaching_details", label: "Details of Coaching" }];
const current = (value: string): ReadonlyMap<string, CurrentValue> => new Map([["coaching_details", { value, checked: [], filledBy: "ai" }]]);
const plan = (question: string, before: string, after: string) =>
  planRevision({ question, fields: FIELDS, current: current(before), proposed: { values: { coaching_details: after } } });

const TYPO = "Observed:\nOttoline Ormsworht was late to open the store today.\n\nExpectation:\nOttoline is expected to arrive on time and be ready to open.";
const FIXED = TYPO.replace("Ormsworht", "Ormsworth");
const CITED_2 = "Policy reference: Late Opening Policy, JBA Policy Manual p.15; Attendance Policy, JBA Policy Manual p.14";
const SKIPPED = "Observed:\nOttoline skipped the opening checklist today.";
const SKIPPED_ADDED = "Observed:\nOttoline skipped the opening checklist today. She will practise the checklist with her lead before the next shift.";
const CITED_1 = "Policy reference: Standards of Conduct Policy, JBA Policy Manual p.12";

beforeEach(() => vi.stubEnv("CITATION_LINE_KEPT_ON_REVISION_ENABLED", ""));
afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("CITATION_LINE_KEPT_ON_REVISION_ENABLED", "true");

describe("CITATION_LINE_KEPT_ON_REVISION_ENABLED", () => {
  it("off: the revision that drops the app's citation line is refused (the defect)", () => {
    const result = plan("fix her last name, it is Ormsworth", `${TYPO}\n\n${CITED_2}`, FIXED);
    expect(result.values).toEqual({});
    expect(result.untouched).toEqual(["coaching_details"]);
  });

  it("on: a wording fix lands, and the citation line stays at the end", () => {
    on();
    const result = plan("fix her last name, it is Ormsworth", `${TYPO}\n\n${CITED_2}`, FIXED);
    expect(result.values.coaching_details).toBe(`${FIXED}\n\n${CITED_2}`);
  });

  it("on: an addition lands, and the citation line stays", () => {
    on();
    const result = plan("Add that she will practise the checklist with her lead before the next shift.", `${SKIPPED}\n\n${CITED_1}`, SKIPPED_ADDED);
    expect(result.values.coaching_details).toBe(`${SKIPPED_ADDED}\n\n${CITED_1}`);
  });

  it("on: a revision that kept the line is written as it is (never twice)", () => {
    on();
    const result = plan("fix her last name, it is Ormsworth", `${TYPO}\n\n${CITED_2}`, `${FIXED}\n\n${CITED_2}`);
    expect(result.values.coaching_details).toBe(`${FIXED}\n\n${CITED_2}`);
  });

  it("on, negative: a manager's own number that disappears is still refused", () => {
    on();
    const before = `Observed:\nOttoline was 25 minutes late to open on 10/20.\n\n${CITED_1}`;
    const result = plan("make it sound more professional", before, "Observed:\nOttoline arrived late to open.");
    expect(result.values).toEqual({});
    expect(result.untouched).toEqual(["coaching_details"]);
  });

  it("negative: a \"Policy reference\" the manager typed in the middle of the text is not the app's line", () => {
    const typed = `Observed:\nPolicy reference: Standards of Conduct Policy, JBA Policy Manual p.12\nOttoline skipped the opening checklist today.`;
    expect(splitAppCitationLine(typed)).toEqual({ body: typed, line: null });
    expect(splitAppCitationLine(`${SKIPPED}\n\n${CITED_1}`)).toEqual({ body: SKIPPED, line: CITED_1 });
    expect(splitAppCitationLine(`${TYPO}\n\n${CITED_2}`)).toEqual({ body: TYPO, line: CITED_2 });
  });
});
