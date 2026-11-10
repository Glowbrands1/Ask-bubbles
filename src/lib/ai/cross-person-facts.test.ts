import { afterEach, describe, expect, it } from "vitest";

import { withFreshPersonFacts } from "./cross-person-facts";

/* CROSS_PERSON_FRESH_FACTS_ENABLED. the sibling app's #236 words, the people invented. The replay cases run the route. */
const ROSTER = [
  { firstName: "Ysolde", lastName: "Barrowmere" },
  { firstName: "Fenna", lastName: "Calloway" },
];
const A_TURN = "create a coaching document for Ysolde Barrowmere regarding On 10-16-26 she did not complete required policy acknowledgements";
const card = (content: string, extra: Record<string, unknown> = {}) =>
  ({ content, formProposal: { templateKey: "coaching", employeeName: "Fenna Calloway", formDate: "2026-10-16", ...extra } }) as never;
const CARD = "Here is what I would put on a **Coaching Form**.\n\n**Date:** 10/16/2026\n\n**Job title:** Tanning Consultant";

describe("CROSS_PERSON_FRESH_FACTS_ENABLED", () => {
  afterEach(() => {
    delete process.env.CROSS_PERSON_FRESH_FACTS_ENABLED;
  });
  const request = (question: string) => ({ question, history: [{ id: "u1", role: "user", content: A_TURN, createdAt: "" }] }) as never;

  it("off: the card as built", () => {
    const built = card(CARD);
    expect(withFreshPersonFacts(built, request("create a coaching document for Fenna Calloway"), ROSTER)).toBe(built);
  });

  it("on: B's card drops A's date; B's own date is kept", () => {
    process.env.CROSS_PERSON_FRESH_FACTS_ENABLED = "true";
    const out = withFreshPersonFacts(card(CARD), request("create a coaching document for Fenna Calloway"), ROSTER) as { content: string; formProposal: { formDate: string | null } };
    expect(out.formProposal.formDate).toBeNull();
    expect(out.content).not.toMatch(/\*\*Date:\*\*/);
    const own = card(CARD);
    expect(withFreshPersonFacts(own, request("create a coaching document for Fenna Calloway, late on 10-16-26"), ROSTER)).toBe(own);
  });

  it("on: the same person, or a first card, is left as built", () => {
    process.env.CROSS_PERSON_FRESH_FACTS_ENABLED = "true";
    const built = card(CARD);
    expect(withFreshPersonFacts(built, { question: "written warning", history: [{ id: "u1", role: "user", content: "create a coaching document for Fenna Calloway on 10-16-26", createdAt: "" }] } as never, ROSTER)).toBe(built);
    expect(withFreshPersonFacts(built, { question: "create a coaching document for Fenna Calloway", history: [] } as never, ROSTER)).toBe(built);
  });
});

describe("CROSS_PERSON_FRESH_FACTS_ENABLED, no roster (the chat route)", () => {
  afterEach(() => {
    delete process.env.CROSS_PERSON_FRESH_FACTS_ENABLED;
  });
  const PAY = "I'll draft a **Corrective Action Form** for **Fenna Calloway** …\n\nIs payroll deduct applicable? **Yes** — tell me if that should change.\n\n**Payroll deduction:** Yes";
  const built = { content: PAY, formProposal: { templateKey: "dpoa", employeeName: "Fenna Calloway", payrollDeduct: "yes" } } as never;
  const history = [
    { id: "u1", role: "user", content: "create a ca for Ysolde Barrowmere, payroll deduct applies", createdAt: "" },
    { id: "a1", role: "assistant", content: "I'll draft a **Corrective Action Form** for **Ysolde Barrowmere** from what you've described", createdAt: "" },
  ];

  it("on: the earlier card's person is read from the app's own card line, and B's card asks the payroll question", () => {
    process.env.CROSS_PERSON_FRESH_FACTS_ENABLED = "true";
    const out = withFreshPersonFacts(built, { question: "create a ca for Fenna Calloway for being late on 10-22-26", history } as never) as {
      content: string;
      formProposal: { payrollDeduct: string | null };
    };
    expect(out.formProposal.payrollDeduct).toBeNull();
    expect(out.content).toMatch(/One more question: \*\*Is payroll deduct applicable\?\*\* Yes or No\?/);
    expect(out.content).not.toMatch(/\*\*Payroll deduction:\*\*/);
  });
});
