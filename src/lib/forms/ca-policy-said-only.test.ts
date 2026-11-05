import { describe, expect, it } from "vitest";

import { EMPTY_CONVERSATION_FORM_STATE, prependFormState, withoutPolicyReference, type ConversationFormState } from "@/lib/ai/form-state";
import { readCaPolicy } from "./ca-policy";

/**
 * CA_POLICY_SAID_ONLY_ENABLED (Pau via QA, 5 Nov 2026, sf-s21/s24/s25 in the
 * sibling app): the intent read's heading is stored and prepended as "Policy
 * reference: …". The card's policy reader took that sentence as the manager
 * naming it ("<policy>, as you said"). The manager's words (this app's twin
 * wording, people invented) never named it.
 */
const S24 = "it should be must see behaviors and she also had coaching on file for open ended questions coahing done one 10/22 and bundle coachings done 10/15";
const S25 = "Write a CA for Wynne Sarrow she is a team member works at West Dodge and on 11/3/26 she was scheduled until 9:15PM and clocked out at 9:01. She also took down the registers at 8:11 PM before the Store was closed.";

const stored = (policyHeading: string, policyPage: number): ConversationFormState => ({ ...EMPTY_CONVERSATION_FORM_STATE, policyHeading, policyPage });

describe("the stored policy heading is not the manager naming it", () => {
  it.each([
    ["sf-s24", S24, "Standards of Conduct", 12],
    ["sf-s25", S25, "Attendance", 9],
  ])("%s: the prepended sentence reads as stated; without it, nothing is stated", (_id, said, heading, page) => {
    const text = prependFormState(said, stored(heading, page));
    expect(text).toContain(`Policy reference: ${heading}`);
    expect(readCaPolicy(text).stated).not.toBeNull();
    expect(withoutPolicyReference(text)).toBe(said);
    expect(readCaPolicy(withoutPolicyReference(text)).stated).toBeNull();
  });

  it("a policy the manager typed is still stated", () => {
    const said = "Write a CA for Wynne Sarrow for the attendance policy, she missed her shift";
    const text = prependFormState(said, stored("Attendance", 9));
    expect(readCaPolicy(withoutPolicyReference(text)).stated).toBe("attendance");
  });

  it("text with no stored sentence is unchanged", () => {
    expect(withoutPolicyReference(S24)).toBe(S24);
  });
});
