import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/employees/woven/access/load", () => ({ loadAccessPlan: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => ({}) }));

const { isNewHire, readNewHireConfig, sendNewHireInvites } = await import("./new-hire-invites");
const { DirectoryError } = await import("./user-directory");
import type { AccessPlan } from "@/lib/employees/woven/access/load";
import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { DirectoryActor } from "./user-directory";

/*
 * NEW_HIRE_INVITES_ENABLED (Pau, 28 Oct 2026): "i just dont want to bulk send
 * link to everyone coz im limited 2 sends an hr". Every switch closed by
 * default; at most one (or two) invitations an hour; new hires only.
 */
const NOW = new Date("2026-10-30T12:00:00Z");
const ON = {
  NEW_HIRE_INVITES_ENABLED: "true",
  NEW_HIRE_INVITE_SINCE: "2026-10-28",
  NEW_HIRE_INVITE_ROLES: "employee",
  NEW_HIRE_INVITE_ACTOR: "Admin@Example.test",
};
const actor = { id: "a", email: "admin@example.test", role: "admin" as const, scope: { level: "global" as const, primaryAreaId: null, alsoCoversAreaIds: [] } };

describe("readNewHireConfig", () => {
  it("off by default", () => {
    expect(readNewHireConfig({}, NOW)).toMatchObject({ enabled: false, problem: null });
  });
  it("on needs a date and an administrator; a role outside the approved ones turns it off", () => {
    expect(readNewHireConfig({ ...ON, NEW_HIRE_INVITE_SINCE: "" }, NOW).problem).toContain("NEW_HIRE_INVITE_SINCE");
    expect(readNewHireConfig({ ...ON, NEW_HIRE_INVITE_ACTOR: "" }, NOW).problem).toContain("NEW_HIRE_INVITE_ACTOR");
    expect(readNewHireConfig({ ...ON, NEW_HIRE_INVITE_ROLES: "employee,admin" }, NOW).problem).toContain("admin");
  });
  it("on: the date, the roles, the administrator, today, one an hour unless 2", () => {
    expect(readNewHireConfig(ON, NOW)).toEqual({
      enabled: true,
      since: "2026-10-28",
      roles: ["employee"],
      perHour: 1,
      actorEmail: "admin@example.test",
      today: "2026-10-30",
      problem: null,
    });
    expect(readNewHireConfig({ ...ON, NEW_HIRE_INVITES_PER_HOUR: "2" }, NOW).perHour).toBe(2);
    expect(readNewHireConfig({ ...ON, NEW_HIRE_INVITES_PER_HOUR: "10" }, NOW).perHour).toBe(1);
  });
  it("a new hire: from the date through today", () => {
    const c = { since: "2026-10-28", today: "2026-10-30" };
    expect([isNewHire("2026-10-28", c), isNewHire("2026-10-30", c), isNewHire("2026-10-27", c), isNewHire("2026-10-31", c), isNewHire(null, c)]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

function ready(id: string, role = "employee"): PlannedRow {
  return {
    key: `employee:${id}`,
    externalEmployeeId: id,
    appUserId: null,
    employeeName: `Person ${id}`,
    emailAddress: `${id.toLowerCase()}@example.test`,
    wovenStatus: "active",
    wovenPosition: null,
    wovenPrimaryLocation: null,
    wovenAdditionalLocations: [],
    account: null,
    proposedRole: role,
    proposedPrimaryAreaId: "loc-66",
    actions: ["CREATE_USER"],
    reasons: [],
    lifecycle: "NO_CHANGE",
    lifecycleReason: "",
    before: null,
    after: { email: `${id.toLowerCase()}@example.test`, role, scope_level: "location", scope_primary_area_id: "loc-66" },
    wovenSourceAt: null,
  } as unknown as PlannedRow;
}
const planOf = (rows: PlannedRow[], codes: string[] = []) => ({ rows, guard: { mutationsAllowed: codes.length === 0, codes, details: {} } }) as unknown as AccessPlan;

function fakes(rows: PlannedRow[], hired: Record<string, string | null>, codes: string[] = []) {
  const made: string[] = [];
  return {
    made,
    deps: {
      loadPlan: async () => planOf(rows, codes),
      hireDates: async () => new Map(Object.entries(hired)),
      actor: async (): Promise<DirectoryActor | null> => actor,
      createAndInvite: vi.fn(async (row: PlannedRow) => {
        made.push(row.externalEmployeeId!);
      }),
    },
  };
}
const config = (over: Record<string, string> = {}) => readNewHireConfig({ ...ON, ...over }, NOW);

describe("the hourly run", () => {
  it("one invitation an hour, the oldest hire first; the rest wait", async () => {
    const f = fakes([ready("E1"), ready("E2"), ready("E3")], { E1: "2026-10-30", E2: "2026-10-28", E3: "2026-10-29" });
    expect(await sendNewHireInvites({ config: config(), now: NOW }, f.deps)).toEqual({ status: "completed", sent: 1, failed: 0, skipped: 0, waiting: 2, stoppedBy: null });
    expect(f.made).toEqual(["E2"]);
  });

  it("two when set to 2, never more", async () => {
    const f = fakes([ready("E1"), ready("E2"), ready("E3")], { E1: "2026-10-30", E2: "2026-10-28", E3: "2026-10-29" });
    await sendNewHireInvites({ config: config({ NEW_HIRE_INVITES_PER_HOUR: "2" }), now: NOW }, f.deps);
    expect(f.made).toEqual(["E2", "E3"]);
  });

  it("the mailer's limit stops the hour at once", async () => {
    const f = fakes([ready("E1"), ready("E2")], { E1: "2026-10-28", E2: "2026-10-29" });
    f.deps.createAndInvite.mockImplementation(async () => {
      throw new DirectoryError("email_rate_limited", "limit", 429);
    });
    expect(await sendNewHireInvites({ config: config({ NEW_HIRE_INVITES_PER_HOUR: "2" }), now: NOW }, f.deps)).toMatchObject({ sent: 0, failed: 1, stoppedBy: "email_rate_limited" });
    expect(f.deps.createAndInvite).toHaveBeenCalledTimes(1);
  });

  /*
   * QA, 28 Oct 2026: "If the oldest new hire cannot be created (e.g.
   * createLinkedAccount throws duplicate_email because an unlinked account
   * with that email already exists …) that person fills the slot every hour
   * and nobody behind them ever gets a link."
   */
  it("a duplicate-email oldest hire is skipped and the next one gets the hour's link", async () => {
    const f = fakes([ready("E1"), ready("E2")], { E1: "2026-10-28", E2: "2026-10-29" });
    f.deps.createAndInvite.mockImplementation(async (row: PlannedRow) => {
      if (row.externalEmployeeId === "E1") throw new DirectoryError("duplicate_email", "taken", 409);
      f.made.push(row.externalEmployeeId!);
    });
    expect(await sendNewHireInvites({ config: config(), now: NOW }, f.deps)).toEqual({
      status: "completed",
      sent: 1,
      failed: 0,
      skipped: 1,
      waiting: 1,
      stoppedBy: null,
    });
    expect(f.made).toEqual(["E2"]);
  });

  it("any refusal before sending is skipped the same way; a failure that may have reached the mailer uses the hour", async () => {
    for (const code of ["invalid_input", "not_found", "protected_account", "forbidden_grant"] as const) {
      const f = fakes([ready("E1"), ready("E2")], { E1: "2026-10-28", E2: "2026-10-29" });
      f.deps.createAndInvite.mockImplementation(async (row: PlannedRow) => {
        if (row.externalEmployeeId === "E1") throw new DirectoryError(code, "no", 409);
        f.made.push(row.externalEmployeeId!);
      });
      await sendNewHireInvites({ config: config(), now: NOW }, f.deps);
      expect(f.made, code).toEqual(["E2"]);
    }
    const provider = fakes([ready("E1"), ready("E2")], { E1: "2026-10-28", E2: "2026-10-29" });
    provider.deps.createAndInvite.mockImplementation(async () => {
      throw new DirectoryError("provider_failed", "no", 502);
    });
    expect(await sendNewHireInvites({ config: config(), now: NOW }, provider.deps)).toMatchObject({ sent: 0, failed: 1, skipped: 0 });
    expect(provider.deps.createAndInvite).toHaveBeenCalledTimes(1);
  });

  it("only new hires, and only the roles named: everybody already on the team is left to an administrator", async () => {
    const f = fakes([ready("E1"), ready("E2"), ready("E3", "location_manager")], { E1: "2026-10-27", E2: null, E3: "2026-10-29" });
    expect(await sendNewHireInvites({ config: config(), now: NOW }, f.deps)).toMatchObject({ sent: 0, waiting: 0 });
    expect(f.made).toEqual([]);
  });

  it("nothing while a guard stops changes, with no roles named, or without an administrator", async () => {
    const blocked = fakes([ready("E1")], { E1: "2026-10-29" }, ["active_count_dropped"]);
    expect(await sendNewHireInvites({ config: config(), now: NOW }, blocked.deps)).toEqual({ status: "blocked", code: "guards" });
    expect(await sendNewHireInvites({ config: config({ NEW_HIRE_INVITE_ROLES: "" }), now: NOW }, blocked.deps)).toEqual({ status: "off", code: "no_roles" });
    const noActor = fakes([ready("E1")], { E1: "2026-10-29" });
    noActor.deps.actor = async () => null;
    expect(await sendNewHireInvites({ config: config(), now: NOW }, noActor.deps)).toEqual({ status: "off", code: "actor_not_an_administrator" });
    expect([...blocked.made, ...noActor.made]).toEqual([]);
  });

  it("off: nothing is read", async () => {
    const f = fakes([ready("E1")], { E1: "2026-10-29" });
    const loadPlan = vi.fn(f.deps.loadPlan);
    expect(await sendNewHireInvites({ config: readNewHireConfig({}, NOW), now: NOW }, { ...f.deps, loadPlan })).toEqual({ status: "off", code: "new_hire_invites_off" });
    expect(loadPlan).not.toHaveBeenCalled();
  });
});
