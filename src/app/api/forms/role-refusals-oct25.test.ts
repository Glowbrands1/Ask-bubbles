import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE SERVER REFUSES A FORM THE ROLE MAY NOT CREATE OR FINALIZE — QA, 25 OCT 2026
 * ============================================================================
 *
 * Ported from the sibling app. The chat card is the offer; these routes are
 * the boundary. Whatever a card shows, a location manager cannot start an
 * SDIT EPP (`create_epp` sits with the district manager and above), and an
 * assistant manager cannot finalize a coaching draft a district manager
 * started at their store (they hold no `create_coaching_form`). Each refusal is a 403 (or the 404 a record outside
 * the caller's scope gets), and the database is unchanged: no row inserted, the
 * draft still a draft. A district manager doing the same is accepted, so the
 * refusal is the permission and not a broken fixture.
 *
 * Real route handlers, the real permission matrix applied the way
 * `authorizeRequest` applies it, the real template library installed into the
 * in-memory Supabase fake. Invented names.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

const STORE_ID = "loc-0311";
const STORE: AccessScope = { level: "location", primaryAreaId: STORE_ID, alsoCoversAreaIds: [] };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const state = vi.hoisted(() => ({
  role: "location_manager",
  subject: "manager-1",
  scope: null as unknown,
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return {
    ...actual,
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  };
});

vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: state.subject,
          email: `${state.subject}@example.test`,
          displayName: "Manager",
          role: state.role,
          scope: state.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");

function as(role: string, subject: string, scope: AccessScope) {
  state.role = role;
  state.subject = subject;
  state.scope = scope;
}

const create = (templateKey: string) =>
  instancesRoute.POST(
    new Request("https://app.test/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateKey, employeeName: "Tessaly Brookhart", locationId: STORE_ID, source: "assistant" }),
    }),
  );

const finalize = (id: string) =>
  instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "finalize" }),
    }),
    { params: Promise.resolve({ id }) },
  );

// Installing the library is slow on a loaded machine.
beforeEach(async () => {
  for (const key of Object.keys(store)) (store as unknown as Record<string, unknown[]>)[key] = [];
  await ensureTemplateLibrary("system");
}, 60_000);

describe("a location manager cannot start an SDIT EPP", () => {
  it("POST /api/forms/instances {templateKey: \"sdit-epp\"} is a 403, and no row is inserted", async () => {
    as("location_manager", "lm-1", STORE);
    const response = await create("sdit-epp");
    expect(response.status).toBe(403);
    expect(store.form_instances ?? []).toHaveLength(0);
  });

  it("a district manager may, so the refusal is the permission", async () => {
    as("district_manager", "dm-1", GLOBAL);
    const response = await create("sdit-epp");
    expect(response.status).toBe(200);
    expect(store.form_instances ?? []).toHaveLength(1);
  });
});

describe("an assistant manager cannot finalize a district manager's coaching draft", () => {
  async function districtManagersDraft(): Promise<string> {
    as("district_manager", "dm-1", GLOBAL);
    const response = await create("coaching");
    expect(response.status).toBe(200);
    const id = String(((await response.json()) as { instance: { id: string } }).instance.id);
    expect(store.form_instances!.find((row) => row.id === id)?.status).toBe("draft");
    return id;
  }

  it("POST /api/forms/instances/<id> {action: \"finalize\"} is refused, and the form is still a draft", async () => {
    const id = await districtManagersDraft();
    as("assistant_manager", "am-1", STORE);
    const response = await finalize(id);
    expect([403, 404]).toContain(response.status);
    expect(store.form_instances!.find((row) => row.id === id)?.status).toBe("draft");
    expect(store.form_instances!.find((row) => row.id === id)?.finalized_at ?? null).toBeNull();
  });
});
