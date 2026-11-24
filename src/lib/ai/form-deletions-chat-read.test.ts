import { describe, expect, it, vi } from "vitest";

/**
 * Owner, 23 Nov 2026: "are u sure this doesnt leak information, that other people cant see what a certain manager
 * created?". A form deleted while it was with HR (pending, sent back or rejected) was known only to its creator, its
 * senders and HR; the deletion record, which administrators read, leaves it out. Invented names.
 */
const read = vi.hoisted(() => ({ select: "" }));
const ROWS = [
  { template_name: "Corrective Action Form", employee_name: "Rosalind Vane", form_date: "2026-11-20", status: "draft", location_name: "Invented Place", deleted_by: null, deleted_by_role: "location_manager", deleted_via: "route", deleted_at: "2026-11-23T15:00:00Z", hr_state: "rejected" },
  { template_name: "Corrective Action Form", employee_name: "Rosalind Vane", form_date: "2026-11-10", status: "finalized", location_name: "Invented Place", deleted_by: null, deleted_by_role: "admin", deleted_via: "route", deleted_at: "2026-11-22T15:00:00Z", hr_state: "approved" },
  { template_name: "Exit Form", employee_name: "Rosalind Vane", form_date: "2026-11-01", status: "draft", location_name: "Invented Place", deleted_by: null, deleted_by_role: "location_manager", deleted_via: "route", deleted_at: "2026-11-21T15:00:00Z", hr_state: null },
];

vi.mock("@/lib/supabase/server", () => {
  const builder = {
    select(columns: string) {
      read.select = columns;
      return builder;
    },
    or: () => builder,
    order: () => builder,
    limit: async () => ({ data: ROWS, error: null }),
  };
  return { getSupabaseAdmin: () => ({ from: () => builder }) };
});
vi.mock("@/lib/admin/user-directory", () => ({ readUser: async () => ({ displayName: null }) }));

const { loadFormDeletionsChatBlock } = await import("./form-deletions-chat-read");

describe("the form deletion record leaves out a form deleted while it was with HR", () => {
  it("an administrator asking who deleted Rosalind Vane's forms sees the ordinary ones, never the one that was with HR", async () => {
    const block = (await loadFormDeletionsChatBlock({ question: "who deleted the write up for Rosalind Vane?", role: "admin" })) ?? "";
    expect(read.select).toContain("hr_state:snapshot->instance->>hr_approval_state");
    expect(block).toContain("2026-11-10");
    expect(block).toContain("Exit Form");
    expect(block, "a form deleted while it was with HR is in the record").not.toContain("2026-11-20");
  });
});
