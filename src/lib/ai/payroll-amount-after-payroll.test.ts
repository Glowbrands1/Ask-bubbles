import { afterEach, describe, expect, it, vi } from "vitest";

import { managerPayrollAmount } from "@/lib/forms/payroll-deduct-amount";

import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";
import type { GroundedPerson } from "./grounded-entities";

/**
 * PAYROLL_AMOUNT_AFTER_PAYROLL_ENABLED (QA, Gate-Bubbles-2, 12 Nov 2026). With
 * INTENT_PAYROLL_MANAGER_ONLY on, "…payroll $25." and "…payroll of 25.00
 * dollars" kept payrollAmount null (intent-extraction.test.ts). The exact
 * wording of those two turns is used here. People are synthetic.
 */

const STORES = [{ id: "loc-66", name: "Kearney, NE" }] as const;
const TEMPLATES = [{ key: "dpoa", name: "Corrective Action Form" }] as const;

const MARISSA: GroundedPerson = {
  id: "emp-marissa",
  firstName: "Marissa",
  lastName: "Lempka",
  preferredFirstName: null,
  locationIds: ["loc-66"],
  title: "Store Manager",
  primaryLocationName: "Kearney, NE",
};

function turn(overrides: Partial<IntentTurnInput>): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: "2026-10-23",
    saved: null,
    raw: null,
    people: [MARISSA],
    stores: STORES,
    headings: ["Attendance", "Late Opening"],
    templates: TEMPLATES,
    formInProgress: false,
    ...overrides,
  };
}

const DOLLAR_SIGN = "verbal corrective action for marissa lempka at kearney. she showed up late on october 1, 2026. payroll $25.";
const DOLLARS_WORD =
  "verbal corrective action for marissa lempka at kearney on 1 October 2026, showed up late, payroll of 25.00 dollars";

function decide(question: string, payrollAmount: string) {
  return decideIntentTurn(
    turn({
      question,
      raw: {
        employee: "Marissa Lempka",
        store: "Kearney",
        incidentType: "showed up late",
        incidentDate: "1 October 2026",
        payrollAmount,
        warningLevel: "verbal",
        formType: "corrective action",
        formTurn: true,
      },
    }),
  );
}

function flags(on: boolean) {
  vi.stubEnv("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "true");
  vi.stubEnv("PAYROLL_AMOUNT_AFTER_PAYROLL_ENABLED", on ? "true" : "false");
}

afterEach(() => vi.unstubAllEnvs());

describe("an amount right after \"payroll\" is the manager's stated amount", () => {
  it("off, with INTENT_PAYROLL_MANAGER_ONLY on, the typed amount is dropped (the reported bug)", () => {
    flags(false);
    expect(decide(DOLLAR_SIGN, "$25").state.payrollAmount).toBeNull();
    expect(decide(DOLLARS_WORD, "25.00 dollars").state.payrollAmount).toBeNull();
  });

  it("on, \"payroll $25.\" and \"payroll of 25.00 dollars\" keep the amount", () => {
    flags(true);
    expect(decide(DOLLAR_SIGN, "$25").state.payrollAmount).toBe("25");
    expect(decide(DOLLARS_WORD, "25.00 dollars").state.payrollAmount).toBe("25.00");
  });

  it("on, nothing new is read as money", () => {
    flags(true);
    expect(managerPayrollAmount("payroll $25.")).toBe("$25");
    expect(managerPayrollAmount("payroll is $3.25")).toBe("$3.25");
    expect(managerPayrollAmount("payroll: $12")).toBe("$12");
    expect(managerPayrollAmount("payroll 25")).toBeNull();
    expect(managerPayrollAmount("payroll 10/1/2026")).toBeNull();
    expect(managerPayrollAmount("no payroll, $25 short in the drawer")).toBeNull();
    expect(managerPayrollAmount("payroll $0")).toBeNull();
    expect(managerPayrollAmount("payroll deduction of $25")).toBe("$25");
  });
});
