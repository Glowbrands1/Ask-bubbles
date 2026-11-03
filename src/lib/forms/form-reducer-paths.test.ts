import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InstanceValueRow, LoadedInstance } from "./instances";

/*
 * FORM_PATCH_ALL_PATHS_ENABLED (Step B, all paths; QA 4 Nov 2026): the
 * correction save, the redraft's claim and the same-form copy through the
 * form reducer. The writers are spies: what matters is what reaches them, and
 * what the caller is told was saved.
 */

const writes = vi.hoisted(() => ({
  saved: [] as { values: Record<string, string>; checked: Record<string, string[]> }[],
  drafted: [] as { draft: unknown; provenance: unknown }[],
  loaded: null as LoadedInstance | null,
  reloaded: null as LoadedInstance | null,
}));

vi.mock("./instances", () => ({
  saveInstanceValues: vi.fn(async (_id: string, submitted: { values: Record<string, string>; checked: Record<string, string[]> }) => {
    writes.saved.push(submitted);
    return { rejected: [], values: submitted.values };
  }),
  applyAssistantDraft: vi.fn(async (_id: string, draft: unknown, _actor: string, provenance: unknown) => {
    writes.drafted.push({ draft, provenance });
    return { accepted: draft, rejected: [], policyRefused: [] };
  }),
  loadInstance: vi.fn(async () => writes.reloaded ?? writes.loaded),
}));
vi.mock("./ca-action-plan-sync", () => ({ syncCorrectiveActionPlan: vi.fn(async () => []) }));

const { correctiveActionDocument, coachingDocument } = await import("./library");
const paths = await import("./form-reducer-paths");
const { NOTHING_CHANGED } = await import("./form-diff-reply");

const TODAY = "2026-10-26";

function row(fieldKey: string, value: string | null, checked: string[] = [], filledBy: InstanceValueRow["filledBy"] = "ai"): InstanceValueRow {
  return { fieldKey, value, checked, filledBy, provenance: {} };
}

function form(document: unknown, rows: InstanceValueRow[], name = "Rosa Mae Ashgrove", id = "form-1"): LoadedInstance {
  return {
    instance: {
      id,
      status: "draft",
      templateKey: "dpoa",
      templateName: "Corrective Action Form",
      variantKey: null,
      employeeName: name,
      employeeRole: "Team Member Part Time",
      locationName: "Kearney, NE",
      formDate: rows.find((entry) => entry.fieldKey === "form_date")?.value ?? null,
      followUpDate: null,
    },
    version: { document },
    values: rows,
    events: [],
  } as unknown as LoadedInstance;
}

function ca(rows: InstanceValueRow[]): LoadedInstance {
  return form(correctiveActionDocument(), rows);
}

beforeEach(() => {
  writes.saved = [];
  writes.drafted = [];
  writes.loaded = null;
  writes.reloaded = null;
});

const save = (loaded: LoadedInstance, stated: { values?: Record<string, string>; checked?: Record<string, string[]> }, said: string, passThrough?: { values?: Record<string, string>; checked?: Record<string, string[]> }) =>
  paths.saveCorrectionPatched({
    instanceId: loaded.instance.id,
    loaded,
    stated: { values: stated.values ?? {}, checked: stated.checked ?? {} },
    ...(passThrough ? { passThrough: { values: passThrough.values ?? {}, checked: passThrough.checked ?? {} } } : {}),
    actorId: "manager-1",
    said,
    today: TODAY,
  });

describe("saveCorrectionPatched — a correction's save through the reducer", () => {
  it("every value already on the form: nothing is written, and the reply to give is NOTHING_CHANGED", async () => {
    const loaded = ca([row("form_date", "2026-10-20", [], "manager")]);
    const result = await save(loaded, { values: { form_date: "2026-10-20" } }, "change the date to 10/20");
    expect(writes.saved).toEqual([]);
    expect(result.nothingChanged).toBe(NOTHING_CHANGED);
    expect(result.rejected).toEqual([{ key: "form_date", reason: "unchanged" }]);
  });

  it("only what changed is written; a key that already held its value is reported, never claimed", async () => {
    const loaded = ca([row("form_date", "2026-10-20"), row("warning_type", null, ["verbal"], "manager")]);
    const result = await save(loaded, { values: { form_date: "2026-10-19" }, checked: { warning_type: ["verbal"] } }, "make it verbal and change the date to 10/19");
    expect(writes.saved).toEqual([{ values: { form_date: "2026-10-19" }, checked: {} }]);
    expect(result.rejected).toEqual([{ key: "warning_type", reason: "unchanged" }]);
    expect(result.nothingChanged).toBeUndefined();
  });

  it("a date the statement does not state is refused, not written, and not \"nothing changed\"", async () => {
    const loaded = ca([row("form_date", "2026-10-20")]);
    const result = await save(loaded, { values: { form_date: "2026-10-18" } }, "change the date to 10/19");
    expect(writes.saved).toEqual([]);
    expect(result.rejected).toEqual([{ key: "form_date", reason: "date_not_stated" }]);
    expect(result.nothingChanged).toBeUndefined();
  });

  it("a relative date the readers read (\"yesterday\") is a stated date", async () => {
    const loaded = ca([row("form_date", "2026-10-20")]);
    await save(loaded, { values: { form_date: "2026-10-25" } }, "change the date to yesterday");
    expect(writes.saved).toEqual([{ values: { form_date: "2026-10-25" }, checked: {} }]);
  });

  it("the name on the form is an accepted offer: \"…Ashgrove\" → \"…Pike\" passes the half-the-words rule from the last name alone", async () => {
    const loaded = ca([]);
    await save(loaded, { values: { employee_name: "Rosa Mae Pike" } }, "fix her last name Pike");
    expect(writes.saved).toEqual([{ values: { employee_name: "Rosa Mae Pike" }, checked: {} }]);
  });

  it("a name with most of its words neither said nor on the form is refused", async () => {
    const loaded = ca([]);
    const result = await save(loaded, { values: { employee_name: "Jordan Lee Testperson" } }, "fix her last name Pike");
    expect(writes.saved).toEqual([]);
    expect(result.rejected).toEqual([{ key: "employee_name", reason: "not_in_manager_words" }]);
  });

  it("the header line is compared too: the name already on the form is not a change", async () => {
    const loaded = ca([]);
    const result = await save(loaded, { values: { employee_name: "Rosa Mae Ashgrove" } }, "change her name to Rosa Mae Ashgrove");
    expect(writes.saved).toEqual([]);
    expect(result.nothingChanged).toBe(NOTHING_CHANGED);
  });

  it("Q1: a withdrawn payroll answer and its amount are cleared untouched by the reducer's never-blank rule", async () => {
    const loaded = ca([row("payroll_deduct", null, ["yes"], "manager"), row("payroll_deduct_amount", "$3.25", [], "manager")]);
    const result = await save(loaded, { values: { payroll_deduct_amount: "" }, checked: { payroll_deduct: [] } }, "hold off on the payroll deduction");
    expect(writes.saved).toEqual([{ values: { payroll_deduct_amount: "" }, checked: { payroll_deduct: [] } }]);
    expect(result.rejected).toEqual([]);
  });

  it("Q1: a clear of what is already empty is not written and not claimed — the reply never says it changed", async () => {
    const loaded = ca([row("payroll_deduct", null, [], "manager"), row("payroll_deduct_amount", "", [], "manager")]);
    const result = await save(loaded, { values: { payroll_deduct_amount: "" }, checked: { payroll_deduct: [] } }, "not sure about the payroll deduction anymore");
    expect(writes.saved).toEqual([]);
    expect(result.rejected.map((entry) => entry.key).sort()).toEqual(["payroll_deduct", "payroll_deduct_amount"]);
    expect(result.nothingChanged).toBe(NOTHING_CHANGED);
  });

  it("Q1: a reply built from the result names only saved keys (the caller's `written`)", async () => {
    const loaded = ca([row("payroll_deduct", null, ["yes"], "manager"), row("payroll_deduct_amount", "", [], "manager"), row("form_date", "2026-10-20")]);
    const stated = { values: { payroll_deduct_amount: "", form_date: "2026-10-20" }, checked: { payroll_deduct: [] as string[] } };
    const result = await save(loaded, stated, "not sure about the payroll deduction anymore, the date is 10/20");
    const refused = new Set(result.rejected.map((entry) => entry.key));
    const written = [...Object.keys(stated.values), ...Object.keys(stated.checked)].filter((key) => !refused.has(key));
    expect(written).toEqual(["payroll_deduct"]);
    expect(writes.saved).toEqual([{ values: {}, checked: { payroll_deduct: [] } }]);
  });

  it("a derived value (the paragraph that follows the field) passes through, written only when it differs", async () => {
    const loaded = ca([row("form_date", "2026-10-20"), row("observation", "Observed on October 20.")]);
    await save(loaded, { values: { form_date: "2026-10-19" } }, "change the date to 10/19", { values: { observation: "Observed on October 19." } });
    expect(writes.saved).toEqual([{ values: { form_date: "2026-10-19", observation: "Observed on October 19." }, checked: {} }]);
    writes.saved = [];
    const same = await save(loaded, { values: { form_date: "2026-10-20" } }, "change the date to 10/20", { values: { observation: "Observed on October 20." } });
    expect(writes.saved).toEqual([]);
    expect(same.nothingChanged).toBe(NOTHING_CHANGED);
  });

  it("Prior Actions are united: a line already there, said again, changes nothing", async () => {
    const line = "Verbal corrective action — 09/01/2026";
    const loaded = ca([row("prior_actions", line, [], "manager")]);
    const result = await save(loaded, { values: { prior_actions: line } }, "she also had a verbal ca on 9-1-26");
    expect(writes.saved).toEqual([]);
    expect(result.nothingChanged).toBe(NOTHING_CHANGED);
  });

  it("an option the group does not have is refused", async () => {
    const loaded = ca([row("warning_type", null, ["verbal"])]);
    const result = await save(loaded, { checked: { warning_type: ["sternly"] } }, "make it sternly");
    expect(writes.saved).toEqual([]);
    expect(result.rejected).toEqual([{ key: "warning_type", reason: "unknown_option" }]);
  });
});

describe("redraftOutcome — the redraft claims what the draft route really changed", () => {
  it("no diff from the route: null, the old reply stands", () => {
    expect(paths.redraftOutcome({}, null)).toBeNull();
    expect(paths.redraftOutcome({ formDiff: null }, null)).toBeNull();
  });

  it("changed keys are the claim", () => {
    const changed = [{ key: "observation", before: "", after: "Observed." }, { key: "action_plan", before: "", after: "Plan." }];
    expect(paths.redraftOutcome({ formDiff: { changed } }, null)).toEqual({ updated: ["observation", "action_plan"], reply: null });
  });

  it("nothing changed: NOTHING_CHANGED, with the policy line when it applies, and no formUpdate", () => {
    const outcome = paths.redraftOutcome({ formDiff: { changed: [] } }, "I couldn't match it.");
    expect(outcome?.updated).toEqual([]);
    expect(outcome?.reply).toEqual({ content: `${NOTHING_CHANGED}\n\nI couldn't match it.`, citations: [], coverage: "not_applicable" });
    expect(paths.redraftOutcome({ formDiff: { changed: [] } }, null)?.reply?.content).toBe(NOTHING_CHANGED);
  });
});

describe("copyThroughReducer — the same-form copy as a draft write", () => {
  const details = "Bryony was coached on ship from store: print the packing slip, clip it to the rolling rack in order, then pack.";
  const source = form(coachingDocument(), [row("coaching_details", details)], "Bryony Castellane", "source");

  it("the copied values are reduced, written with the copy's provenance, and the claim is what really changed", async () => {
    const target = form(coachingDocument(), [], "Tamsin Rookwood", "target");
    writes.loaded = target;
    const result = await paths.copyThroughReducer({ source, target, actorId: "manager-1", notes: "copy it" });
    expect(writes.drafted).toHaveLength(1);
    expect(writes.drafted[0]!.provenance).toEqual({ coaching_details: { source: "copied_form", fromInstanceId: "source" } });
    // The fake store did not change, so the realized diff is empty: nothing is claimed.
    expect(result).toEqual({ values: {}, checked: {}, nothingChanged: NOTHING_CHANGED });
  });

  it("the same copy again: the reducer writes nothing, and nothing is claimed", async () => {
    const target = form(coachingDocument(), [row("coaching_details", details.split("Bryony").join("Tamsin"))], "Tamsin Rookwood", "target");
    writes.loaded = target;
    const result = await paths.copyThroughReducer({ source, target, actorId: "manager-1", notes: "copy it" });
    expect(writes.drafted).toEqual([]);
    expect(result.nothingChanged).toBe(NOTHING_CHANGED);
  });

  it("a real change is claimed from the form read again", async () => {
    const target = form(coachingDocument(), [], "Tamsin Rookwood", "target");
    writes.loaded = target;
    writes.reloaded = null;
    const copied = details.split("Bryony").join("Tamsin");
    // After the write, the form holds the copy.
    const { applyAssistantDraft } = await import("./instances");
    vi.mocked(applyAssistantDraft).mockImplementationOnce(async (_id, draft) => {
      writes.reloaded = form(coachingDocument(), [row("coaching_details", copied)], "Tamsin Rookwood", "target");
      return { accepted: draft as never, rejected: [], policyRefused: [] };
    });
    const result = await paths.copyThroughReducer({ source, target, actorId: "manager-1", notes: "copy it" });
    expect(result).toEqual({ values: { coaching_details: copied }, checked: {} });
  });
});
