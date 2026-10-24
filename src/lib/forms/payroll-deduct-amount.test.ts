import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";

import { augmentIntakeQuestion, fieldLines } from "@/lib/ai/intake-augment";
import { captureFormState, prependFormState, rememberPayrollAmount } from "@/lib/ai/form-state";
import { corroborateModelFields, EMPTY_CONFIRMED_FIELDS, fieldsFromManagerText } from "@/lib/ai/form-field-state";
import type { FormToolTurn } from "@/lib/ai/form-tool-schema";
import type { AccessScope, ChatMessage } from "@/types";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";

import { parseFormDocument } from "./document";
import { selectStatedFacts } from "./employment-change";
import { correctiveActionPlan, planPayrollAmount } from "./ca-action-plan";
import { correctiveActionDocument } from "./library";
import { payrollDeductAmount, quotedDeductionAmount } from "./payroll-deduct";
import {
  PAYROLL_DEDUCT_AMOUNT_KEY,
  PAYROLL_DEDUCT_AMOUNT_LABEL,
  PAYROLL_DEDUCT_AMOUNT_QUESTION,
  PAYROLL_DEDUCT_AMOUNT_STATED_KEYS,
  payrollAmountForDraft,
  payrollAmountPrompt,
  statedPayrollDeductAmount,
  withPayrollDeductAmountField,
} from "./payroll-deduct-amount";
import { renderFormPdf, type RenderMeta } from "./pdf-render";

/**
 * Pau approved the amount line (24 Oct 2026). The manager's words are the
 * only source. "payroll deduct of $3.25" is theirs. The Late Opening
 * sentence "$25.00 via payroll deduction" is the policy, and it stays off
 * this line.
 */

const LATE_OPENING =
  "The employee will reimburse The Company $25.00 via payroll deduction.";
const MANAGER_AMOUNT = "payroll deduct of $3.25 is applicable";

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};
const state = vi.hoisted(() => ({ directory: [] as unknown[] }));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

const { ensureTemplateLibrary, listTemplateSummaries } = await import("./repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");

const FLAG = "PAYROLL_DEDUCT_AMOUNT_ENABLED";
const priorFlag = process.env[FLAG];

function setFlag(on: boolean) {
  if (on) process.env[FLAG] = "1";
  else delete process.env[FLAG];
}

afterEach(() => {
  if (priorFlag === undefined) delete process.env[FLAG];
  else process.env[FLAG] = priorFlag;
});

function blockKeys(document: ReturnType<typeof parseFormDocument>): string[] {
  return document.blocks.map((block) => {
    if (block.kind === "field") return `field:${block.field.key}`;
    if (block.kind === "checkbox_group") return `group:${block.key}`;
    if (block.kind === "section") return `section:${block.label}`;
    return block.kind;
  });
}

describe("the amount line is on the Corrective Action seed", () => {
  it("does not insert a second copy when the flag is on or off", () => {
    const document = parseFormDocument(correctiveActionDocument());
    setFlag(false);
    expect(withPayrollDeductAmountField(document)).toBe(document);
    setFlag(true);
    expect(withPayrollDeductAmountField(document)).toBe(document);
  });

  it("places Payroll deduction amount immediately after the Yes/No question, as a manager field", () => {
    const document = parseFormDocument(correctiveActionDocument());
    const keys = blockKeys(document);
    const payroll = keys.indexOf("group:payroll_deduct");
    expect(keys[payroll + 1]).toBe(`field:${PAYROLL_DEDUCT_AMOUNT_KEY}`);
    expect(keys[payroll + 2]).toBe("section:Acknowledgement of Receipt of Warning");
    const field = document.blocks[payroll + 1];
    expect(field).toMatchObject({
      kind: "field",
      field: {
        key: PAYROLL_DEDUCT_AMOUNT_KEY,
        label: PAYROLL_DEDUCT_AMOUNT_LABEL,
        responsibility: "manager",
        input: "text",
      },
    });
  });
});

describe("the amount is the manager's, never the policy's", () => {
  it("reads payroll deduct of $3.25 and ignores the Late Opening $25.00", () => {
    expect(quotedDeductionAmount(LATE_OPENING)).toBe("$25.00");
    expect(payrollDeductAmount(LATE_OPENING)).toBeNull();
    expect(payrollDeductAmount(`${LATE_OPENING}\npayroll deduct yes`)).toBeNull();
    expect(payrollDeductAmount(MANAGER_AMOUNT)).toBe("$3.25");
    expect(statedPayrollDeductAmount("$3.25", "something else")).toBeNull();
    expect(statedPayrollDeductAmount("$3.25", PAYROLL_DEDUCT_AMOUNT_QUESTION)).toBe("$3.25");
    expect(statedPayrollDeductAmount("$0", PAYROLL_DEDUCT_AMOUNT_QUESTION)).toBeNull();
  });

  it("writes the stated amount into an empty line and does not replace one", () => {
    setFlag(true);
    const document = withPayrollDeductAmountField(parseFormDocument(correctiveActionDocument()));
    const first = selectStatedFacts({
      document,
      variantKey: null,
      stated: { values: { [PAYROLL_DEDUCT_AMOUNT_KEY]: "$3.25" }, checked: {} },
      existing: [],
      keys: PAYROLL_DEDUCT_AMOUNT_STATED_KEYS,
    });
    expect(first.values[PAYROLL_DEDUCT_AMOUNT_KEY]).toBe("$3.25");

    const kept = selectStatedFacts({
      document,
      variantKey: null,
      stated: { values: { [PAYROLL_DEDUCT_AMOUNT_KEY]: "$9.00" }, checked: {} },
      existing: [{ fieldKey: PAYROLL_DEDUCT_AMOUNT_KEY, value: "$3.25", checked: [] }],
      keys: PAYROLL_DEDUCT_AMOUNT_STATED_KEYS,
    });
    expect(kept.values[PAYROLL_DEDUCT_AMOUNT_KEY]).toBeUndefined();
  });

  it("does not write an amount when the flag is off, and does not take the Late Opening $25", () => {
    setFlag(false);
    expect(
      payrollAmountForDraft({
        notes: `${LATE_OPENING}\n${MANAGER_AMOUNT}`,
        saved: "$3.25",
        existing: null,
      }),
    ).toBeNull();
    setFlag(true);
    expect(
      payrollAmountForDraft({
        notes: `${LATE_OPENING}\npayroll deduct yes`,
        saved: null,
        existing: null,
      }),
    ).toBeNull();
    expect(
      payrollAmountForDraft({
        notes: LATE_OPENING,
        saved: LATE_OPENING,
        existing: null,
      }),
    ).toBeNull();
    expect(
      payrollAmountForDraft({
        notes: "she was late again. payroll deduct yes",
        saved: "$3.25",
        existing: null,
      }),
    ).toBe("$3.25");
    expect(
      payrollAmountForDraft({
        notes: MANAGER_AMOUNT,
        saved: "$9.00",
        existing: null,
      }),
    ).toBe("$3.25");
    expect(
      payrollAmountForDraft({
        notes: "she was late again",
        saved: "$9.00",
        existing: "$3.25",
      }),
    ).toBeNull();
  });
});

describe("the question is asked once, and only when payroll is Yes", () => {
  const ask = PAYROLL_DEDUCT_AMOUNT_QUESTION;

  it("says nothing when the flag is off", () => {
    setFlag(false);
    expect(
      payrollAmountPrompt({
        payroll: "yes",
        managerText: "payroll deduct yes",
        assistantMessages: [],
      }),
    ).toBeNull();
  });

  it("asks once for a Yes with no amount, and reads back an amount the manager gave", () => {
    setFlag(true);
    expect(
      payrollAmountPrompt({
        payroll: "yes",
        managerText: `she was late. ${LATE_OPENING} payroll deduct yes`,
        assistantMessages: [],
      }),
    ).toBe(ask);
    expect(
      payrollAmountPrompt({
        payroll: "yes",
        managerText: "payroll deduct yes",
        assistantMessages: [ask],
      }),
    ).toBeNull();
    expect(
      payrollAmountPrompt({
        payroll: "no",
        managerText: "payroll deduct no",
        assistantMessages: [],
      }),
    ).toBeNull();
    expect(
      payrollAmountPrompt({
        payroll: null,
        managerText: "she was late",
        assistantMessages: [],
      }),
    ).toBeNull();
    expect(
      payrollAmountPrompt({
        payroll: "yes",
        managerText: `${LATE_OPENING}\n${MANAGER_AMOUNT}`,
        assistantMessages: [],
      }),
    ).toBe(`**${PAYROLL_DEDUCT_AMOUNT_LABEL}:** $3.25 — tell me if that should change.`);
  });
});

const META: RenderMeta = {
  templateName: "Corrective Action Form",
  templateVersion: 6,
  employeeName: "Pat Rivera",
  formDate: "2026-10-24",
  locationName: "Invented Store Alpha",
  reference: "form-0001",
  status: "draft",
};

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : text).replace(/\s+/g, " ");
}

describe("the PDF", () => {
  it("prints the blank line from the template and does not invent $25", async () => {
    const text = await pdfText(
      renderFormPdf(parseFormDocument(correctiveActionDocument()), null, { values: {}, checked: {} }, META),
    );
    const payroll = text.indexOf("Is payroll deduct applicable?");
    const amount = text.indexOf(PAYROLL_DEDUCT_AMOUNT_LABEL);
    expect(payroll).toBeGreaterThan(-1);
    expect(amount).toBeGreaterThan(payroll);
    expect(text).not.toContain("$25.00");
    expect(text).not.toContain("$3.25");
  });

  it("prints the label and the manager's amount", async () => {
    const document = parseFormDocument(correctiveActionDocument());
    const text = await pdfText(
      renderFormPdf(
        document,
        null,
        {
          values: { [PAYROLL_DEDUCT_AMOUNT_KEY]: "$3.25" },
          checked: { payroll_deduct: ["yes"] },
        },
        META,
      ),
    );
    const payroll = text.indexOf("Is payroll deduct applicable?");
    const amount = text.indexOf(PAYROLL_DEDUCT_AMOUNT_LABEL);
    expect(payroll).toBeGreaterThan(-1);
    expect(amount).toBeGreaterThan(payroll);
    expect(text).toContain("$3.25");
    expect(text).not.toContain("$25.00");
  });
});

describe("the amount is never in the action plan and is never the policy's $25", () => {
  it("leaves a stated $3.25 and a quoted $25.00 off the plan while the flag is on", () => {
    setFlag(true);
    const plan = correctiveActionPlan({
      citedPolicies: ["Late Opening"],
      employeeName: "Pat Rivera",
      payroll: { answer: "yes", amount: "$3.25", amountFrom: "manager" },
    });
    expect(plan).not.toContain("$3.25");
    expect(plan).not.toContain("$25");
    expect(
      planPayrollAmount({ answer: "yes", stated: "$3.25", quotedPolicy: LATE_OPENING }),
    ).toEqual({ amount: null });
    expect(
      planPayrollAmount({ answer: "yes", stated: null, quotedPolicy: LATE_OPENING }),
    ).toEqual({ amount: null });

    setFlag(false);
    expect(
      planPayrollAmount({ answer: "yes", stated: null, quotedPolicy: LATE_OPENING }).amount,
    ).toBe("$25.00");
  });

  it("keeps a stated amount on chat_form_state when a later turn does not repeat it", () => {
    setFlag(true);
    expect(rememberPayrollAmount({ prior: null, userText: LATE_OPENING, payroll: "yes" })).toBeNull();
    const first = captureFormState(null, {
      proposal: { payrollDeduct: "yes", templateKey: "dpoa" } as never,
      employeeId: null,
      keptTypedName: null,
      userText: `${LATE_OPENING}\n${MANAGER_AMOUNT}`,
      policyHeading: null,
      policyPage: null,
    });
    expect(first.payrollAmount).toBe("$3.25");
    const redraft = captureFormState(first, {
      proposal: null,
      employeeId: null,
      keptTypedName: null,
      userText: "she opened late again and guests waited",
      policyHeading: null,
      policyPage: null,
    });
    expect(redraft.payrollAmount).toBe("$3.25");
    expect(payrollDeductAmount(prependFormState("please redraft", redraft))).toBe("$3.25");
    const cleared = captureFormState(redraft, {
      proposal: { payrollDeduct: "no" } as never,
      employeeId: null,
      keptTypedName: null,
      userText: "no payroll deduction",
      policyHeading: null,
      policyPage: null,
    });
    expect(cleared.payrollAmount).toBeNull();
  });

  it("does not copy a policy $25 into the next question, and does copy a stated amount", () => {
    setFlag(true);
    expect(fieldLines("payroll deduct yes", "2026-10-24", LATE_OPENING).join(" ")).not.toContain("25");
    expect(fieldLines("payroll deduct yes", "2026-10-24", MANAGER_AMOUNT).join(" ")).toContain(
      "Payroll deduction of $3.25",
    );
    const base = fieldsFromManagerText(`${LATE_OPENING}\npayroll deduct yes`, "2026-10-24");
    const model = { payrollAmount: "$25.00" } as FormToolTurn["fields"];
    expect(corroborateModelFields(base, model, `${LATE_OPENING}\npayroll deduct yes`, "2026-10-24").payrollAmount).toBeNull();
    const carried = augmentIntakeQuestion({
      slots: true,
      fields: false,
      question: "she was late again",
      history: [],
      today: "2026-10-24",
      stored: { ...EMPTY_CONFIRMED_FIELDS, payrollDeduct: "yes", payrollAmount: "$3.25" },
    });
    expect(carried).toContain("Payroll deduction of $3.25.");
  });
});

const SCOPE: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };

async function replies(turns: string[]) {
  const messages: ChatMessage[] = [];
  const contents: string[] = [];
  let open: string | undefined;
  let n = 0;
  for (const text of turns) {
    n += 1;
    const response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: `u${n}`,
      actor: { role: "location_manager" as never, scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: "2026-10-24",
      policyManual: async () => null,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    contents.push(response?.content ?? "");
    if (response?.formProposal) open = response.formProposal.templateKey;
    messages.push(
      { id: `u${n}`, role: "user", content: text, createdAt: "2026-10-24T18:00:00Z" } as ChatMessage,
      {
        id: `a${n}`,
        role: "assistant",
        content: response?.content ?? "",
        createdAt: "2026-10-24T18:00:01Z",
        ...(response?.formProposal ? { formProposal: response.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return contents;
}

describe("the Corrective Action reply", () => {
  beforeEach(async () => {
    for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
    state.directory = [
      {
        id: "e-1",
        firstName: "Pat",
        lastName: "Rivera",
        preferredFirstName: null,
        employmentStatus: "active",
        locationIds: ["loc-264"],
        positionName: "Team Member Part Time",
      },
    ];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T18:00:00Z"));
    await ensureTemplateLibrary("system");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not mention the amount when the flag is off", async () => {
    setFlag(false);
    const [content] = await replies([
      "create verbal ca for pat rivera, she was late today. payroll deduct yes",
    ]);
    expect(content).not.toContain(PAYROLL_DEDUCT_AMOUNT_LABEL);
    expect(content).not.toContain("Payroll deduction amount?");
  });

  it("asks once when payroll is Yes and the manager gave no amount", async () => {
    setFlag(true);
    const [first, second] = await replies([
      `create verbal ca for pat rivera, she opened the store late today. ${LATE_OPENING} payroll deduct yes`,
      "the warning can stay verbal",
    ]);
    expect(first).toContain("Payroll deduction amount?");
    expect(first).not.toContain("$25.00");
    expect(first).not.toContain("$3.25");
    const asked = second.split("Payroll deduction amount?").length - 1;
    expect(asked).toBe(0);
  });

  it("reads back payroll deduct of $3.25 and does not ask", async () => {
    setFlag(true);
    const [content] = await replies([
      `create verbal ca for pat rivera, she was late today. ${LATE_OPENING} ${MANAGER_AMOUNT}`,
    ]);
    expect(content).toContain("**Payroll deduction amount:** $3.25");
    expect(content).not.toContain("Payroll deduction amount?");
    expect(content).not.toContain("$25.00");
  });
});
