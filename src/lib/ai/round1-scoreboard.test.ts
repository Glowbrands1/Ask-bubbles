import { readdirSync, readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { RETRIEVAL } from "@/lib/config/models";
import {
  caPolicyRetrievalEnabled,
  chatTraceEnabled,
  crossChatDraftDedupeEnabled,
  editionSupersessionEnabled,
  formStateEnabled,
  globalStoreAskEnabled,
  priorRecordFinalOnlyEnabled,
} from "@/lib/config/chat-quality-flags";
import { JOIN } from "@/lib/forms/bounded-context";
import { describesLateOpening, readCaPolicy, statedOffenseKeys } from "@/lib/forms/ca-policy";
import { renderFormRecordsBlock, splitRecordDrafts } from "@/lib/forms/chat-form-records";
import type { InstanceRow } from "@/lib/forms/instances";
import { pickCrossChatOpenDraft } from "@/lib/forms/cross-chat-draft";
import { globalStoreAskLine } from "@/lib/forms/global-store-ask";
import { sectionHeadingsFor } from "@/lib/forms/official-policy-manual";
import { readEmployeeMentions, statedJobTitle } from "@/lib/forms/proposal";
import { rerankCaPolicyChunks, type CaPolicyChunk } from "@/lib/knowledge/ca-policy-retrieval";
import { dedupeIdenticalSections, holdOlderEditions } from "@/lib/knowledge-sync/edition";
import { knowledgeDocumentIdFor } from "@/lib/knowledge-sync/engine";
import type { ManifestItem } from "@/lib/knowledge-sync/types";
import type { AccessScope } from "@/types";

/**
 * Round 1, flags off against flags on, one run.
 * Local only. The Supabase client in this file is an in-memory recorder.
 * It does not open a network connection.
 */

const writes = vi.hoisted(() => ({ rows: [] as { table: string; op: string }[] }));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: async () => {
          writes.rows.push({ table, op: "upsert" });
          return { error: null };
        },
        insert: async () => {
          writes.rows.push({ table, op: "insert" });
          return { error: null };
        },
      };
      return api;
    },
  }),
}));

const { finishChatTrace, openChatTrace } = await import("./chat-trace");
const { deliverFormProposal } = await import("./grounded-turn");

const TOP = RETRIEVAL.topK;
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAGS = [
  "ANTI_LOOP_ENABLED",
  "TYPED_NAME_ENABLED",
  "CA_POLICY_RETRIEVAL_ENABLED",
  "PRIOR_RECORD_FINAL_ONLY_ENABLED",
  "CROSS_CHAT_DRAFT_DEDUPE_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "EDITION_SUPERSESSION_ENABLED",
  "FORM_STATE_ENABLED",
  "CHAT_TRACE_ENABLED",
  "SELF_CHECK_ENABLED",
] as const;

const NAME_LINE = "Name: Evangeline Pembury, job title tanning consultant";
const JANE = "create a coaching form for Jane Store";
const LATE = "create verbal ca for Test Employee for opening store late on 10-1-26";
const TARDY = "employee was tardy, showed up late for shift again";
const SLIPPERS = "write a CA for slippers and the wrong uniform";
const INSUBORDINATION = "CA for insubordination, she did not acknowledge policies at onboarding";
const OPENED = "store opened late";
const PREVIOUS = "does employee wren halvorsen have previous coachings";

function record(status: InstanceRow["status"]): InstanceRow {
  return {
    id: status,
    templateId: "t",
    templateKey: "coaching",
    templateName: "Coaching",
    templateShortName: "Coaching",
    layoutFamily: "coaching",
    templateVersionId: "v",
    templateVersion: 1,
    variantKey: null,
    employeeName: "Wren Halvorsen",
    employeeRole: null,
    locationId: null,
    locationName: null,
    createdBy: "manager",
    createdByRole: null,
    source: "assistant",
    status,
    formDate: "2026-10-01",
    followUpDate: null,
    followedUpAt: null,
    followedUpBy: null,
    finalizedAt: status === "finalized" ? "2026-10-02T00:00:00.000Z" : null,
    exportedAt: null,
    archivedAt: null,
    revisesInstanceId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

function clearFlags() {
  for (const name of FLAGS) delete process.env[name];
}

function manual(section: string): CaPolicyChunk {
  return { document_title: "JBA Policy Manual Edited 5.2025", section };
}

function fixture(): CaPolicyChunk[] {
  return [
    ...Array.from({ length: TOP }, (_, index) => ({
      document_title: "Ask Bubbles Performance Framework",
      section: `Framework section ${index + 1}`,
    })),
    manual("Standards of Conduct"),
    manual("Attendance"),
    manual("Dress Code for The Company"),
    manual("Late Opening"),
  ];
}

function topSection(query: string, boost: boolean): string {
  const rows = fixture();
  const ranked = boost ? rerankCaPolicyChunks(rows, query, TOP) : rows.slice(0, TOP);
  return ranked[0]?.section ?? "(none)";
}

function outside(section: string): string {
  const index = fixture().findIndex((row) => row.section === section);
  return `outside top ${TOP} (rank ${index + 1})`;
}

function editionItem(entityId: string, title: string): ManifestItem {
  return {
    source: "woven",
    contentType: "file_library",
    entityId,
    partKey: "file",
    title,
    status: "Published",
    audience: ["Public"],
    version: null,
    versionId: null,
    sourceUpdatedAt: "2025-05-01T00:00:00.000Z",
    documentId: entityId,
    attachmentIds: [],
    locator: { fileLibraryId: entityId },
    mimeType: "application/pdf",
    fileName: `${title}.pdf`,
    observedFingerprint: `fp-${entityId}`,
    syncedFingerprint: `fp-${entityId}`,
    contentHash: `hash-${entityId}`,
    knowledgeDocumentId: `doc-${entityId}`,
    inKnowledgeBase: true,
    state: "UPDATED",
    previousState: null,
    pendingAction: "ingest",
    reason: null,
    lastError: null,
    errorCategory: null,
    retryCount: 0,
    nextRetryAt: null,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-10-01T00:00:00.000Z",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function formWrites(enabled: boolean): Promise<number> {
  const before = writes.rows.length;
  if (enabled) process.env.FORM_STATE_ENABLED = "1";
  else delete process.env.FORM_STATE_ENABLED;
  await deliverFormProposal({
    request: {
      question: "coaching for Jane Store",
      mode: "standard",
      history: [],
      scopeId: "local-scope",
      conversationId: "conv-round1",
      context: { userName: "Round One", locationName: "Global", todayIso: "2026-10-24" },
    },
    actor: { role: "district_manager", scope: SCOPE, subject: "user-round1" },
    question: "coaching for Jane Store",
    propose: async () => ({ content: "Ready.", citations: [] }),
    decorate: async (response) => response,
  });
  return writes.rows.slice(before).filter((row) => row.table === "chat_form_state" && row.op === "upsert").length;
}

async function traceWrites(enabled: boolean): Promise<number> {
  const before = writes.rows.length;
  if (!enabled) return 0;
  process.env.CHAT_TRACE_ENABLED = "on";
  await finishChatTrace(
    openChatTrace({
      conversationId: "conv-round1",
      messageId: "msg-round1",
      userId: "user-round1",
      originalQuery: "where is the attendance policy",
      formInProgress: false,
    }),
    async () => "ok",
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  return writes.rows.slice(before).filter((row) => row.table === "chat_traces" && row.op === "insert").length;
}

async function measure(): Promise<Record<string, { old: string; neu: string }>> {
  clearFlags();
  const namesOff = readEmployeeMentions(NAME_LINE).names.map((name) => name.toLowerCase()).join(", ") || "(none)";
  const janeOff = readEmployeeMentions(JANE).names.join(", ") || "(none)";
  const titleOff = statedJobTitle(NAME_LINE) ?? "(none)";
  const labelOff = readEmployeeMentions("Job title").names.join(", ") || "(none)";
  process.env.ANTI_LOOP_ENABLED = "1";
  process.env.TYPED_NAME_ENABLED = "1";
  const namesOn = readEmployeeMentions(NAME_LINE).names.map((name) => name.toLowerCase()).join(", ") || "(none)";
  const janeOn = readEmployeeMentions(JANE).names.join(", ") || "(none)";
  const titleOn = statedJobTitle(NAME_LINE) ?? "(none)";
  const labelOn = readEmployeeMentions("Job title").names.join(", ") || "(none)";
  clearFlags();

  const lateNamed = [LATE, "attendance"].join(JOIN);
  const lateHeadings = sectionHeadingsFor({
    offenseKeys: statedOffenseKeys(readCaPolicy(lateNamed), lateNamed) ?? [],
    notes: LATE,
  })
    .flat()
    .join(", ");

  clearFlags();
  const recordRows = [record("finalized"), record("draft")];
  const draftsOff = splitRecordDrafts(PREVIOUS, recordRows);
  const renderedOff = renderFormRecordsBlock({
    visibility: SCOPE,
    words: ["wren", "halvorsen"],
    matches: { named: draftsOff.onFile, possible: [] },
    recent: [],
    notOnFile: draftsOff.notOnFile,
    today: "2026-10-24",
  });
  process.env.PRIOR_RECORD_FINAL_ONLY_ENABLED = "1";
  const draftsOn = splitRecordDrafts(PREVIOUS, recordRows);
  const renderedOn = renderFormRecordsBlock({
    visibility: SCOPE,
    words: ["wren", "halvorsen"],
    matches: { named: draftsOn.onFile, possible: [] },
    recent: [],
    notOnFile: draftsOn.notOnFile,
    today: "2026-10-24",
  });
  clearFlags();

  const draftRow = {
    id: "draft-other-chat",
    templateKey: "coaching",
    employeeName: "Daisley",
    formDate: "2026-10-01",
    status: "draft",
    createdAt: "2026-10-21T12:00:00Z",
    createdBy: "other-manager",
  };
  const picked = pickCrossChatOpenDraft([draftRow], {
    templateKey: "coaching",
    employeeName: "Daisley",
    formDate: "2026-10-01",
  });
  const otherDate = pickCrossChatOpenDraft([draftRow], {
    templateKey: "coaching",
    employeeName: "Daisley",
    formDate: "2026-10-02",
  });

  const askInput = {
    role: "district_manager" as const,
    scope: SCOPE,
    storeResolved: false,
    employeeName: "Jane Store",
    assistantMessages: [] as string[],
  };
  const askOff = globalStoreAskLine(askInput);
  process.env.GLOBAL_STORE_ASK_ENABLED = "1";
  const askOn = globalStoreAskLine(askInput);
  const askAgain = globalStoreAskLine({ ...askInput, assistantMessages: [askOn ?? ""] });
  const askAdmin = globalStoreAskLine({ ...askInput, role: "admin" });
  clearFlags();

  const older = editionItem("2024", "2024 JBA Policy Manual Master - Edited 10-2024");
  const current = editionItem("edited", "JBA Policy Manual Edited 5-2025");
  const heldOff = older.pendingAction;
  process.env.EDITION_SUPERSESSION_ENABLED = "on";
  const held = holdOlderEditions([older, current], knowledgeDocumentIdFor);
  const olderHeld = held.items.find((row) => row.entityId === "2024")!;
  const section = "Team members must arrive on time and call the store if they will be late.";
  const deduped = dedupeIdenticalSections([
    { document_id: "d4aeefbb", document_title: older.title, section: "Attendance", content: section, similarity: 0.9 },
    { document_id: "ce6b00f1", document_title: current.title, section: "Attendance", content: section, similarity: 0.4 },
  ]);
  clearFlags();

  const formOff = await formWrites(false);
  clearFlags();
  const formOn = await formWrites(true);
  clearFlags();
  const traceOff = chatTraceEnabled() ? await traceWrites(true) : 0;
  clearFlags();
  const traceOn = await traceWrites(true);
  clearFlags();

  return {
    "Name: value": { old: namesOff, neu: namesOn },
    "Name: job title": { old: titleOff, neu: titleOn },
    "Jane Store": { old: janeOff, neu: janeOn },
    "Job title alone": { old: labelOff, neu: labelOn },
    "SoC, insubordination": { old: outside("Standards of Conduct"), neu: topSection(INSUBORDINATION, true) },
    "Dress Code, slippers": { old: outside("Dress Code for The Company"), neu: topSection(SLIPPERS, true) },
    "Attendance, tardy": { old: outside("Attendance"), neu: topSection(TARDY, true) },
    "Late Opening, store opened late": { old: outside("Late Opening"), neu: topSection(OPENED, true) },
    "Policy matcher, opening the store late": {
      old: describesLateOpening(LATE) ? lateHeadings : "not Late Opening",
      neu: describesLateOpening(LATE) ? lateHeadings : "not Late Opening",
    },
    "Policy matcher, tardy": {
      old: describesLateOpening(TARDY) ? "Late Opening" : "Attendance",
      neu: describesLateOpening(TARDY) ? "Late Opening" : "Attendance",
    },
    "chat_form_state writes": { old: String(formOff), neu: String(formOn) },
    "chat_traces writes": { old: String(traceOff), neu: String(traceOn) },
    "Cross-chat draft": {
      old: crossChatDraftDedupeEnabled() ? "reuses" : "creates",
      neu: picked ? `reuses ${picked}` : "creates",
    },
    "Cross-chat, different date": { old: "creates", neu: otherDate ?? "creates" },
    "Previous coaching drafts": {
      old: renderedOff.includes("Not on file. These drafts are not previous coaching:") ? "not on file section" : "draft stays in the on-file list",
      neu: renderedOn.includes("Not on file. These drafts are not previous coaching:") ? "Not on file. These drafts are not previous coaching:" : "missing",
    },
    "Store ask, district manager": { old: askOff ?? "not asked", neu: askOn?.includes("Which store is this for?") ? "asked once" : "not asked" },
    "Store ask, already asked": { old: "not asked", neu: askAgain ?? "not asked again" },
    "Store ask, admin": { old: "not asked", neu: askAdmin ?? "not asked" },
    "Sync guard, 2024 manual": {
      old: `flag off, pending ${heldOff}`,
      neu: `${olderHeld.pendingAction} ${olderHeld.reason}`,
    },
    "Identical section": { old: "both copies", neu: deduped.map((row) => row.document_id).join(", ") },
  };
}

const EXPECTED: Record<string, { old: string; neu: string }> = {
  "Name: value": { old: "evangeline pembury", neu: "evangeline pembury" },
  "Name: job title": { old: "(none)", neu: "Tanning Consultant" },
  "Jane Store": { old: "Jane", neu: "Jane Store" },
  "Job title alone": { old: "Job title", neu: "(none)" },
  "SoC, insubordination": { old: "outside top 14 (rank 15)", neu: "Standards of Conduct" },
  "Dress Code, slippers": { old: "outside top 14 (rank 17)", neu: "Dress Code for The Company" },
  "Attendance, tardy": { old: "outside top 14 (rank 16)", neu: "Attendance" },
  "Late Opening, store opened late": { old: "outside top 14 (rank 18)", neu: "Late Opening" },
  "Policy matcher, opening the store late": { old: "Late Opening", neu: "Late Opening" },
  "Policy matcher, tardy": { old: "Attendance", neu: "Attendance" },
  "chat_form_state writes": { old: "0", neu: "1" },
  "chat_traces writes": { old: "0", neu: "1" },
  "Cross-chat draft": { old: "creates", neu: "reuses draft-other-chat" },
  "Cross-chat, different date": { old: "creates", neu: "creates" },
  "Previous coaching drafts": {
    old: "draft stays in the on-file list",
    neu: "Not on file. These drafts are not previous coaching:",
  },
  "Store ask, district manager": { old: "not asked", neu: "asked once" },
  "Store ask, already asked": { old: "not asked", neu: "not asked again" },
  "Store ask, admin": { old: "not asked", neu: "not asked" },
  "Sync guard, 2024 manual": { old: "flag off, pending ingest", neu: "none older_edition" },
  "Identical section": { old: "both copies", neu: "ce6b00f1" },
};

describe("round 1 scoreboard, one run", () => {
  afterEach(() => {
    clearFlags();
    writes.rows.length = 0;
  });

  it("flags off and flags on agree", async () => {
    expect(caPolicyRetrievalEnabled()).toBe(false);
    expect(formStateEnabled()).toBe(false);
    expect(chatTraceEnabled()).toBe(false);
    expect(priorRecordFinalOnlyEnabled()).toBe(false);
    expect(crossChatDraftDedupeEnabled()).toBe(false);
    expect(globalStoreAskEnabled()).toBe(false);
    expect(editionSupersessionEnabled()).toBe(false);
    expect(readFileSync("src/lib/ai/server-ask.ts", "utf8")).toContain("if (!chatTraceEnabled()) return answerQuestionBody");
    expect(readFileSync("src/lib/ai/grounded-turn.ts", "utf8")).toContain(
      "if (!enabled || !input.actor.subject || !input.request.conversationId) return",
    );
    const engine = readFileSync("src/lib/knowledge-sync/engine.ts", "utf8");
    expect(engine.indexOf('if (options.mode === "preview")')).toBeLessThan(engine.lastIndexOf("holdOlderEditions("));
    // The removed location-mapping migration stays removed. It is matched by its
    // timestamp and suffix: the file name carried a real person's name.
    expect(
      readdirSync("supabase/migrations").filter(
        (file) => file.startsWith("20261024180000_") || file.endsWith("_unmapped_woven_locations_review.sql"),
      ),
    ).toEqual([]);

    const run = await measure();
    expect(run).toEqual(EXPECTED);
    expect(pickedStable(run["Cross-chat draft"].neu)).toBe("draft-other-chat");
  });
});

function pickedStable(value: string): string {
  return value.replace("reuses ", "");
}
