import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InstanceValueRow, LoadedInstance } from "./instances";

/**
 * ============================================================================
 * A CORRECTION REPLACES ONLY THE WORDS THE MANAGER NAMED (step 2b, QA)
 * ============================================================================
 *
 * FORM_EDIT_SINGLE_WRITER_ENABLED. In 2a the correction's preset skipped the
 * `drops_words` rule (the one deviation from the design); QA made it a
 * condition of the flip: a correction may replace only the words the manager
 * named, never rewrite the rest of the line. A Corrective Action for Marnie
 * Quill whose Observation reads "Marnie Quill was late to open on 10-20-26.",
 * and QA's three wordings of the same correction. In each, "Marnie" and the
 * rest of the sentence survive: a write that would drop a word she did not
 * name is refused, all or nothing, nothing is written, the reply never says
 * "Updated", and the turn goes on (handoff "refused").
 *
 * The one writer is run over the form held in memory; `instances.ts`
 * (protected) is stood in for by fakes that write rows the way it does. People
 * are invented.
 */

const rows = vi.hoisted(() => ({ list: [] as InstanceValueRow[], calls: [] as string[], employeeName: "Marnie Quill" }));

function put(fieldKey: string, value: string | string[], filledBy: string) {
  const at = rows.list.findIndex((row) => row.fieldKey === fieldKey);
  const row = {
    fieldKey,
    value: typeof value === "string" ? value : null,
    checked: typeof value === "string" ? [] : value,
    filledBy,
    provenance: {},
  } as unknown as InstanceValueRow;
  if (at >= 0) rows.list[at] = row;
  else rows.list.push(row);
}

vi.mock("./instances", () => ({
  loadInstance: async () => form(),
  findOpenRevision: async () => null,
  recordChatCorrection: async () => {},
  saveInstanceValues: async (_id: string, submitted: { values: Record<string, string>; checked: Record<string, string[]> }) => {
    rows.calls.push(`saveInstanceValues:${Object.keys(submitted.values).join(",")}`);
    for (const [key, value] of Object.entries(submitted.values)) put(key, value, "manager");
    return { rejected: [], values: submitted.values };
  },
  applyAssistantDraft: async () => {
    rows.calls.push("applyAssistantDraft");
    return { accepted: { values: {}, checked: {} }, rejected: [], policyRefused: [] };
  },
  applyAssistantRevision: async () => {
    rows.calls.push("applyAssistantRevision");
    return { accepted: { values: {}, checked: {} }, cleared: [], rejected: [] };
  },
  applyStatedFacts: async () => {
    rows.calls.push("applyStatedFacts");
    return [];
  },
}));
vi.mock("./ca-action-plan-sync", () => ({ syncCorrectiveActionPlan: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) }),
}));
vi.mock("./instance-scope", () => ({
  authorizeInstance: async () => ({ actor: { id: "qa", role: "location_manager", verified: true, scope: null }, loaded: form() }),
}));

let caDocument: unknown = null;
let coachingDocument: unknown = null;
let template: "dpoa" | "coaching" = "dpoa";
function form(): LoadedInstance {
  return {
    instance: {
      id: "ca-1",
      status: "draft",
      variantKey: null,
      employeeName: rows.employeeName,
      employeeRole: "Team Member",
      locationName: "Omaha",
      formDate: "2026-10-20",
      templateKey: template,
      templateName: template === "dpoa" ? "Corrective Action Form" : "Coaching Form",
    },
    version: { document: template === "dpoa" ? caDocument : coachingDocument },
    values: rows.list.map((row) => ({ ...row, checked: [...row.checked] })),
    events: [],
  } as unknown as LoadedInstance;
}

const OBSERVATION = "Marnie Quill was late to open on 10-20-26.";
const WORDINGS = ["fix her last name, it is Quill-Hart", "fix her last name, it is Marnie Quill-Hart", "Quill-Hart"] as const;

beforeEach(async () => {
  const library = await import("./library");
  caDocument ??= library.correctiveActionDocument();
  coachingDocument ??= library.coachingDocument();
  template = "dpoa";
  rows.list = [];
  rows.calls = [];
  rows.employeeName = "Marnie Quill";
  put("employee_name", "Marnie Quill", "system");
  put("observation", OBSERVATION, "ai");
});

const observation = () => rows.list.find((row) => row.fieldKey === "observation")?.value;
const employeeLine = () => rows.list.find((row) => row.fieldKey === "employee_name")?.value;

async function correct(said: string, values: Record<string, string>) {
  const { correctionWrite } = await import("./form-write");
  return correctionWrite({
    instanceId: "ca-1",
    loaded: form(),
    stated: { values, checked: {} },
    actorId: "qa",
    said,
    today: "2026-10-21",
    readerValues: Object.values(values),
  });
}

describe.each(WORDINGS)('the correction "%s": only the words she named are replaced', (said) => {
  /*
   * Each write below drops a word of the line the manager did not name (or,
   * for "Marnie", named only as part of the name she gives). Before 2b the
   * correction's preset had no `drops_words` rule and each was saved.
   */
  const dropping: readonly [string, Record<string, string>][] = [
    ["the Employee Name line becomes the bare last name (Marnie dropped)", { employee_name: "Quill-Hart" }],
    ["the Observation loses 'to open' while the name is fixed", { observation: "Marnie Quill-Hart was late on 10-20-26." }],
    ["the Observation keeps the name but loses the rest of the account", { observation: "Marnie Quill-Hart was late." }],
  ];

  it.each(dropping)("refused, nothing written: %s", async (_case, values) => {
    const saved = await correct(said, values);
    expect(saved.result.handoff).toBe("refused");
    expect(saved.result.refused.map((refusal) => refusal.reason)).toContain("drops_words");
    expect(saved.result.changed).toEqual([]);
    expect(saved.nothingChanged).toBeUndefined();
    expect(saved.values).toEqual({});
    expect(rows.calls).toEqual([]);
    // "Marnie" and the rest of the sentence survive.
    expect(observation()).toBe(OBSERVATION);
    expect(employeeLine()).toBe("Marnie Quill");
  });

  it("refused with the Observation and the name together: one dropping write refuses both (all or nothing)", async () => {
    const saved = await correct(said, { employee_name: "Marnie Quill-Hart", observation: "Quill-Hart was late on 10-20-26." });
    expect(saved.result.handoff).toBe("refused");
    expect(rows.calls).toEqual([]);
    expect(observation()).toBe(OBSERVATION);
    expect(employeeLine()).toBe("Marnie Quill");
  });

  it('accepted: "Quill" becomes "Quill-Hart" and every other word stays', async () => {
    const saved = await correct(said, { employee_name: "Marnie Quill-Hart", observation: "Marnie Quill-Hart was late to open on 10-20-26." });
    expect(saved.result.handoff).toBeNull();
    expect(employeeLine()).toBe("Marnie Quill-Hart");
    expect(observation()).toBe("Marnie Quill-Hart was late to open on 10-20-26.");
  });
});

describe('"fix her last name, it is Marnie Quill-Hart": naming Marnie in the new name is not leave to drop her', () => {
  it("the live replace (the Observation as 'Quill-Hart was late to open on 10-20-26.') is refused", async () => {
    const saved = await correct(WORDINGS[1], { observation: "Quill-Hart was late to open on 10-20-26." });
    expect(saved.result.refused).toEqual([{ key: "observation", reason: "drops_words" }]);
    expect(observation()).toBe(OBSERVATION);
  });
});

/*
 * Through the chat: a header correction the readers read whole, whose value
 * would drop the first name, on a Coaching Form (the Corrective Action's name
 * line is not chat-correctable). With the flag on the write is refused, the
 * correction answers nothing (null) and the turn goes on to the rest of the
 * chain; it never claims "Updated". Flag off: today's save, unchanged.
 */
describe("through correctActiveForm: a refused correction hands the turn off and never says Updated", () => {
  const ask = async () => {
    const { correctActiveForm } = await import("./chat-correction");
    return correctActiveForm({
      request: new Request("http://localhost/api/chat"),
      instanceId: "ca-1",
      question: "change her name to Quill-Hart",
      today: "2026-10-21",
    });
  };

  beforeEach(() => {
    template = "coaching";
    rows.list = [];
    put("employee_name", "Marnie Quill", "system");
    put("coaching_details", "Marnie Quill was late to open on 10-20-26.", "ai");
  });

  it("flag on: refused (drops_words), nothing saved, no reply claiming an update", async () => {
    vi.stubEnv("FORM_EDIT_SINGLE_WRITER_ENABLED", "true");
    try {
      const reply = await ask();
      expect(reply?.content ?? "").not.toMatch(/Updated/);
      expect(reply?.formUpdate).toBeUndefined();
      expect(rows.calls).toEqual([]);
      expect(employeeLine()).toBe("Marnie Quill");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("flag off: unchanged — today's save of the header line", async () => {
    vi.stubEnv("FORM_EDIT_SINGLE_WRITER_ENABLED", "");
    try {
      const reply = await ask();
      expect(reply?.content).toMatch(/^Updated the \*\*Coaching Form\*\*/);
      expect(rows.calls).toEqual(["saveInstanceValues:employee_name"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
