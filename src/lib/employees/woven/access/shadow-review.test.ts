import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PINNED_COMPANY_ID } from "../config";
import { employeeIdsHash, parseShadowReview, recordShadowReview, ShadowReviewError } from "./shadow-review";

const RUN = "11111111-1111-4111-8111-111111111111";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";

describe("employeeIdsHash — the same hash the database computes", () => {
  it("is order- and duplicate-insensitive, and is sha256 of the sorted ids joined by newlines", () => {
    expect(employeeIdsHash(["b", "a", "a"])).toBe(employeeIdsHash(["a", "b"]));
    expect(employeeIdsHash(["b", "a"])).toBe(createHash("sha256").update("a\nb", "utf8").digest("hex"));
    expect(employeeIdsHash(["a"])).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb");
    expect(employeeIdsHash([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("parseShadowReview", () => {
  const good = { shadowRunId: RUN.toUpperCase(), employeeIds: ["B2", "A1", "A1"], reason: "  reviewed  " };
  it("normalizes the run id, de-duplicates and sorts the ids, trims the reason", () => {
    expect(parseShadowReview(good)).toEqual({ shadowRunId: RUN, employeeIds: ["A1", "B2"], reason: "reviewed" });
  });
  it("refuses a missing run, no ids, a malformed id, no reason, too many ids", () => {
    for (const bad of [
      { ...good, shadowRunId: "x" },
      { ...good, employeeIds: [] },
      { ...good, employeeIds: ["ok", "bad id!"] },
      { ...good, employeeIds: "A1" },
      { ...good, reason: " " },
      { ...good, employeeIds: Array.from({ length: 201 }, (_, i) => `E${i}`) },
    ]) {
      expect(() => parseShadowReview(bad as Record<string, unknown>)).toThrow(ShadowReviewError);
    }
  });
  it("an actor in the body is ignored", () => {
    expect(Object.keys(parseShadowReview({ ...good, reviewedBy: "x" } as Record<string, unknown>)).sort()).toEqual(["employeeIds", "reason", "shadowRunId"]);
  });
});

describe("recordShadowReview", () => {
  it("sends the run, the reviewer from the session, the ids, their hash, the pinned company and the reason", async () => {
    const calls: Record<string, unknown>[] = [];
    const input = { shadowRunId: RUN, employeeIds: ["A1", "B2"], reason: "ok" };
    const outcome = await recordShadowReview(input, ADMIN, {
      pinnedCompanyId: PINNED_COMPANY_ID,
      rpc: async (_fn, args) => (calls.push(args), { data: "99999999-9999-4999-8999-999999999999", error: null }),
    });
    expect(outcome).toMatchObject({ status: "recorded", employeeCount: 2, idsSha256: employeeIdsHash(["A1", "B2"]) });
    expect(calls[0]).toEqual({
      p_shadow_run_id: RUN,
      p_reviewer: ADMIN,
      p_employee_ids: ["A1", "B2"],
      p_ids_sha256: employeeIdsHash(["A1", "B2"]),
      p_woven_company_id: PINNED_COMPANY_ID,
      p_reason: "ok",
    });
  });

  it("a database refusal (not an admin, run not newest/clean/fresh, unlisted employee, company) is a refusal with its short code", async () => {
    for (const code of ["review_reviewer_not_admin", "review_not_latest_run", "review_run_stale", "review_unlisted_employee", "review_company_scope"]) {
      const outcome = await recordShadowReview({ shadowRunId: RUN, employeeIds: ["A1"], reason: "ok" }, ADMIN, {
        pinnedCompanyId: PINNED_COMPANY_ID,
        rpc: async () => ({ data: null, error: { message: code } }),
      });
      expect(outcome).toEqual({ status: "refused", code });
    }
  });

  it("a thrown error is a refusal, not a recorded review", async () => {
    const outcome = await recordShadowReview({ shadowRunId: RUN, employeeIds: ["A1"], reason: "ok" }, ADMIN, {
      pinnedCompanyId: PINNED_COMPANY_ID,
      rpc: async () => {
        throw new Error("down");
      },
    });
    expect(outcome).toEqual({ status: "refused", code: "review_interrupted" });
  });
});
