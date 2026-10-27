import { afterEach, describe, expect, it } from "vitest";

import { namesSomebody } from "./answer-not-a-name";

/** ANSWER_NOT_A_NAME_ENABLED and STORE_WORD_NOT_A_NAME_ENABLED (QA BF7, 27 Oct 2026). The chat path: `api/chat/answer-not-a-name-e2e.test.ts`. */
const FLAGS = ["ANSWER_NOT_A_NAME_ENABLED", "STORE_WORD_NOT_A_NAME_ENABLED", "PAYROLL_TYPO_NOT_A_NAME_ENABLED", "DATE_ANSWER_APPLIED_ENABLED"];

afterEach(() => {
  for (const name of FLAGS) delete process.env[name];
});

describe("namesSomebody", () => {
  it("on: payroll wording, a date answer and a store's name name nobody; a person does", () => {
    for (const name of FLAGS) process.env[name] = "true";
    expect(namesSomebody("payrol ldeduct")).toBe(false);
    expect(namesSomebody("most recent")).toBe(false);
    expect(namesSomebody("dodge")).toBe(false);
    expect(namesSomebody("quinn marlowe")).toBe(true);
    expect(namesSomebody("Roll")).toBe(true);
  });

  it("off: every candidate is kept", () => {
    process.env.PAYROLL_TYPO_NOT_A_NAME_ENABLED = "true";
    for (const candidate of ["payrol ldeduct", "most recent", "dodge", "quinn marlowe"]) expect(namesSomebody(candidate)).toBe(true);
  });
});
