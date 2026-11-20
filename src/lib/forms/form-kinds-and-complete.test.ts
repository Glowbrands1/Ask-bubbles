import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope } from "@/types";

/*
 * Port from Ask Sunny #1133 (QA's code audit on Ask Sunny main 9e1d1f67, items 28 and 29), on this app's shared Forms
 * Register reader (`forms/chat-form-records.ts`), which both the regular chat's FORMS ON FILE block and the Leadership
 * Assistant's forms tool read:
 * - Item 28: the "coaching" kind reads template names with ilike "%coaching%", so a Follow-Up Coaching Form was counted
 *   as a coaching.
 * - Item 29: a list read by date or kind was called complete ("This is every … form this user can see") when fewer than
 *   100 rows were left AFTER the visibility filter, though the read had returned its full 100.
 *
 * The read and the visibility filter are faked here so each half can be set: `read.rows` are what the database
 * returned, `read.visible` how many the visibility filter keeps. Names and stores are invented.
 */
const read = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, visible: Infinity, asked: [] as number[] }));

vi.mock("server-only", () => ({}));
vi.mock("./instances", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./instances")>()),
  listInstances: async (_shelf: string, limit: number, filter?: { templateNameWords?: string[] }) => {
    read.asked.push(limit);
    const words = filter?.templateNameWords ?? [];
    // The real read: template-name words matched as part of the name (ilike), so "coaching" also reads a follow-up.
    const rows = words.length === 0 ? read.rows : read.rows.filter((row) => words.some((word) => String(row.templateName).toLowerCase().includes(word)));
    return rows.slice(0, limit);
  },
}));
vi.mock("./instance-scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./instance-scope")>()),
  visibleInstances: <T,>(_actor: unknown, rows: T[]) => rows.slice(0, read.visible),
  instanceListFilterFor: () => ({}),
}));
vi.mock("./forms-visibility", () => ({
  resolveFormsVisibility: async () => ({ level: "location", primaryAreaId: "loc-0309", alsoCoversAreaIds: [] }),
}));

const { loadFormRecords, ofKind, formKindFromText } = await import("./chat-form-records");

const STORE: AccessScope = { level: "location", primaryAreaId: "loc-0309", alsoCoversAreaIds: [] };
const MANAGER = { subject: "manager-1", verified: true, role: "location_manager" as const, scope: STORE };

function form(index: number, templateName: string, employeeName: string) {
  return {
    id: `inst-${index}`,
    templateName,
    templateKey: templateName.startsWith("Follow") ? "follow_up_coaching" : templateName.startsWith("Coaching") ? "coaching" : "dpoa",
    templateShortName: templateName,
    employeeName,
    status: "finalized",
    formDate: "2026-11-10",
    locationId: "loc-0309",
    locationName: "Omaha, West Dodge Rd",
    createdBy: "another-manager",
    createdAt: `2026-11-10T15:00:${String(index % 60).padStart(2, "0")}Z`,
  };
}

beforeEach(() => {
  read.rows = [];
  read.visible = Infinity;
  read.asked = [];
});

describe("Coaching never counts a Follow-Up Coaching Form (Sunny item 28)", () => {
  it("ofKind: the Coaching kind drops follow-ups; the Follow-Up Coaching kind keeps them; no kind keeps every row", () => {
    const rows = [{ templateName: "Coaching Form" }, { templateName: "Follow-Up Coaching Form" }];
    expect(ofKind(rows, formKindFromText("coaching"))).toEqual([{ templateName: "Coaching Form" }]);
    // Which rows ARE the kind is the read's job (templateNameWords); ofKind only drops the excluded words.
    expect(ofKind(rows, formKindFromText("follow-up coaching"))).toContainEqual({ templateName: "Follow-Up Coaching Form" });
    expect(ofKind(rows, null)).toHaveLength(2);
  });

  it('"how many coachings did we do at my store this month?" lists the coachings and leaves the follow-ups out', async () => {
    read.rows = [form(1, "Coaching Form", "Marlo Pennick"), form(2, "Follow-Up Coaching Form", "Tamsin Okafor"), form(3, "Coaching Form", "Bexley Rourke")];
    const block = (await loadFormRecords({ actor: MANAGER, question: "how many coachings did we do at my store this month?", today: "2026-11-14", narrowFromQuestion: true }))!.block;
    expect(block).toContain("Marlo Pennick");
    expect(block).toContain("Bexley Rourke");
    expect(block, block).not.toContain("Tamsin Okafor");
    expect(block).toContain("(2)");
  });

  it("the Leadership Assistant's tool (form: \"coaching\") reads the same: no follow-up", async () => {
    read.rows = [form(1, "Coaching Form", "Marlo Pennick"), form(2, "Follow-Up Coaching Form", "Tamsin Okafor")];
    const block = (await loadFormRecords({ actor: MANAGER, question: "coaching", today: "2026-11-14", narrowFromQuestion: true, kind: formKindFromText("coaching") }))!.block;
    expect(block).toContain("Marlo Pennick");
    expect(block).not.toContain("Tamsin Okafor");
  });
});

describe("a cut-off list is never called complete (Sunny item 29)", () => {
  const QUESTION = "who got a CA this month?";

  it("a read that came back full (100) is never every such form, however many the visibility filter leaves (60)", async () => {
    read.rows = Array.from({ length: 140 }, (_, index) => form(index, "Corrective Action Form", `Person ${index}`));
    read.visible = 60;
    const block = (await loadFormRecords({ actor: MANAGER, question: QUESTION, today: "2026-11-14", narrowFromQuestion: true }))!.block;
    expect(read.asked.at(-1)).toBe(100);
    expect(block).toContain("(60)");
    expect(block, block.slice(-400)).toContain("This list stops at 100 forms");
    expect(block).not.toContain("Never say the list is capped");
  });

  it("a read that came back short (40) is every such form", async () => {
    read.rows = Array.from({ length: 40 }, (_, index) => form(index, "Corrective Action Form", `Person ${index}`));
    const block = (await loadFormRecords({ actor: MANAGER, question: QUESTION, today: "2026-11-14", narrowFromQuestion: true }))!.block;
    expect(block).toContain("Never say the list is capped");
    expect(block).not.toContain("This list stops at");
  });

  it("a named list read at its cap of 50 is never called every such form", async () => {
    read.rows = Array.from({ length: 60 }, (_, index) => form(index, "Corrective Action Form", "Rowan Ashby"));
    const block = (await loadFormRecords({ actor: MANAGER, question: "has Rowan Ashby had any write-ups this month?", today: "2026-11-14", narrowFromQuestion: true }))!.block;
    expect(block).toContain("Rowan Ashby");
    expect(block, block.slice(-400)).toContain("This list stops at 50 forms");
    expect(block).not.toContain("Never say the list is capped");
  });
});
