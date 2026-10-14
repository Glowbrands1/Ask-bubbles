import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  employee: null as Record<string, unknown> | null,
  appUser: null as Record<string, unknown> | null,
  linkByEmployee: null as unknown,
  linkByUser: null as unknown,
  linkInserts: [] as Record<string, unknown>[],
  linkError: null as unknown,
  create: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/employees/woven/access/load", () => ({ loadAccessPlan: vi.fn() }));
vi.mock("@/lib/admin/create-account", () => ({ createAccountWithoutEmail: db.create }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (col: string) => ({
          maybeSingle: async () => ({
            data: table === "employee_access_directory" ? db.employee : col === "external_employee_id" ? db.linkByEmployee : db.linkByUser,
            error: null,
          }),
        }),
        ilike: () => ({ maybeSingle: async () => ({ data: db.appUser }) }),
      }),
      insert: async (row: Record<string, unknown>) => {
        db.linkInserts.push(row);
        return { error: db.linkError };
      },
    }),
  }),
}));

import { WOVEN_TENANT } from "@/config/company/woven";
import { createLinkedAccount } from "./woven-account";

const actor = { id: "a", email: "admin@x.com", role: "admin" as const };
const base = () => ({
  external_employee_id: "E1",
  first_name: "Jo",
  last_name: "Lee",
  preferred_first_name: null,
  email_address: "Jo@Example.com",
  employment_status: "active",
  missing_sync_count: 0,
  data_issues: ["unmapped_location", "unmapped_position"],
  primary_location_name: "NE Kearney",
  woven_company_id: WOVEN_TENANT.companyId.toLowerCase(),
});
const call = (over: Record<string, unknown> = {}) => createLinkedAccount({ externalEmployeeId: "E1", role: "employee", locationId: "loc-66", ...over }, actor);

beforeEach(() => {
  db.employee = base();
  db.appUser = null;
  db.linkByEmployee = null;
  db.linkByUser = null;
  db.linkInserts = [];
  db.linkError = null;
  db.create.mockReset().mockResolvedValue({ id: "u1" });
});

describe("createLinkedAccount", () => {
  it("creates and links an employee whose Woven mappings are missing", async () => {
    await expect(call()).resolves.toEqual({ outcome: "created", userId: "u1", linked: true });
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jo@example.com", role: "employee", scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] } }),
      actor,
    );
    expect(db.linkInserts[0]).toMatchObject({ app_user_id: "u1", external_employee_id: "E1", link_method: "provisioned" });
  });
  it("reports a failed link insert and a rerun repairs it without a second account", async () => {
    db.linkError = { message: "x" };
    await expect(call()).resolves.toMatchObject({ outcome: "created", linked: false });
    db.linkError = null;
    db.appUser = { id: "u1", role: "employee" };
    db.create.mockClear();
    await expect(call()).resolves.toEqual({ outcome: "repaired", userId: "u1", linked: true });
    expect(db.create).not.toHaveBeenCalled();
  });
  it.each([
    ["admin", { role: "admin" }],
    ["owner", { role: "owner" }],
    ["district manager", { role: "district_manager" }],
    ["an unknown location", { locationId: "loc-999" }],
    ["a district id", { locationId: "dist-1" }],
  ])("refuses %s", async (_n, over) => {
    await expect(call(over)).rejects.toMatchObject({ code: "invalid_input" });
    expect(db.create).not.toHaveBeenCalled();
  });
  it.each([
    ["terminated", { employment_status: "terminated" }],
    ["not seen in the latest sync", { missing_sync_count: 1 }],
    ["termination conflict", { data_issues: ["status_termination_conflict"] }],
    ["no email", { email_address: null }],
    ["another company", { woven_company_id: "00000000-0000-0000-0000-000000000001" }],
    ["a Sun Tan City location", { primary_location_name: "Sun Tan City - Mesa" }],
  ])("refuses an employee who is %s", async (_n, over) => {
    db.employee = { ...base(), ...over };
    await expect(call()).rejects.toBeDefined();
    expect(db.create).not.toHaveBeenCalled();
  });
  it("refuses a second account for an already-linked employee", async () => {
    db.appUser = { id: "u1", role: "employee" };
    db.linkByEmployee = { app_user_id: "u1" };
    await expect(call()).rejects.toMatchObject({ code: "duplicate_email" });
    expect(db.linkInserts).toHaveLength(0);
  });
  it("never links an administrator account by email", async () => {
    db.appUser = { id: "u9", role: "admin" };
    await expect(call()).rejects.toMatchObject({ code: "protected_account" });
  });
});

describe("the sync is separate from account creation", () => {
  it.each(["src/lib/employees/woven/sync.ts", "src/app/api/employees/woven/cron/route.ts", "src/app/api/admin/employees/woven/sync/route.ts", "src/lib/employees/woven/access/shadow.ts"])(
    "%s cannot create accounts",
    (file) => {
      const code = readFileSync(file, "utf8");
      expect(code).not.toMatch(/create-account|woven-account|createLinkedAccount|runProvisioning|inviteUser|auth\.admin/);
    },
  );
});
