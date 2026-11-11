import { afterEach, describe, expect, it } from "vitest";

import { EMPTY_FILTERS } from "@/lib/analytics/filters";
import { EMPTY_FEEDBACK_FILTERS } from "@/lib/analytics/feedback-filters";
import { attentionSummary } from "@/lib/forms/follow-up";
import { TEMPLATE_SEEDS } from "@/lib/forms/library";

import { demoAnalyticsSnapshot, demoFeedbackPage, demoFeedbackSnapshot } from "./analytics-fixtures";
import {
  demoArchive,
  demoDelete,
  demoFollowUpDone,
  demoFormsFor,
  DemoFormRefusal,
  findDemoForm,
  resetDemoForms,
} from "./forms-fixtures";
import { demoSyncResult, demoTemplate, demoTemplateSummaries } from "./template-fixtures";

const TODAY = "2026-11-11";
const OWNER = { role: "owner" as const, scopeLevel: "global" as const };

afterEach(() => resetDemoForms());

describe("demo Forms Register", () => {
  it("names only real template keys and has overdue and due-this-week follow-ups", () => {
    const forms = demoFormsFor(OWNER, "active", TODAY);
    expect(forms.length).toBeGreaterThan(15);
    const keys = new Set(TEMPLATE_SEEDS.map((seed) => seed.key));
    for (const form of forms) expect(keys.has(form.templateKey)).toBe(true);
    const attention = attentionSummary(forms, TODAY);
    expect(attention.overdue).toBeGreaterThan(0);
    expect(attention.dueThisWeek).toBeGreaterThan(0);
    expect(demoFormsFor(OWNER, "archived", TODAY).length).toBeGreaterThan(0);
  });

  it("scopes a District Manager and a Location Manager to their stores, and hides exit forms from an assistant", () => {
    const all = demoFormsFor(OWNER, "all", TODAY);
    const district = demoFormsFor({ role: "district_manager", scopeLevel: "district" }, "all", TODAY);
    const location = demoFormsFor({ role: "location_manager", scopeLevel: "location" }, "all", TODAY);
    expect(district.length).toBeLessThan(all.length);
    expect(location.length).toBeLessThan(district.length);
    expect(new Set(location.map((form) => form.locationName)).size).toBe(1);
    const assistant = demoFormsFor({ role: "assistant_manager", scopeLevel: "location" }, "all", TODAY);
    expect(assistant.some((form) => form.layoutFamily === "exit")).toBe(false);
  });

  it("keeps a viewer's archive and follow-up, and refuses to delete a finalized form", () => {
    const form = demoFormsFor(OWNER, "active", TODAY).find((row) => row.status === "finalized" && row.followUpDate && !row.followedUpAt)!;
    demoFollowUpDone(form.id, "Demo Owner", true);
    expect(findDemoForm(form.id, TODAY)?.followedUpBy).toBe("Demo Owner");
    demoArchive(form.id, true);
    expect(demoFormsFor(OWNER, "active", TODAY).some((row) => row.id === form.id)).toBe(false);
    expect(() => demoDelete(form.id)).toThrow(DemoFormRefusal);
    const draft = demoFormsFor(OWNER, "active", TODAY).find((row) => row.status === "draft")!;
    demoDelete(draft.id);
    expect(findDemoForm(draft.id, TODAY)).toBeNull();
  });
});

describe("demo Form Templates", () => {
  it("shows every offered template as installed, current at its seed revision", () => {
    const summaries = demoTemplateSummaries();
    expect(summaries.length).toBeGreaterThan(10);
    for (const summary of summaries) {
      const seed = TEMPLATE_SEEDS.find((entry) => entry.key === summary.key)!;
      expect(summary.currentVersion?.version).toBe(seed.revision);
      expect(summary.versionCount).toBe(seed.revision);
      expect(summary.activeAsset?.fileName.replace(/\.docx$/, ".pdf")).toBe(seed.bundledPdfName);
    }
    expect(demoSyncResult().existing).toHaveLength(summaries.length);
    expect(demoTemplate("dpoa")?.current?.status).toBe("published");
  });
});

describe("demo Analytics", () => {
  it("has activity, leaders, stores and feedback, and the filters narrow it", () => {
    const snapshot = demoAnalyticsSnapshot(EMPTY_FILTERS, TODAY);
    expect(snapshot.totals.events).toBeGreaterThan(500);
    expect(snapshot.totals.activeUsers).toBeGreaterThan(10);
    expect(snapshot.leaders.some((leader) => leader.events === 0)).toBe(true);
    expect(snapshot.trend).toHaveLength(snapshot.window.days);

    const store = snapshot.locations[0]!.locationId;
    const narrowed = demoAnalyticsSnapshot({ ...EMPTY_FILTERS, locationId: store }, TODAY);
    expect(narrowed.totals.events).toBeLessThan(snapshot.totals.events);
    expect(narrowed.locations.every((row) => row.locationId === store)).toBe(true);

    const feedback = demoFeedbackSnapshot(EMPTY_FILTERS, TODAY);
    expect(feedback.summary.responses).toBeGreaterThan(0);
    const page = demoFeedbackPage({ ...EMPTY_FILTERS, range: "90d" }, { ...EMPTY_FEEDBACK_FILTERS, status: "all" }, TODAY);
    expect(page.items.length).toBeGreaterThan(0);
  });
});
