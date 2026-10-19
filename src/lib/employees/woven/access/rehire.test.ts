import { describe, expect, it } from "vitest";

import { PINNED_COMPANY_ID } from "../config";
import { approveRehire, parseRehire, RehireInputError, type RehireDeps } from "./rehire";
import type { RpcResult } from "./terminate";

/**
 * REHIRE — an administrator's explicit approval; two phases; never success
 * unless both complete. The database half (admin check, reason, status, company,
 * confirmed link) is executed in supabase/tests/woven_disable_terminated_checks.sql.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const INPUT = { appUserId: USER, externalEmployeeId: "E1", reason: "Rehired, confirmed with HR" };

function harness(opts: { approve?: RpcResult; restore?: { ok: boolean } | "throw"; record?: RpcResult } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  let restored = 0;
  const deps: RehireDeps = {
    pinnedCompanyId: PINNED_COMPANY_ID,
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "employee_access_approve_rehire") return opts.approve ?? { data: "rehire_enabled", error: null };
      return opts.record ?? { data: "recorded", error: null };
    },
    restoreAuth: async () => {
      restored += 1;
      if (opts.restore === "throw") throw new Error("auth down");
      return opts.restore ?? { ok: true };
    },
  };
  return { calls, deps, restored: () => restored };
}

describe("parseRehire", () => {
  it("requires an account id, an EmployeeID and a non-empty written reason", () => {
    expect(parseRehire({ appUserId: USER.toUpperCase(), externalEmployeeId: "E1", reason: "  ok  " })).toEqual({ appUserId: USER, externalEmployeeId: "E1", reason: "ok" });
    for (const bad of [
      { externalEmployeeId: "E1", reason: "r" },
      { appUserId: "nope", externalEmployeeId: "E1", reason: "r" },
      { appUserId: USER, reason: "r" },
      { appUserId: USER, externalEmployeeId: "E 1!", reason: "r" },
      { appUserId: USER, externalEmployeeId: "E1" },
      { appUserId: USER, externalEmployeeId: "E1", reason: "   " },
      { appUserId: USER, externalEmployeeId: "E1", reason: "x".repeat(301) },
    ]) {
      expect(() => parseRehire(bad as Record<string, unknown>)).toThrow(RehireInputError);
    }
  });

  it("an actor id in the body is ignored: the parsed input has no such field", () => {
    const parsed = parseRehire({ ...INPUT, approverUserId: "someone-else", actor: "x" } as Record<string, unknown>);
    expect(Object.keys(parsed).sort()).toEqual(["appUserId", "externalEmployeeId", "reason"]);
  });
});

describe("approveRehire", () => {
  it("phase one, the ban lift, then phase two; the approver is the one passed in, with the pinned company and the reason", async () => {
    const h = harness();
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "rehired" });
    expect(h.calls.map((c) => c.fn)).toEqual(["employee_access_approve_rehire", "employee_access_record_rehire"]);
    expect(h.calls[0]!.args).toEqual({
      p_app_user_id: USER,
      p_external_employee_id: "E1",
      p_woven_company_id: PINNED_COMPANY_ID,
      p_approver: ADMIN,
      p_reason: "Rehired, confirmed with HR",
    });
    expect(h.calls[1]!.args).toMatchObject({ p_ok: true, p_approver: ADMIN });
    expect(h.restored()).toBe(1);
  });

  it("a database refusal (non-admin approver, no reason, wrong status, wrong company, unconfirmed link) lifts nothing", async () => {
    for (const code of ["rehire_approver_not_admin", "rehire_reason_required", "rehire_not_active_in_latest_read", "rehire_company_scope", "rehire_link_not_confirmed"]) {
      const h = harness({ approve: { data: null, error: { message: code } } });
      expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "refused", code });
      expect(h.restored()).toBe(0);
      expect(h.calls.map((c) => c.fn)).toEqual(["employee_access_approve_rehire"]);
    }
  });

  it("a free-text database message is not passed on", async () => {
    const h = harness({ approve: { data: null, error: { message: "something with spaces" } } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "refused", code: "rehire_refused" });
  });

  it("idempotent: an already-completed rehire does nothing more", async () => {
    const h = harness({ approve: { data: "already_rehired", error: null } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "already_rehired" });
    expect(h.restored()).toBe(0);
    expect(h.calls).toHaveLength(1);
  });

  it("the ban could not be lifted: INCOMPLETE (never rehired), and the database is told so it can revert the profile", async () => {
    const h = harness({ restore: { ok: false } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "incomplete", code: "unban_failed_reverted" });
    expect(h.calls[1]!.args).toMatchObject({ p_ok: false });
  });

  it("the ban could not be lifted AND the revert could not be recorded: still incomplete, retryable", async () => {
    const h = harness({ restore: { ok: false }, record: { data: null, error: { message: "x" } } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "incomplete", code: "unban_failed_not_reverted" });
  });

  it("the ban was lifted but the record failed: incomplete, retry resumes", async () => {
    const h = harness({ record: { data: null, error: { message: "boom" } } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "incomplete", code: "rehire_not_recorded" });
  });

  it("a thrown error is incomplete, not success", async () => {
    const h = harness({ restore: "throw" });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "incomplete", code: "rehire_interrupted" });
  });

  it("a retry after an interrupted rehire resumes through the same two phases", async () => {
    const h = harness({ approve: { data: "rehire_pending_completion", error: null } });
    expect(await approveRehire(INPUT, ADMIN, h.deps)).toEqual({ status: "rehired" });
    expect(h.restored()).toBe(1);
  });
});
