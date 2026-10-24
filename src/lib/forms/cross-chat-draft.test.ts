import { describe, expect, it } from "vitest";

import { pickCrossChatOpenDraft, type CrossChatDraftRow } from "./cross-chat-draft";

const DATE = "2026-10-20";

function row(overrides: Partial<CrossChatDraftRow> = {}): CrossChatDraftRow {
  return {
    id: "draft-sarah",
    templateKey: "dpoa",
    employeeName: "Paisley Example",
    formDate: DATE,
    status: "draft",
    createdAt: "2026-10-20T15:00:00Z",
    createdBy: "sarah",
    ...overrides,
  };
}

const wanted = {
  templateKey: "dpoa",
  employeeName: "paisley example",
  formDate: DATE,
};

describe("cross-chat open draft", () => {
  it("reopens another manager's open draft for the same employee, template, and incident date", () => {
    const id = pickCrossChatOpenDraft(
      [row(), row({ id: "draft-colene", createdBy: "colene", createdAt: "2026-10-21T12:00:00Z" })],
      wanted,
    );
    expect(id).toBe("draft-colene");
  });

  it("does not match a different incident date, template, employee, or a finalized form", () => {
    expect(pickCrossChatOpenDraft([row({ formDate: "2026-10-21" })], wanted)).toBeNull();
    expect(pickCrossChatOpenDraft([row()], { ...wanted, formDate: "2026-10-22" })).toBeNull();
    expect(pickCrossChatOpenDraft([row()], { ...wanted, formDate: null })).toBeNull();
    expect(pickCrossChatOpenDraft([row({ templateKey: "coaching" })], wanted)).toBeNull();
    expect(pickCrossChatOpenDraft([row({ employeeName: "Someone Else" })], wanted)).toBeNull();
    expect(pickCrossChatOpenDraft([row({ status: "finalized" })], wanted)).toBeNull();
  });
});
