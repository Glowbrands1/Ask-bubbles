import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pickCrossChatOpenDraft, type CrossChatDraftRow } from "./cross-chat-draft";

/**
 * DRAFT_REUSE_OWN_ONLY_ENABLED (QA, 25 Oct 2026; rebuilt 6 Nov 2026), below
 * the route: the picker, and the finders whose own query already reads one
 * manager's rows (`findResentDraft` reads `chat_form_incidents.user_id`, not
 * the draft's creator; `findAccountResentDraft` reads `created_by`). With the
 * flag on, the draft each one would hand back is checked against the caller
 * too, and no caller reuses nothing. Off, as before. Names are invented.
 */

const FLAG = "DRAFT_REUSE_OWN_ONLY_ENABLED";
const ORIGINAL = { ...process.env };
const DATE = "2026-10-20";

function row(overrides: Partial<CrossChatDraftRow> = {}): CrossChatDraftRow {
  return {
    id: "draft-manager-a",
    templateKey: "dpoa",
    employeeName: "Rowan Testcase",
    formDate: DATE,
    status: "draft",
    createdAt: "2026-10-20T15:00:00Z",
    createdBy: "manager-a",
    ...overrides,
  };
}

describe("pickCrossChatOpenDraft with ownOnly", () => {
  const wanted = { templateKey: "dpoa", employeeName: "rowan testcase", formDate: DATE };
  it("skips another manager's draft, a draft whose creator was not read, and any draft for no caller", () => {
    expect(pickCrossChatOpenDraft([row()], { ...wanted, ownOnly: true, createdBy: "manager-b" })).toBeNull();
    expect(pickCrossChatOpenDraft([row({ createdBy: undefined })], { ...wanted, ownOnly: true, createdBy: "manager-b" })).toBeNull();
    expect(pickCrossChatOpenDraft([row({ createdBy: "" })], { ...wanted, ownOnly: true, createdBy: "" })).toBeNull();
  });
  it("keeps the caller's own draft, and without ownOnly any manager's, as before", () => {
    const rows = [row(), row({ id: "draft-manager-b", createdBy: "manager-b", createdAt: "2026-10-20T09:00:00Z" })];
    expect(pickCrossChatOpenDraft(rows, { ...wanted, ownOnly: true, createdBy: "manager-b" })).toBe("draft-manager-b");
    expect(pickCrossChatOpenDraft(rows, wanted)).toBe("draft-manager-a");
  });
});

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const tests: ((row: Row) => boolean)[] = [];
      const rows = () => (tables[table] ?? []).filter((entry) => tests.every((test) => test(entry)));
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          tests.push((entry) => entry[column] === value);
          return builder;
        },
        gte(column: string, value: string) {
          tests.push((entry) => String(entry[column] ?? "") >= value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          tests.push((entry) => values.includes(entry[column]));
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then(resolve: (value: { data: Row[]; error: null }) => unknown, reject?: (error: unknown) => unknown) {
          return Promise.resolve({ data: rows(), error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const KEY = "rowan testcase|2026-10-20|minutes,opened";

/**
 * An incident row recorded under manager B that points at manager A's draft:
 * what a bad write or a shared login could leave. The incident query reads
 * B's rows; only the check on the draft itself stops A's draft coming back.
 */
async function load() {
  vi.resetModules();
  const now = new Date().toISOString();
  const tables: Record<string, Row[]> = {
    form_templates: [{ id: "tpl-row", key: "dpoa" }],
    chat_form_incidents: [{ instance_id: "draft-manager-a", incident_key: KEY, user_id: "manager-b", template_key: "dpoa", created_at: now }],
    form_instances: [],
  };
  vi.doMock("server-only", () => ({}));
  vi.doMock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeAdmin(tables) }));
  vi.doMock("./instances", () => ({
    DUPLICATE_DRAFT_WINDOW_HOURS: 24,
    loadInstance: async (id: string) => ({ instance: { id, status: "draft", createdBy: id === "draft-manager-a" ? "manager-a" : "manager-b" } }),
  }));
  return import("./draft-reopen");
}

beforeEach(() => {
  delete process.env[FLAG];
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  for (const mod of ["server-only", "@/lib/supabase/server", "./instances"]) vi.doUnmock(mod);
  vi.resetModules();
});

describe("findResentDraft", () => {
  const wanted = { templateKey: "dpoa", employeeName: "Rowan Testcase", createdBy: "manager-b", incidentKey: KEY };
  it("flag off: returns the draft the incident row points at, as before", async () => {
    const { findResentDraft } = await load();
    expect((await findResentDraft(wanted))?.id).toBe("draft-manager-a");
  });
  it("flag on: never hands manager B a draft manager A made", async () => {
    process.env[FLAG] = "1";
    const { findResentDraft } = await load();
    expect(await findResentDraft(wanted)).toBeNull();
  });
  it("flag on: no caller reuses nothing", async () => {
    process.env[FLAG] = "1";
    const { findResentDraft } = await load();
    expect(await findResentDraft({ ...wanted, createdBy: "" })).toBeNull();
  });
});

describe("findCrossChatOpenDraft and findAccountResentDraft", () => {
  it("flag on: no caller reads nothing", async () => {
    process.env[FLAG] = "1";
    const { findCrossChatOpenDraft, findAccountResentDraft } = await load();
    expect(await findCrossChatOpenDraft({ templateKey: "dpoa", employeeName: "Rowan Testcase", formDate: DATE })).toBeNull();
    expect(await findAccountResentDraft({ templateKey: "dpoa", employeeName: "Rowan Testcase", createdBy: "", locationId: null })).toBeNull();
  });
});
