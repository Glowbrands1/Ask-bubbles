import { describe, expect, it } from "vitest";

import { designateReviewer, parseReviewerChange, ReviewerInputError, revokeReviewer } from "./reviewers";

const USER = "00000000-0000-4000-8000-0000000000a1";
const ACTOR = "00000000-0000-4000-8000-0000000000b2";

describe("parseReviewerChange", () => {
  it("needs an account id and a written reason, and has no field for an actor", () => {
    expect(parseReviewerChange({ userId: USER.toUpperCase(), reason: " why " })).toEqual({ userId: USER, reason: "why" });
    expect(Object.keys(parseReviewerChange({ userId: USER, reason: "r", actor: "x", designatedBy: "y" } as Record<string, unknown>)).sort()).toEqual(["reason", "userId"]);
    for (const bad of [{ reason: "r" }, { userId: "nope", reason: "r" }, { userId: USER }, { userId: USER, reason: "  " }, { userId: USER, reason: "x".repeat(301) }]) {
      expect(() => parseReviewerChange(bad as Record<string, unknown>)).toThrow(ReviewerInputError);
    }
  });
});

describe("designate and revoke", () => {
  const harness = (result: { data: unknown; error: { message?: string } | null }) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return { calls, deps: { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), result) } };
  };

  it("sends the designee, the acting account and the reason to the right function", async () => {
    const h = harness({ data: "id-1", error: null });
    expect(await designateReviewer({ userId: USER, reason: "r" }, ACTOR, h.deps)).toEqual({ status: "designated", designationId: "id-1" });
    expect(await revokeReviewer({ userId: USER, reason: "r" }, ACTOR, h.deps)).toEqual({ status: "revoked", designationId: "id-1" });
    expect(h.calls).toEqual([
      { fn: "employee_access_designate_reviewer", args: { p_user_id: USER, p_actor: ACTOR, p_reason: "r" } },
      { fn: "employee_access_revoke_reviewer", args: { p_user_id: USER, p_actor: ACTOR, p_reason: "r" } },
    ]);
  });

  it("a database refusal is a refusal with its short code; free text is not passed on; a throw is not a success", async () => {
    expect(await designateReviewer({ userId: USER, reason: "r" }, ACTOR, harness({ data: null, error: { message: "designate_self" } }).deps)).toEqual({ status: "refused", code: "designate_self" });
    expect(await revokeReviewer({ userId: USER, reason: "r" }, ACTOR, harness({ data: null, error: { message: "a sentence with spaces" } }).deps)).toEqual({ status: "refused", code: "revoke_refused" });
    expect(await designateReviewer({ userId: USER, reason: "r" }, ACTOR, { rpc: async () => { throw new Error("down"); } })).toEqual({ status: "refused", code: "interrupted" });
  });
});
