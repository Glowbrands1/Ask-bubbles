import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseFormDocument } from "./document";

/**
 * "Change the date to yesterday", typed after the form exists: saved as the
 * manager's own edit, through the template's own edit permission, and only
 * for header lines the company registry lets chat correct. Ported from the
 * reference platform's `chat-correction.test.ts`, against the fixture forms.
 */

vi.mock("@/config/company/forms", async () =>
  (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
);

const state = vi.hoisted(() => ({
  templateKey: "fixture-coaching",
  status: "draft",
  authorized: true,
  employeeName: "Jane Doe",
  saved: [] as { values: Record<string, string>; checked: Record<string, string[]> }[],
  values: [] as { fieldKey: string; value: string; filledBy: string }[],
  rejectOnSave: [] as string[],
}));

vi.mock("./instance-scope", async () => {
  const { fixtureSeed } = await import("@/test/forms/fixture-forms");
  return {
    authorizeInstance: async () => {
      if (!state.authorized) throw new Error("not permitted");
      const seed = fixtureSeed(state.templateKey);
      return {
        actor: { id: "user-1", role: "location_manager", verified: true, scope: null },
        loaded: {
          instance: {
            id: "form-1",
            templateKey: seed.key,
            templateName: seed.name,
            variantKey: null,
            employeeName: state.employeeName,
            status: state.status,
          },
          version: { document: parseFormDocument(seed.document), variants: [] },
          values: state.values.map((row) => ({ ...row, checked: [], provenance: {} })),
        },
      };
    },
  };
});

vi.mock("./instances", () => ({
  saveInstanceValues: async (
    _id: string,
    submitted: { values: Record<string, string>; checked: Record<string, string[]> },
  ) => {
    state.saved.push(submitted);
    return { rejected: state.rejectOnSave.map((key) => ({ key, reason: "refused" })), values: submitted.values };
  },
}));

const { correctActiveForm, readHeaderCorrection } = await import("./chat-correction");
const { FIXTURE_COMPANY_FORMS } = await import("@/test/forms/fixture-forms");

const TODAY = "2026-10-06"; // a Tuesday
const INSTANCE = "11111111-1111-1111-1111-111111111111";

const correct = (question: string) =>
  correctActiveForm({ request: new Request("http://localhost/api/chat"), instanceId: INSTANCE, question, today: TODAY });

beforeEach(() => {
  state.templateKey = "fixture-coaching";
  state.status = "draft";
  state.authorized = true;
  state.employeeName = "Jane Doe";
  state.saved = [];
  state.values = [];
  state.rejectOnSave = [];
});

describe("reading a header correction", () => {
  it.each([
    ["change the date to yesterday", { form_date: "2026-10-05" }],
    ["update the form date to 9/27", { form_date: "2026-09-27" }],
    ["Actually, the date should be last Friday.", { form_date: "2026-10-02" }],
    ["change the name to Jane Doe-Smith", { employee_name: "Jane Doe-Smith" }],
    ['change her name to "jane smith"', { employee_name: "jane smith" }],
    ["actually her name is Avery Testperson", { employee_name: "Avery Testperson" }],
  ])("%s", (text, values) => {
    expect(readHeaderCorrection(text, TODAY)).toEqual({ values });
  });

  it.each([
    "what is the date on the form?",
    "thanks, looks good",
    "change the date to Friday", // a weekday with no week: asked, never guessed
    "change the date to 9/27 or 9/28", // two days: never chosen between
    "she was late yesterday",
  ])("reads nothing from: %s", (text) => {
    expect(readHeaderCorrection(text, TODAY)).toBeNull();
  });
});

describe("correcting the open form from chat", () => {
  it("corrects the date in place and says so in the form's own labels", async () => {
    const response = await correct("change the date to yesterday");
    expect(state.saved).toEqual([{ values: { form_date: "2026-10-05" }, checked: {} }]);
    expect(response!.content).toMatch(/^Updated the \*\*Fixture Coaching Note\*\* for \*\*Jane Doe\*\*: .+ → /);
    expect(response!.formUpdate).toEqual({ instanceId: INSTANCE, updated: ["form_date"] });
    expect(response!.citations).toEqual([]);
  });

  it("corrects the name without starting again, and points at drafted text", async () => {
    state.values = [{ fieldKey: "summary", value: "Jane was late.", filledBy: "ai" }];
    const response = await correct("change the name to Jane Doe-Smith");
    expect(state.saved).toEqual([{ values: { employee_name: "Jane Doe-Smith" }, checked: {} }]);
    expect(response!.content).toContain("give it a quick read");
  });

  it("does not touch a finalized form", async () => {
    state.status = "finalized";
    const response = await correct("change the date to yesterday");
    expect(state.saved).toEqual([]);
    expect(response!.content).toContain("finalized");
  });

  it("returns null when the manager may not edit the form", async () => {
    state.authorized = false;
    expect(await correct("change the date to yesterday")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("returns null for a form the registry does not let chat correct", async () => {
    const coaching = FIXTURE_COMPANY_FORMS.find((entry) => entry.seed.key === "fixture-coaching")!;
    const original = coaching.chatCorrectableFields;
    (coaching as { chatCorrectableFields: readonly string[] }).chatCorrectableFields = [];
    try {
      expect(await correct("change the date to yesterday")).toBeNull();
      expect(state.saved).toEqual([]);
    } finally {
      (coaching as { chatCorrectableFields: readonly string[] }).chatCorrectableFields = original;
    }
  });

  it("reports nothing as updated when the save refused it", async () => {
    state.rejectOnSave = ["form_date"];
    expect(await correct("change the date to yesterday")).toBeNull();
  });
});

describe("a new request, or somebody else, is not a correction", () => {
  it.each([
    "create a coaching note for Jordan Testperson, change the date to yesterday",
    "start another coaching note and change the date to yesterday",
  ])("leaves the open form alone: %s", async (question) => {
    expect(await correct(question)).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("leaves Jane's form alone when the date is for Jordan", async () => {
    expect(await correct("change the date to yesterday for Jordan Testperson")).toBeNull();
    expect(state.saved).toEqual([]);
  });

  it("still corrects when the manager names this form's employee", async () => {
    const response = await correct("change the date to yesterday for Jane");
    expect(response).not.toBeNull();
    expect(state.saved).toEqual([{ values: { form_date: "2026-10-05" }, checked: {} }]);
  });
});
