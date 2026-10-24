import { afterEach, describe, expect, it } from "vitest";

import { editionSupersessionEnabled } from "@/lib/config/chat-quality-flags";

import { holdOlderEditions } from "./edition";
import { knowledgeDocumentIdFor } from "./engine";
import { MemoryKnowledgeSink } from "./memory-store";
import type { ManifestItem } from "./types";

const FLAG = "EDITION_SUPERSESSION_ENABLED";
const previous = process.env[FLAG];

afterEach(() => {
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
});

const OLDER = "2024 JBA Policy Manual Master - Edited 10-2024";
const CURRENT = "JBA Policy Manual Edited 5.2025";
const ACK = "2025 JBA Policy Manual Master - Edited 5-2025 with acknowledgement";

function item(over: Pick<ManifestItem, "entityId" | "title" | "fileName"> & Partial<ManifestItem>): ManifestItem {
  return {
    source: "woven",
    contentType: "file_library",
    partKey: "file",
    status: "Published",
    audience: ["Public"],
    version: null,
    versionId: null,
    sourceUpdatedAt: "2025-05-01T00:00:00.000Z",
    documentId: over.entityId,
    attachmentIds: [],
    locator: { fileLibraryId: over.entityId },
    mimeType: "application/pdf",
    observedFingerprint: `fp-${over.entityId}`,
    syncedFingerprint: `fp-${over.entityId}`,
    contentHash: `hash-${over.entityId}`,
    knowledgeDocumentId: `doc-${over.entityId}`,
    inKnowledgeBase: true,
    state: "UNCHANGED",
    previousState: null,
    pendingAction: "none",
    reason: null,
    lastError: null,
    errorCategory: null,
    retryCount: 0,
    nextRetryAt: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-10-01T00:00:00.000Z",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("edition supersession flag", () => {
  it("stays off unless the flag is on", () => {
    delete process.env[FLAG];
    expect(editionSupersessionEnabled()).toBe(false);
    for (const value of ["", "0", "false", "off"]) {
      process.env[FLAG] = value;
      expect(editionSupersessionEnabled()).toBe(false);
    }
    process.env[FLAG] = "on";
    expect(editionSupersessionEnabled()).toBe(true);
  });
});

describe("an older edition is not ingested again", () => {
  const manuals = () => [
    item({
      entityId: "2024",
      title: OLDER,
      fileName: "2024-JBA.pdf",
      sourceUpdatedAt: "2024-11-02T00:00:00.000Z",
      pendingAction: "ingest",
      state: "UPDATED",
      observedFingerprint: "fp-2024-changed",
      contentHash: "hash-2024-old",
    }),
    item({ entityId: "edited", title: CURRENT, fileName: "JBA-Policy-Manual-Edited-5.2025.pdf" }),
    item({ entityId: "ack", title: ACK, fileName: "2025-ack.pdf" }),
  ];

  it("holds a changed older file so the apply loop skips it", () => {
    const held = holdOlderEditions(manuals(), knowledgeDocumentIdFor);
    const older = held.items.find((row) => row.entityId === "2024")!;
    expect(older).toMatchObject({
      pendingAction: "none",
      state: "EXCLUDED",
      reason: "older_edition",
      inKnowledgeBase: false,
      syncedFingerprint: "fp-2024-changed",
      knowledgeDocumentId: "doc-2024",
    });
    expect(held.plan.map((row) => row.documentId)).toEqual(["doc-2024"]);
    expect(["doc-edited", "doc-ack"]).toContain(held.plan[0]!.supersededBy);
    const due = held.items.filter((row) => row.pendingAction !== "none");
    expect(due.map((row) => row.entityId)).not.toContain("2024");
  });

  it("holds the older file again when a later scan would ingest it", () => {
    const first = holdOlderEditions(manuals(), knowledgeDocumentIdFor);
    const rescanned = first.items.map((row) =>
      row.entityId === "2024"
        ? {
            ...row,
            pendingAction: "ingest" as const,
            state: "UPDATED" as const,
            reason: null,
            inKnowledgeBase: true,
            observedFingerprint: "fp-2024-again",
            sourceUpdatedAt: "2024-12-01T00:00:00.000Z",
          }
        : row,
    );
    const second = holdOlderEditions(rescanned, knowledgeDocumentIdFor);
    expect(second.items.find((row) => row.entityId === "2024")).toMatchObject({
      pendingAction: "none",
      reason: "older_edition",
      inKnowledgeBase: false,
      syncedFingerprint: "fp-2024-again",
    });
  });
});

describe("memory sink", () => {
  it("hides a superseded edition and does not count it again", async () => {
    const sink = new MemoryKnowledgeSink();
    const bytes = new TextEncoder().encode("%PDF-1.4 old manual");
    await sink.ingest({
      documentId: "doc-2024",
      title: OLDER,
      description: "older",
      category: "other",
      tags: ["woven"],
      fileName: "2024-JBA.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    await sink.ingest({
      documentId: "doc-edited",
      title: CURRENT,
      description: "current",
      category: "other",
      tags: ["woven"],
      fileName: "JBA-Policy-Manual-Edited-5.2025.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 current manual"),
    });
    const before = sink.documents.get("doc-2024")!;
    expect(before.version).toBe(1);
    expect(sink.searchable().map((doc) => doc.id)).toContain("doc-2024");

    const first = await sink.supersedeEditions([{ documentId: "doc-2024", supersededBy: "doc-edited" }]);
    expect(first).toEqual({ superseded: 1 });
    const after = sink.documents.get("doc-2024")!;
    expect(after.version).toBe(1);
    expect(after.bytes).toEqual(bytes);
    expect(after.superseded).toBe(true);
    expect(after.supersededBy).toBe("doc-edited");
    expect(sink.searchable().map((doc) => doc.id)).not.toContain("doc-2024");
    expect(sink.searchable().map((doc) => doc.id)).toContain("doc-edited");

    const second = await sink.supersedeEditions([{ documentId: "doc-2024", supersededBy: "doc-edited" }]);
    expect(second).toEqual({ superseded: 0 });
    expect(sink.documents.get("doc-2024")).toMatchObject({ version: 1, superseded: true, supersededBy: "doc-edited" });
  });

  it("does not supersede against a missing or already superseded successor", async () => {
    const sink = new MemoryKnowledgeSink();
    await sink.ingest({
      documentId: "doc-2024",
      title: OLDER,
      description: "older",
      category: "other",
      tags: [],
      fileName: "2024-JBA.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.4"),
    });
    expect(await sink.supersedeEditions([{ documentId: "doc-2024", supersededBy: "missing" }])).toEqual({ superseded: 0 });
    expect(sink.documents.get("doc-2024")!.superseded).toBe(false);
    expect(sink.searchable().map((doc) => doc.id)).toContain("doc-2024");
  });
});
