import { extractText, getDocumentProxy } from "unpdf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope } from "@/types";

import type { FormsActor } from "@/lib/forms/access";

/**
 * ============================================================================
 * THE APPROVED FORM'S PDF NEVER SHOWS THE APPROVAL NOTES (owner, 23 Nov 2026)
 * ============================================================================
 *
 * "the manager once sent back, will have option to print and save as PDF … of course the notes should not show in PDF".
 * The whole round trip on the real `instances.ts`, `hr-approval.ts` and PDF route: the manager sends a Policy Review to
 * HR, HR sends it back with a note, the manager replies with a note, HR approves it with a note. The manager downloads
 * the PDF: the form is in it, and none of the three notes. Invented accounts and an invented employee.
 */

const ORIGINAL = { ...process.env };
const STORE_A: AccessScope = { level: "location", primaryAreaId: "loc-store-a", alsoCoversAreaIds: [] };

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
} as FakeStore;
const extra = store as unknown as Record<string, Record<string, unknown>[]>;

const CREATOR = "lm-bellweather";
const HR = "hr-osgood-farrow";

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/auth/server", () => ({
  authorizeRequest: async (_request: Request, permission: string) => ({
    identity: { subject: CREATOR, email: "bellweather@example.com", displayName: "Bellweather", role: "location_manager", scope: STORE_A, verified: true },
    permission,
    provider: "supabase",
  }),
}));
vi.mock("@/lib/forms/forms-visibility", () => ({ resolveFormsVisibility: async () => STORE_A }));

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInstance, saveInstanceValues } = await import("@/lib/forms/instances");
const { sendForHrApproval, decideHrApproval, commentOnHrApproval } = await import("@/lib/forms/hr-approval");
const pdfRoute = await import("./instances/[id]/pdf/route");

const manager: FormsActor = { id: CREATOR, role: "location_manager", verified: true, scope: STORE_A, visibility: null, hrApprover: false };
const hr: FormsActor = { id: HR, role: "district_manager", verified: true, scope: null, visibility: null, hrApprover: true };

const HR_SEND_BACK = "Please add the time she clocked in, Osgood note one.";
const MANAGER_REPLY = "She clocked in at 9:20, Bellweather reply two.";
const HR_APPROVAL = "Approved after the reply, Osgood note three.";

beforeEach(async () => {
  process.env.FORMS_HR_APPROVAL_ENABLED = "true";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  for (const table of ["form_instances", "form_instance_values", "form_instance_events", "form_template_versions", "form_templates", "form_template_current", "form_template_assets"]) {
    extra[table] = [];
  }
  extra.form_hr_approvers = [{ app_user_id: HR, revoked_at: null }];
  extra.form_hr_approval_events = [];
  extra.app_notifications = [];
  extra.app_users = [
    { id: HR, email: "hr.osgood@example.com", display_name: "Osgood", status: "active" },
    { id: CREATOR, email: "bellweather@example.com", display_name: "Bellweather", status: "active" },
  ];
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ");
}

describe("the approved form's PDF", () => {
  it("prints the form, and none of HR's notes or the manager's reply", async () => {
    const instance = await createInstance({
      templateKey: "policy-review",
      variantKey: null,
      employeeName: "Marigold Featherstone",
      employeeRole: "Team Member Part Time",
      locationId: "loc-store-a",
      locationName: "Invented Store",
      createdBy: CREATOR,
      source: "manual",
      formDate: "2026-11-23",
    });
    await saveInstanceValues(instance.id, { values: { observation: "Observed:\nMarigold Featherstone was late to her shift." }, checked: {} }, CREATOR);
    await sendForHrApproval(instance.id, manager, null, { acknowledgeUnverifiedPolicy: true });
    await decideHrApproval(instance.id, hr, "send_back", HR_SEND_BACK);
    await commentOnHrApproval(instance.id, manager, MANAGER_REPLY);
    const approved = await decideHrApproval(instance.id, hr, "approve", HR_APPROVAL);
    expect(approved.status).toBe("finalized");

    const response = await pdfRoute.GET(new Request(`https://app.test/api/forms/instances/${instance.id}/pdf`), { params: Promise.resolve({ id: instance.id }) });
    expect(response.status).toBe(200);
    const text = await pdfText(new Uint8Array(await response.arrayBuffer()));
    expect(text, "the PDF is not the form").toContain("Marigold Featherstone");
    for (const note of [HR_SEND_BACK, MANAGER_REPLY, HR_APPROVAL]) {
      expect(text, `the PDF shows an approval note: ${note}`).not.toContain(note.split(",")[1]!.trim());
    }
    expect(text).not.toMatch(/Osgood|Bellweather reply/);
  });
});
