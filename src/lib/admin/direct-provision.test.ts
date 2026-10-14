import { describe, expect, it } from "vitest";

import {
  DirectProvisionError,
  generateTemporaryPassword,
  runDirectProvision,
  validateDirectProvision,
  type DirectProvisionInput,
  type DirectProvisionPlan,
  type ProvisionAdminClient,
} from "./direct-provision";

const roster = {
  locationIds: ["loc-101"],
  districtIds: ["dist-north"],
  regionIds: ["reg-midwest"],
};

const base: DirectProvisionInput = {
  email: " DJ.Wade@Glowbrands.com ",
  displayName: "DJ Wade",
  role: "regional_manager",
  scopeLevel: "region",
  areaId: "reg-midwest",
  grantSwitch: true,
};

const problems = (input: Partial<DirectProvisionInput>) => {
  const result = validateDirectProvision({ ...base, ...input }, roster);
  return result.ok ? [] : result.problems;
};

describe("direct provisioning validation", () => {
  it("accepts a manager with a rostered area and normalises the email", () => {
    const result = validateDirectProvision(base, roster);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.email).toBe("dj.wade@glowbrands.com");
  });

  it.each(["admin", "owner", "developer", "superuser", ""])("refuses role %j", (role) => {
    expect(problems({ role }).join(" ")).toMatch(/cannot be provisioned/);
  });

  it("refuses global scope outright", () => {
    expect(problems({ scopeLevel: "global", areaId: "" }).join(" ")).toMatch(/Global scope is refused/);
  });

  it("refuses an area the roster does not know — no placeholder ids", () => {
    expect(problems({ areaId: "reg-unassigned" }).join(" ")).toMatch(/not on the Ask Bubbles region roster/);
  });

  it("refuses an area whose prefix does not match the level", () => {
    expect(problems({ scopeLevel: "district", areaId: "reg-midwest" }).join(" ")).toMatch(/must start with "dist-"/);
  });

  it("refuses everything while the roster is empty", () => {
    const empty = { locationIds: [], districtIds: [], regionIds: [] };
    const result = validateDirectProvision(base, empty);
    expect(result.ok).toBe(false);
  });

  it("requires a name and a plausible email", () => {
    expect(problems({ displayName: " " }).join(" ")).toMatch(/display name/);
    expect(problems({ email: "nope" }).join(" ")).toMatch(/not an email/);
  });
});

describe("temporary password", () => {
  const seeded = () => {
    let n = 7;
    return () => (n = (n * 73 + 41) % 256);
  };

  it("is 24 characters with every character class, and varies with its random source", () => {
    const a = generateTemporaryPassword(seeded());
    expect(a).toHaveLength(24);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/[0-9]/);
    expect(a).toMatch(/[^A-Za-z0-9]/);
    let m = 3;
    const b = generateTemporaryPassword(() => (m = (m * 31 + 17) % 256));
    expect(b).not.toBe(a);
  });

  it("never emits look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      let s = i + 1;
      expect(generateTemporaryPassword(() => (s = (s * 131 + 29) % 256))).not.toMatch(/[lIO01]/);
    }
  });
});

/* ------------------------------------------------------------ run (faked) -- */

const plan: DirectProvisionPlan = {
  email: "dj.wade@glowbrands.com",
  displayName: "DJ Wade",
  role: "regional_manager",
  scopeLevel: "region",
  areaId: "reg-midwest",
  grantSwitch: true,
};

interface Fake {
  client: ProvisionAdminClient;
  log: string[];
  inserted: Array<Record<string, unknown>>;
}

function fake(opts: {
  profile?: { role: string; status: string } | null;
  authEmails?: string[];
  authPages?: number;
  columnMissing?: boolean;
  createError?: string;
  insertError?: string;
  deleteError?: string | "throw";
  auditError?: string;
}): Fake {
  const log: string[] = [];
  const inserted: Array<Record<string, unknown>> = [];
  const builder = (table: string) => {
    const state: { op: string } = { op: "select" };
    const b: Record<string, unknown> = {
      select: () => b,
      ilike: () => b,
      limit: async () => ({ data: [], error: opts.columnMissing ? { message: "column" } : null }),
      maybeSingle: async () => ({ data: opts.profile ?? null, error: null }),
      insert: (row: Record<string, unknown>) => {
        state.op = "insert";
        log.push(`insert:${table}`);
        inserted.push({ table, ...row });
        if (table === "app_user_audit") return Promise.resolve({ error: opts.auditError ? { message: opts.auditError } : null });
        return b;
      },
      single: async () => ({
        data: opts.insertError ? null : { id: "u-1", email: plan.email, role: plan.role, status: "active", scope_level: plan.scopeLevel, scope_primary_area_id: plan.areaId },
        error: opts.insertError ? { message: opts.insertError } : null,
      }),
    };
    return b;
  };
  const client: ProvisionAdminClient = {
    from: builder,
    auth: {
      admin: {
        listUsers: async ({ page }) => {
          log.push(`list:${page}`);
          if (opts.authPages && page < opts.authPages) {
            return { data: { users: Array.from({ length: 200 }, (_, i) => ({ email: `x${page}-${i}@y.z` })) }, error: null };
          }
          return { data: { users: (opts.authEmails ?? []).map((email) => ({ email })) }, error: null };
        },
        createUser: async () => {
          log.push("createUser");
          return opts.createError
            ? { data: null, error: { message: opts.createError } }
            : { data: { user: { id: "u-1" } }, error: null };
        },
        deleteUser: async (id: string) => {
          log.push(`deleteUser:${id}`);
          if (opts.deleteError === "throw") throw new Error("network down");
          return { error: opts.deleteError ? { message: opts.deleteError } : null };
        },
      },
    },
  };
  return { client, log, inserted };
}

const rb = () => {
  let n = 11;
  return () => (n = (n * 73 + 41) % 256);
};
const run = (f: Fake, dryRun = false) => runDirectProvision(f.client, plan, { dryRun, randomByte: rb() });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof DirectProvisionError ? e.code : `other:${String(e)}`;
  }
};

describe("direct provisioning run (faked Supabase)", () => {
  it("creates the credential, then an active profile with the grant, then an audit row", async () => {
    const f = fake({});
    const result = await run(f);
    expect(f.log).toEqual(["list:1", "createUser", "insert:app_users", "insert:app_user_audit"]);
    const profile = f.inserted.find((r) => r.table === "app_users")!;
    expect(profile).toMatchObject({ status: "active", role: "regional_manager", scope_level: "region", can_switch_apps: true });
    expect("temporaryPassword" in result && result.temporaryPassword).toHaveLength(24);
  });

  it("a dry run writes nothing", async () => {
    const f = fake({});
    expect(await run(f, true)).toEqual({ dryRun: true });
    expect(f.log).not.toContain("createUser");
    expect(f.inserted).toHaveLength(0);
  });

  it("stops before writing when a profile already exists", async () => {
    const f = fake({ profile: { role: "employee", status: "active" } });
    expect(await code(run(f))).toBe("profile_exists");
    expect(f.log).not.toContain("createUser");
  });

  it("stops before writing when an auth user already holds the address (case-insensitively, on a later page)", async () => {
    const f = fake({ authPages: 2, authEmails: ["DJ.Wade@Glowbrands.com"] });
    expect(await code(run(f))).toBe("auth_exists");
    expect(f.log).toEqual(["list:1", "list:2"]);
  });

  it("refuses when the migration has not been applied, before creating anything", async () => {
    const f = fake({ columnMissing: true });
    expect(await code(run(f))).toBe("column_missing");
    expect(f.log).not.toContain("createUser");
  });

  it("writes no profile when the credential cannot be created", async () => {
    const f = fake({ createError: "rate limited" });
    expect(await code(run(f))).toBe("create_failed");
    expect(f.inserted).toHaveLength(0);
  });

  it("removes the credential again when the profile insert fails", async () => {
    const f = fake({ insertError: "violates check constraint" });
    expect(await code(run(f))).toBe("profile_failed");
    expect(f.log).toContain("deleteUser:u-1");
  });

  it.each([["returned error", "boom"], ["thrown", "throw"]] as const)(
    "reports an ORPHAN loudly, with its id, when the cleanup itself fails (%s)",
    async (_label, deleteError) => {
      const f = fake({ insertError: "violates check constraint", deleteError });
      try {
        await run(f);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(DirectProvisionError);
        const err = e as DirectProvisionError;
        expect(err.code).toBe("cleanup_failed");
        expect(err.orphanedAuthUserId).toBe("u-1");
        expect(err.message).toMatch(/Delete auth user u-1/);
      }
    },
  );

  it("an audit failure is a warning, not a rollback", async () => {
    const f = fake({ auditError: "denied" });
    const result = await run(f);
    expect("warnings" in result && result.warnings[0]).toMatch(/audit row/);
    expect(f.log).not.toContain("deleteUser:u-1");
  });
});
