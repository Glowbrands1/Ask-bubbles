import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Port from the sibling app's #1171 (QA's f072, 20 Nov 2026): `listInstances` matches the overview's employee_name_folded
 * (migration 20261120002000) beside employee_name. Until the migration is applied that column is missing, and the read is
 * made again by the stored name only, as before. Invented names only.
 */
const db = vi.hoisted(() => ({ migrated: true, filters: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      let names = "";
      const builder = {
        select: () => builder,
        or: (expression: string) => {
          if (expression.includes("employee_name")) names = expression;
          return builder;
        },
        is: () => builder,
        not: () => builder,
        in: () => builder,
        eq: () => builder,
        gte: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown) => {
          db.filters.push(names);
          if (!db.migrated && names.includes("employee_name_folded")) {
            return Promise.resolve({ data: null, error: { message: "column form_instance_overview.employee_name_folded does not exist" } }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));

const { listInstances } = await import("./instances");

beforeEach(() => {
  db.filters = [];
});

describe("the overview's folded name (f072)", () => {
  it("matches each name word against the stored name and the folded one", async () => {
    db.migrated = true;
    await expect(listInstances("all", 50, { employeeNameWords: ["lucia", "ramirez"] })).resolves.toEqual([]);
    expect(db.filters).toEqual(["employee_name.ilike.*lucia*,employee_name.ilike.*ramirez*,employee_name_folded.ilike.*lucia*,employee_name_folded.ilike.*ramirez*"]);
  });

  it("before the migration is applied, reads again by the stored name only, never an error", async () => {
    db.migrated = false;
    await expect(listInstances("all", 50, { employeeNameWords: ["lucia"] })).resolves.toEqual([]);
    expect(db.filters).toEqual(["employee_name.ilike.*lucia*,employee_name_folded.ilike.*lucia*", "employee_name.ilike.*lucia*"]);
  });
});
