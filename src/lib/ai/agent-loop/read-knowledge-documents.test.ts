import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AccessScope, KnowledgeDocument, Role } from "@/types";

import { DEFAULT_DATA_TOOL_DEPS, dataToolHandlers, readKnowledgeDocuments } from "./data-tools";

/**
 * read_knowledge_documents (port from the sibling app, 27 Nov 2026; CLAUDE.md §5): the Knowledge Base's document list,
 * for the administrators the page lets in (View knowledge AND the admin console) and no one else.
 */
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as unknown as AccessScope;
const ctx = (role: Role) => ({ actor: { role, scope: GLOBAL }, question: "which documents do we have?", scopeId: "corpus-1", today: "2026-11-27" });
const doc = (id: string, title: string, status: KnowledgeDocument["status"], updatedAt: string, extra: Partial<KnowledgeDocument> = {}): KnowledgeDocument => ({
  id, title, description: `${title}, the invented edition.`, category: "policies_compliance", fileName: `${id}.pdf`, fileType: "pdf", sizeBytes: 1000, characterCount: 500,
  status, source: "woven", version: 2, previousVersions: [], uploadedBy: "Invented Admin", uploadedAt: "2026-10-01T10:00:00Z", updatedAt, indexed: status === "ready", tags: [], ...extra,
});
const DOCS = [
  doc("d1", "Invented Policy Manual", "ready", "2026-11-20T10:00:00Z"),
  doc("d2", "Invented Cleaning Guide", "failed", "2026-11-25T10:00:00Z", { failureReason: "The file had no readable text.", source: "upload" }),
  doc("d3", "Invented Shelf Checklist", "processing", "2026-11-26T10:00:00Z"),
];
type Out = { documents?: { title: { untrusted_text: string }; status: string; source: string; why_it_failed?: { untrusted_text: string } }[]; by_status?: Record<string, number>; total?: number; refused?: string; error?: string };

async function read(role: Role, input: Record<string, unknown> = {}, load: () => Promise<readonly KnowledgeDocument[]> = async () => DOCS) {
  const seen: string[] = [];
  const out = (await readKnowledgeDocuments(ctx(role), input, { ...DEFAULT_DATA_TOOL_DEPS, loadKnowledgeDocuments: async (scopeId) => (seen.push(scopeId), load()) })) as Out;
  return { out, seen };
}

describe("read_knowledge_documents", () => {
  it("an administrator gets every document, newest change first, with its status, source and a failed one's reason, and the counts by status", async () => {
    const { out, seen } = await read("admin");
    expect(seen, "read for this deployment's own corpus").toEqual(["corpus-1"]);
    expect(out.documents?.map((entry) => entry.title.untrusted_text)).toEqual(["Invented Shelf Checklist", "Invented Cleaning Guide", "Invented Policy Manual"]);
    expect(out.documents?.[1]).toMatchObject({ status: "Failed", source: "Uploaded", why_it_failed: { untrusted_text: "The file had no readable text." } });
    expect(out.by_status).toEqual({ Ready: 1, Processing: 1, Failed: 1 });
  });

  it("query and status narrow the list; the counts still cover every document", async () => {
    expect((await read("admin", { query: "the policy manual" })).out.documents?.map((entry) => entry.title.untrusted_text)).toEqual(["Invented Policy Manual"]);
    const failed = (await read("admin", { status: "failed" })).out;
    expect(failed.documents?.map((entry) => entry.title.untrusted_text)).toEqual(["Invented Cleaning Guide"]);
    expect(failed.by_status).toEqual({ Ready: 1, Processing: 1, Failed: 1 });
  });

  it("a role with View knowledge but no admin console (a location manager) is refused and reads nothing", async () => {
    const { out, seen } = await read("location_manager");
    expect(out.refused).toBeTruthy();
    expect(out.documents).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it("a read that fails names no document and no count", async () => {
    const { out } = await read("admin", {}, async () => {
      throw new Error("down");
    });
    expect(out.error).toBeTruthy();
    expect(out.documents).toBeUndefined();
    expect(out.by_status).toBeUndefined();
  });

  it("is one of the loop's handlers", () => {
    expect(Object.keys(dataToolHandlers(ctx("admin")))).toContain("read_knowledge_documents");
  });
});
