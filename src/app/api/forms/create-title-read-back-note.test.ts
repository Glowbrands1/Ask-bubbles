import { afterEach, describe, expect, it, vi } from "vitest";

import { withoutReadBackNote } from "@/lib/forms/read-back-note";
import { withOneInactiveLine } from "@/lib/ai/agent-loop/off-roster-line";

/*
 * QA's live re-test B8 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): "the job title typed \"assistant
 * store manager\" was saved as \"Assistant General Manager (from your words)\": the mapping is right for Buff City
 * titles, but \"(from your words)\" must not land in the saved form field (it may stay in the chat reply)." And "The reply
 * says the person \"isn't on the Woven staff list\" and in the same reply \"Woven shows <A> as no longer active\" —
 * contradictory." Invented people.
 */
const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
  vi.doUnmock("@/lib/auth/server");
  vi.doUnmock("@/lib/forms/repository");
  vi.doUnmock("@/lib/forms/instances");
});

async function createWith(employeeRole: string): Promise<{ status: number; created: Record<string, unknown>[] }> {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  vi.resetModules();
  const created: Record<string, unknown>[] = [];
  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => ({
      identity: { subject: "lm-1", email: "a@example.com", displayName: "A", role: "location_manager", scope: { level: "location", primaryAreaId: "loc-a", alsoCoversAreaIds: [] }, verified: true },
      permission,
      provider: "supabase",
    }),
  }));
  vi.doMock("@/lib/forms/repository", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/forms/repository")>()),
    getTemplateByKey: async (key: string) => ({ id: `tpl-${key}`, key, name: "Resignation/Exit Form", shortName: key, description: "", layoutFamily: "exit", requiredPermission: "create_exit_form", active: true, displayOrder: 1 }),
  }));
  vi.doMock("@/lib/forms/instances", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/forms/instances")>()),
    findDemoInstances: async () => ({ deletable: [], protected: [] }),
    createInstance: async (input: Record<string, unknown>) => {
      created.push(input);
      return { id: "33333333-3333-4333-8333-333333333333", templateKey: "resignation-exit", templateName: "Resignation/Exit Form", employeeName: "Corisande Velt", employeeRole: input.employeeRole, locationId: "loc-a", status: "draft", formDate: "2026-11-21", createdAt: "2026-11-21T12:00:00Z", updatedAt: "2026-11-21T12:00:00Z" };
    },
    saveInstanceValues: async () => ({ rejected: [] }),
    loadInstance: async () => null,
  }));
  const route = await import("./instances/route");
  const response = await route.POST(
    new Request("https://app.test/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateKey: "resignation-exit", employeeName: "Corisande Velt", employeeRole, locationId: "loc-a", source: "assistant" }),
    }),
  );
  return { status: response.status, created };
}

describe("a read-back note never reaches the saved Job Title (B8, item 23)", () => {
  it("Create saves \"Assistant General Manager\", not \"Assistant General Manager (from your words)\"", async () => {
    const { created } = await createWith("Assistant General Manager (from your words)");
    expect(created[0]?.employeeRole).toBe("Assistant General Manager");
  });
  it.each([
    ["Assistant General Manager (from your words)", "Assistant General Manager"],
    ["General Manager (as you said)", "General Manager"],
    ["Team Member Part Time (from Woven)", "Team Member Part Time"],
    ["Team Member Full Time (Corisande Velt in Woven)", "Team Member Full Time"],
    ["Team Member Part Time", "Team Member Part Time"],
    ["Maintenance Team (Omaha)", "Maintenance Team (Omaha)"],
  ])("%s -> %s", (typed, saved) => {
    expect(withoutReadBackNote(typed)).toBe(saved);
  });
});

describe("a former employee's reply says one thing (B8, item 23)", () => {
  const line = "**Corisande Velt** shows as no longer active in Woven; I've used the name as you typed it.";
  it("the not-on-the-staff-list sentence goes when the inactive line is there", () => {
    const reply = `Here's the Resignation/Exit Form for **Corisande Velt**. **Corisande Velt** isn't on your store's Woven staff list, so I've used the name as you typed it. Check it before you press Create. ${line}`;
    const out = withOneInactiveLine(reply, line, "Woven");
    expect(out).not.toMatch(/staff list/);
    expect(out.match(/no longer active/g)).toHaveLength(1);
  });
  it("it becomes the inactive line when that line is missing", () => {
    const out = withOneInactiveLine("Here's the form. **Corisande Velt** isn't on the Woven staff list, so I've used the name as you typed it. Check the spelling before you press Create.", line, "Woven");
    expect(out).toBe(`Here's the form. ${line}`);
  });
});
