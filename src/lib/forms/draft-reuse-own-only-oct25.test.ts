import { describe, expect, it } from "vitest";

import { pickCrossChatOpenDraft, type CrossChatDraftRow, type CrossChatDraftWanted } from "./cross-chat-draft";

/**
 * ============================================================================
 * DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED — NEVER ANOTHER MANAGER'S DRAFT (QA, 25 OCT 2026)
 * ============================================================================
 *
 * QA: when a manager creates a form from chat, the create route can reopen an
 * open draft for the same employee, template and incident date instead of
 * filing a new one, and that lookup did not ask who made the draft. Manager B
 * could be handed manager A's draft.
 *
 * On, the cross-chat picker keeps only a draft whose creator is the caller.
 * Off, another manager's draft still counts, as it does today. The
 * route-level test is `src/app/api/forms/draft-reuse-own-only-oct25-route.test.ts`.
 * Every name here is invented.
 */

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

function wanted(overrides: Partial<CrossChatDraftWanted> = {}): CrossChatDraftWanted {
  return { templateKey: "dpoa", employeeName: "rowan testcase", formDate: DATE, ...overrides };
}

const OWN = { ownDraftsOnly: true, createdBy: "manager-b" } as const;

describe("DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED on: only the caller's own draft is reopened", () => {
  it("does not hand manager B manager A's matching open draft", () => {
    expect(pickCrossChatOpenDraft([row()], wanted(OWN))).toBeNull();
  });

  it("still reopens the caller's own matching draft, even when another manager's is newer", () => {
    const rows = [
      row({ id: "draft-manager-b", createdBy: "manager-b", createdAt: "2026-10-20T12:00:00Z" }),
      row({ id: "draft-manager-a", createdBy: "manager-a", createdAt: "2026-10-21T09:00:00Z" }),
    ];
    expect(pickCrossChatOpenDraft(rows, wanted(OWN))).toBe("draft-manager-b");
  });

  it("matches the name whatever its case: lowercase and UPPERCASE give the same answer", () => {
    const rows = [row(), row({ id: "draft-manager-b", createdBy: "manager-b" })];
    for (const employeeName of ["Rowan Testcase", "rowan testcase", "ROWAN TESTCASE", " rowan   TESTCASE "]) {
      expect(pickCrossChatOpenDraft(rows, wanted({ ...OWN, employeeName }))).toBe("draft-manager-b");
      expect(pickCrossChatOpenDraft([row()], wanted({ ...OWN, employeeName }))).toBeNull();
      expect(pickCrossChatOpenDraft([row()], wanted({ employeeName }))).toBe("draft-manager-a");
    }
  });

  it("does not count a row whose creator was not read, or a caller with no id", () => {
    expect(pickCrossChatOpenDraft([row({ createdBy: undefined })], wanted(OWN))).toBeNull();
    expect(pickCrossChatOpenDraft([row({ createdBy: undefined })], wanted({ ownDraftsOnly: true }))).toBeNull();
  });
});

describe("DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED off: today's behaviour is pinned", () => {
  it("another manager's matching open draft is reopened", () => {
    expect(pickCrossChatOpenDraft([row()], wanted())).toBe("draft-manager-a");
    expect(pickCrossChatOpenDraft([row()], wanted({ createdBy: "manager-b" }))).toBe("draft-manager-a");
    expect(pickCrossChatOpenDraft([row()], wanted({ ownDraftsOnly: false, createdBy: "manager-b" }))).toBe(
      "draft-manager-a",
    );
  });
});
