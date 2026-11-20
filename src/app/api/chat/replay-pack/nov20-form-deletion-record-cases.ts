import { expect, vi } from "vitest";

import { deleteInstance } from "@/lib/forms/instances";

import { WEST_DODGE, STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * WHO DELETED A FORM (port from Ask Sunny, board f066; Pau approved 20 Nov 2026)
 * ============================================================================
 *
 * In Ask Sunny four Test Testy drafts were deleted with nothing recording who or when; this app had the same gap.
 * Every delete now leaves an append-only record (`form_instance_deletions`), and an administrator's "who deleted
 * <name>'s form" reads it (FORM DELETION RECORD, `form-deletions-chat-read.ts`). Test Testy and the deleting District
 * Manager's account are invented.
 */
const REPORT = "QA, board f066 (20 Nov 2026), ported from Ask Sunny: deleted forms left no record of who or when";
const ASKED = "who deleted Test Testy's form";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/** A Test Testy Corrective Action draft on file, deleted by a District Manager in the Forms Register (the route's own call). */
async function deletedDraft(t: ReplayContext): Promise<void> {
  vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
  t.directory(STAFF);
  t.forms().push({
    id: "f066-draft", template_id: "tpl-dpoa", template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Test Testy",
    status: "draft", form_date: "2026-11-17", location_id: "loc-test", location_name: "Test Store", created_by: "manager-a",
    created_at: "2026-11-17T15:00:00Z", updated_at: "2026-11-17T15:00:00Z",
  });
  await deleteInstance("f066-draft", { id: "dm-quill-harrow", role: "district_manager", via: "route" });
}

export const NOV20_FORM_DELETION_RECORD_CASES: ReplayCase[] = [
  {
    id: "nov20-admin-asks-who-deleted-the-form",
    title: `an admin: "${ASKED}": the model is given the deletion record: who (the District Manager's account), when, and that it was the Forms Register`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      await deletedDraft(t);
      t.as("admin", GLOBAL);
      await t.thread().say(ASKED);
      const data = t.lastReportData?.() ?? "";
      expect(data).toContain("FORM DELETION RECORD");
      expect(data).toMatch(/Corrective Action Form for Test Testy, dated 2026-11-17 \(draft\), Test Store: deleted Nov 20, 2026.* by account dm-quill-harrow \(district_manager\), Forms Register\./);
    },
  },
  {
    id: "nov20-manager-asks-who-deleted-declined",
    title: `a location manager: "${ASKED}": a one-line decline (administrators only), and nothing from the record reaches the model`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      await deletedDraft(t);
      t.as("location_manager", WEST_DODGE);
      await t.thread().say(ASKED);
      const data = t.lastReportData?.() ?? "";
      expect(data).toContain("Who deleted a form is for administrators only");
      expect(data).not.toMatch(/dm-quill-harrow|Forms Register/);
    },
  },
];
