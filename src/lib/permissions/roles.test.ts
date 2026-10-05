import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ADMIN_CONSOLE_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  PERMISSIONS,
  ROLE_LABEL,
  ROLES,
  canAccessAdminConsole,
  hasPermission,
} from "./index";
import type { Permission, Role } from "@/types";

/**
 * ============================================================================
 * THE ACCESS CONTRACT
 * ============================================================================
 *
 * `employee` is the only role defined by a CLOSED LIST, and these tests keep it
 * closed: a permission added in future is denied to frontline staff
 * AUTOMATICALLY, because nobody has to remember to exclude it.
 *
 * The labels and grants themselves are Buff City Soap configuration
 * (`src/config/company/access.ts`) and are expected to change; what these
 * tests pin is the SHAPE that must survive any such change.
 */

/** Exactly what frontline staff may do. Nothing else. */
const EMPLOYEE_ALLOWED: Permission[] = ["ask_questions", "view_knowledge"];

describe("the Employee role", () => {
  it("holds exactly the capabilities it is specified to hold", () => {
    expect([...DEFAULT_PERMISSION_MATRIX.employee].sort()).toEqual([...EMPLOYEE_ALLOWED].sort());
  });

  it("is denied every other permission in the application", () => {
    const denied = PERMISSIONS.filter((permission) => !EMPLOYEE_ALLOWED.includes(permission));
    expect(denied.length).toBeGreaterThan(10);
    for (const permission of denied) {
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", permission), permission).toBe(
        false,
      );
    }
  });

  it("cannot reach the admin console", () => {
    expect(canAccessAdminConsole("employee")).toBe(false);
  });

  it("can read the knowledge base without being able to change it", () => {
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", "view_knowledge")).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", "manage_knowledge")).toBe(false);
  });
});

describe("the Admin role", () => {
  it("holds every permission in the application", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "admin", permission), permission).toBe(true);
    }
  });

  it("reaches the admin console, and is not the developer role", () => {
    expect(canAccessAdminConsole("admin")).toBe(true);
    expect(ADMIN_CONSOLE_ROLES).toContain("admin");
    expect(ROLE_LABEL.admin).not.toBe(ROLE_LABEL.developer);
  });

  it("has the same reach as owner and developer", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "admin", permission)).toBe(
        hasPermission(DEFAULT_PERMISSION_MATRIX, "owner", permission),
      );
    }
  });
});

describe("the manager roles", () => {
  const MANAGERS: Role[] = [
    "assistant_manager",
    "location_manager",
    "district_manager",
    "regional_manager",
  ];

  it("gives the Forms workspace to every role that can create a form", () => {
    for (const role of ROLES) {
      if (hasPermission(DEFAULT_PERMISSION_MATRIX, role, "create_forms")) {
        expect(hasPermission(DEFAULT_PERMISSION_MATRIX, role, "view_forms_workspace"), role).toBe(true);
      }
    }
  });

  it("only grows in access going up the ladder", () => {
    for (let index = 1; index < MANAGERS.length; index += 1) {
      const below = DEFAULT_PERMISSION_MATRIX[MANAGERS[index - 1]!];
      const above = DEFAULT_PERMISSION_MATRIX[MANAGERS[index]!];
      for (const permission of below) {
        expect(above, `${MANAGERS[index]} lacks ${permission}`).toContain(permission);
      }
    }
  });

  it("never grants any manager role user or integration administration", () => {
    for (const role of MANAGERS) {
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, role, "manage_users"), role).toBe(false);
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, role, "manage_integrations"), role).toBe(
        false,
      );
      expect(canAccessAdminConsole(role), role).toBe(false);
    }
  });
});

describe("the matrix is exhaustive and consistent", () => {
  it("defines a permission set for every role", () => {
    for (const role of ROLES) {
      expect(DEFAULT_PERMISSION_MATRIX[role], role).toBeDefined();
    }
    expect(Object.keys(DEFAULT_PERMISSION_MATRIX).sort()).toEqual([...ROLES].sort());
  });

  it("grants nothing that is not a declared permission", () => {
    // A typo in a matrix entry would otherwise be a permission that silently
    // never matches anything.
    for (const role of ROLES) {
      for (const permission of DEFAULT_PERMISSION_MATRIX[role] ?? []) {
        expect(PERMISSIONS, `${role}/${permission}`).toContain(permission);
      }
    }
  });

  it("labels and describes every role", () => {
    for (const role of ROLES) {
      expect(ROLE_LABEL[role], role).toBeTruthy();
    }
  });
});

describe("the database agrees with the application about roles", () => {
  const migration = readFileSync(
    "supabase/migrations/20260904006000_app_users.sql",
    "utf8",
  );

  it("declares the same role values as the Role type", () => {
    /*
     * The enum is what makes a bad role a rejected write rather than a user
     * whose every permission lookup denies. If the two lists drift, a role the
     * application can express becomes unstorable — or worse, a role stored in
     * the database stops being recognised by the matrix and silently denies
     * everything.
     */
    const enumBlock = migration.slice(
      migration.indexOf("create type public.app_user_role"),
      migration.indexOf("end;", migration.indexOf("create type public.app_user_role")),
    );
    for (const role of ROLES) {
      expect(enumBlock, role).toContain(`'${role}'`);
    }
  });

  it("protects the same roles the application calls administrative", () => {
    /*
     * THE LAST-ADMIN TRIGGER counts these three as administrative. If
     * ADMIN_CONSOLE_ROLES gained a role the trigger did not know about, the app
     * could be left with only that role active and the trigger would happily
     * allow it to be demoted — locking everybody out of User Management with no
     * way back.
     */
    const guard = migration.slice(migration.indexOf("app_users_guard_last_admin"));
    for (const role of ADMIN_CONSOLE_ROLES) {
      expect(guard, role).toContain(`'${role}'`);
    }
    // And nothing else is treated as administrative by the trigger.
    const treated = [...guard.matchAll(/role in \(([^)]*)\)/g)]
      .flatMap((match) => match[1].split(",").map((entry) => entry.trim().replace(/'/g, "")))
      .filter((entry) => entry.length > 0);
    expect([...new Set(treated)].sort()).toEqual([...ADMIN_CONSOLE_ROLES].sort());
  });

  it("keys the profile to auth.users and cascades when the credential goes", () => {
    expect(migration).toMatch(
      /id uuid primary key references auth\.users \(id\) on delete cascade/,
    );
  });

  it("enables AND forces row level security, with no write policy for a browser role", () => {
    expect(migration).toMatch(/alter table public\.app_users enable row level security/);
    expect(migration).toMatch(/alter table public\.app_users force row level security/);
    // One policy, select, own row only.
    expect(migration).toMatch(/for select to authenticated\s*\n\s*using \(id = auth\.uid\(\)\)/);
    expect(migration).not.toMatch(/for (insert|update|delete) to (authenticated|anon)/);
  });

  it("takes the trigger functions off the exposed RPC surface via PUBLIC", () => {
    /*
     * THE MISTAKE THIS PINS, made once already.
     *
     * Both guard functions are `security definer`, and PostgREST publishes
     * every function in `public` as an RPC endpoint. The first attempt to close
     * that revoked EXECUTE from `anon, authenticated` and changed NOTHING:
     * Postgres grants EXECUTE to PUBLIC on every new function, so both roles
     * kept the privilege by inheritance and the linter kept flagging it. Only
     * `from public` actually removes it.
     *
     * Asserted for each function by name so that adding a third guard without
     * the PUBLIC revoke fails here rather than in an advisor report weeks later.
     */
    for (const guard of ["app_users_guard_self_elevation", "app_users_guard_last_admin"]) {
      expect(migration, guard).toContain(
        `revoke execute on function public.${guard}() from public;`,
      );
    }
  });

  it("refuses self-elevation in the database as well as in the routes", () => {
    const guard = migration.slice(migration.indexOf("app_users_guard_self_elevation"));
    expect(guard).toContain("A user cannot change their own role.");
    expect(guard).toContain("A user cannot change their own status.");
    expect(guard).toMatch(/auth\.uid\(\) = new\.id/);
  });
});
