import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { wovenEditionSupersessionEnabled } from "@/lib/config/chat-quality-flags";

import { editionSupersessionsToApply, planEditionSupersession, type EditionDocument } from "./edition-supersession";

function edition(overrides: Partial<EditionDocument> & Pick<EditionDocument, "documentId" | "title" | "editedAt">): EditionDocument {
  return {
    contentType: "handbook",
    entityId: overrides.documentId,
    policyId: null,
    partKey: "current-version",
    ...overrides,
  };
}

const OLD_MANUAL = "11111111-1111-4111-8111-111111111111";
const NEW_MANUAL = "22222222-2222-4222-8222-222222222222";

describe("Woven edition supersession", () => {
  it("is off unless WOVEN_EDITION_SUPERSESSION_ENABLED is set", () => {
    expect(wovenEditionSupersessionEnabled()).toBe(false);
    const docs = [
      edition({ documentId: OLD_MANUAL, title: "2025 JBA Policy Manual - Edited 5-2025", editedAt: "2025-05-01" }),
      edition({ documentId: NEW_MANUAL, title: "2026 JBA Policy Manual", editedAt: "2026-06-01" }),
    ];
    expect(editionSupersessionsToApply(docs, false)).toEqual([]);
  });

  it("supersedes the older JBA manual edition and keeps both rows", () => {
    const plan = planEditionSupersession([
      edition({
        documentId: OLD_MANUAL,
        entityId: "handbook-2025",
        title: "2025 JBA Policy Manual - Edited 5-2025",
        editedAt: "2025-05-01",
      }),
      edition({
        documentId: NEW_MANUAL,
        entityId: "handbook-2026",
        title: "2026 JBA Policy Manual",
        editedAt: "2026-06-01T14:00:00",
      }),
    ]);
    expect(plan.supersede).toEqual([
      { documentId: OLD_MANUAL, supersededBy: NEW_MANUAL, family: "jba policy manual" },
    ]);
    expect(JSON.stringify(plan)).not.toContain("delete");
  });

  it("uses a shared Woven policy id when the titles are editions of that policy", () => {
    const plan = planEditionSupersession([
      edition({
        documentId: OLD_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "content",
        title: "Attendance Policy",
        editedAt: "2025-01-01",
      }),
      edition({
        documentId: NEW_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "content",
        title: "Attendance Policy revised",
        editedAt: "2026-03-01",
      }),
    ]);
    expect(plan.supersede).toEqual([
      expect.objectContaining({ documentId: OLD_MANUAL, supersededBy: NEW_MANUAL }),
    ]);
  });

  it("does not treat a policy's text and its PDF as editions of each other", () => {
    const plan = planEditionSupersession([
      edition({
        documentId: OLD_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "content",
        title: "Attendance Policy",
        editedAt: "2024-01-01",
      }),
      edition({
        documentId: NEW_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "attachment:pdf-9",
        title: "Attendance Policy",
        editedAt: "2026-01-01",
      }),
    ]);
    expect(plan.supersede).toEqual([]);
  });

  it("leaves two different files on one policy indexed", () => {
    const plan = planEditionSupersession([
      edition({
        documentId: OLD_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "attachment:poster",
        title: "Opening poster",
        editedAt: "2024-01-01",
      }),
      edition({
        documentId: NEW_MANUAL,
        contentType: "policy",
        entityId: "policy-1",
        policyId: "policy-1",
        partKey: "attachment:schedule",
        title: "Weekly schedule",
        editedAt: "2026-01-01",
      }),
    ]);
    expect(plan.supersede).toEqual([]);
  });

  it("supersedes nothing when the edit date is missing or tied", () => {
    const pair = [
      edition({ documentId: OLD_MANUAL, title: "2025 JBA Policy Manual", editedAt: "2026-01-01" }),
      edition({ documentId: NEW_MANUAL, title: "2026 JBA Policy Manual", editedAt: null }),
    ];
    expect(planEditionSupersession(pair).supersede).toEqual([]);
    expect(
      planEditionSupersession([
        edition({ documentId: OLD_MANUAL, title: "2025 JBA Policy Manual", editedAt: "2026-01-01" }),
        edition({ documentId: NEW_MANUAL, title: "2026 JBA Policy Manual", editedAt: "2026-01-01" }),
      ]).supersede,
    ).toEqual([]);
  });

  it("does not connect unrelated documents", () => {
    expect(
      planEditionSupersession([
        edition({ documentId: OLD_MANUAL, title: "Cell Phone Policy", editedAt: "2024-01-01", contentType: "policy", partKey: "content" }),
        edition({ documentId: NEW_MANUAL, title: "Attendance Policy", editedAt: "2026-01-01", contentType: "policy", partKey: "content" }),
      ]).supersede,
    ).toEqual([]);
  });

  it("retrieval SQL cites only an indexed current edition", () => {
    const files = [
      "supabase/migrations/20260829000300_match_knowledge_chunks.sql",
      "supabase/migrations/20261023001000_knowledge_hybrid_search.sql",
      "supabase/migrations/20261023001200_knowledge_section_trgm.sql",
    ];
    for (const file of files) {
      const sql = readFileSync(join(process.cwd(), file), "utf8");
      expect(sql).toMatch(/d\.indexed = true/);
      expect(sql).toMatch(/d\.status = 'indexed'/);
    }
  });
});
