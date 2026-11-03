import { describe, expect, it } from "vitest";

import type { AskResponse } from "@/lib/ai/types";

import { NOTHING_CHANGED } from "./form-diff-reply";
import type { FormDraft } from "./form-reducer";
import { checkedClaim, type FormSnapshot } from "./form-snapshot";
import { PAYROLL_DEDUCT_AMOUNT_QUESTION } from "./payroll-deduct-amount";

/*
 * FORM_REPLY_FROM_DIFF_ENABLED, as QA ruled on 3 Nov 2026: a path's reply is
 * kept word for word when its claim (`formUpdate`) is borne out by the saved
 * form; only a false claim is replaced; no claim, no change.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const LABELS = { payroll_deduct: "Is payroll deduct applicable?", observation: "Observation of Offense", action_plan: "Action Plan" };

function snapshot(values: Record<string, string | string[]>): FormSnapshot {
  const draft: Record<string, FormDraft[string]> = {};
  for (const [key, value] of Object.entries(values)) draft[key] = { key, value, owner: "assistant" };
  return { instanceId: ID, status: "draft", draft, labels: LABELS };
}

const BEFORE = snapshot({ payroll_deduct: [], observation: "Observed:\nShort $3.25.", action_plan: "Plan." });

/** What the correction path writes when payroll becomes Yes and no amount is stated. */
const PAYROLL_REPLY: AskResponse = {
  content: `Updated the **Corrective Action Form** for **Pat Rivera**: Is payroll deduct applicable? → Yes.\n\n${PAYROLL_DEDUCT_AMOUNT_QUESTION}`,
  citations: [],
  coverage: "not_applicable",
  formUpdate: { instanceId: ID, updated: ["payroll_deduct"] },
};

describe("checkedClaim", () => {
  it("a confirmed claim keeps the path's reply byte for byte, the payroll amount question included", () => {
    const after = snapshot({ payroll_deduct: ["yes"], observation: "Observed:\nShort $3.25.", action_plan: "Plan." });
    const kept = checkedClaim(PAYROLL_REPLY, BEFORE, after);
    expect(kept).toBe(PAYROLL_REPLY);
    expect(kept.content).toContain(PAYROLL_DEDUCT_AMOUNT_QUESTION);
  });

  it("a false claim with nothing changed is replaced by \"I didn't change anything\", and the claim is removed", () => {
    const replaced = checkedClaim(PAYROLL_REPLY, BEFORE, BEFORE);
    expect(replaced.content).toBe(NOTHING_CHANGED);
    expect(replaced.formUpdate).toBeUndefined();
  });

  it("a claim on a key that did not change, while another did, names only what really changed", () => {
    const after = snapshot({ payroll_deduct: [], observation: "Observed:\nShort $3.25.", action_plan: "Plan, rebuilt." });
    const replaced = checkedClaim(PAYROLL_REPLY, BEFORE, after);
    expect(replaced.content).toBe('Changed Action Plan to "Plan, rebuilt.".');
    expect(replaced.formUpdate).toEqual({ instanceId: ID, updated: ["action_plan"] });
  });

  it("a claim is confirmed only when every claimed key changed", () => {
    const partly: AskResponse = { ...PAYROLL_REPLY, formUpdate: { instanceId: ID, updated: ["payroll_deduct", "action_plan"] } };
    const after = snapshot({ payroll_deduct: ["yes"], observation: "Observed:\nShort $3.25.", action_plan: "Plan." });
    const replaced = checkedClaim(partly, BEFORE, after);
    expect(replaced.content).toBe('Changed Is payroll deduct applicable? to "yes".');
    expect(replaced.formUpdate).toEqual({ instanceId: ID, updated: ["payroll_deduct"] });
  });

  it("no claim: the reply is untouched, even though the saved form changed", () => {
    const plain: AskResponse = { content: "Tell me which part to change and what it should say.", citations: [], coverage: "not_applicable" };
    const after = snapshot({ payroll_deduct: ["yes"], observation: "Observed:\nShort $3.25.", action_plan: "Plan." });
    expect(checkedClaim(plain, BEFORE, after)).toBe(plain);
  });

  it("a claim about another form is not judged against this one", () => {
    const other: AskResponse = { ...PAYROLL_REPLY, formUpdate: { instanceId: "22222222-2222-4222-8222-222222222222", updated: ["payroll_deduct"] } };
    expect(checkedClaim(other, BEFORE, BEFORE)).toBe(other);
  });
});
