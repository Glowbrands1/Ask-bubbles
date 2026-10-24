import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { managerStatedWarningLevel } from "@/lib/forms/warning-level";

import { stateSentences } from "./form-state";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";

/**
 * ============================================================================
 * A WARNING LEVEL THE MANAGER NEVER STATED — PORTED FROM ASK SUNNY, 24 OCT 2026
 * ============================================================================
 *
 * Ask Sunny's live replays read back "Written Warning, as you said" when the
 * manager never said written: the intent reading took the level from the
 * whole conversation, the assistant's own turns included, and from the slot
 * model's guess, stored it, and put "Warning level: written." ahead of the
 * next question. Ask Bubbles' `groundWarning` has the same mechanism, by word
 * presence: its own reply asks "Is this new corrective action a **Verbal
 * Warning** or a **Written Warning**?" (and "I still need … the warning
 * level, verbal or written"), so both words are in the conversation and the
 * slot model's guess was taken as given — or a level said only as history
 * ("prior manual + verbal 10-5") was taken as this form's.
 *
 * And the bare "Yes"/"No" answering "Is payroll deduct applicable? Yes or
 * No?" stops being bare once the stored slots are put ahead of it.
 *
 * The manager turns are Ask Bubbles' own production wording (synthetic
 * people): conv_mvmetocl2r5a0ks, conv_mvmf5fb22ca9voo.
 */

const FLAG = "WARNING_LEVEL_MANAGER_ONLY_ENABLED";

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-219", name: "Lee's Summit, MO" },
] as const;
const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;
const HEADINGS = ["Attendance", "Late Opening", "Standards of Conduct"];

/* conv_mvmetocl2r5a0ks — the assistant's reply in production, verbatim. */
const REQUEST = "I need a corrective action for Testy Testerson at Bellevue, NE";
const REQUEST_REPLY =
  "I can create a **Corrective Action Form** for **Testy Testerson**.\n\n**You haven't told me what happened yet**, so I can't cite the policy manual — the draft will come back without the policy section and page. You can create it now and fill it in yourself, or tell me here what happened and I'll draft it (or redraft the form you created) with the manual's section and page cited.\n\n**Store:** Bellevue, NE, as you said — tell me if that should change\n\nIs this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.\n\nYou'll set any prior coaching or corrective action on the form — I won't guess at it.\n\nOne more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.\n\n**Action plan:** Management will review the applicable company policy with Testy. Future policy violations may result in additional corrective action up to and including termination of employment.\n\nWhat is **Testy Testerson**'s position (job title)? I don't have one from Woven or from what you've told me. Tell me here, or fill in Job Title on the form — I won't guess it.\n\nCreate the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do.";
const WHAT_HAPPENED = "late opening on 10-21";

/* The same card once the level is set: the payroll question is the only yes/no one. */
const PAYROLL_ONLY_REPLY =
  "I'll draft a **Corrective Action Form** for **Testy Testerson** from what you've described, and check the applicable company policy before anything policy-related goes on it.\n\n**Type of warning:** Verbal Warning, as you said — tell me if that should change\n\nOne more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.";
const VERBAL_REQUEST = "Verbal CA for Testy Testerson at Bellevue, NE, late opening on 10-21";

/* conv_mvmf5fb22ca9voo — the level as history only, after the request's own. */
const HISTORY_ONLY = "CA for Test Employee at Bellevue, NE; prior manual + verbal 10-5; $25 payroll for late open 10-21";
const NEEDS = "I still need which employee — **Test Employee** is not in the Woven roster, and the warning level, verbal or written.";

const said = (content: string) => ({ role: "user", content });
const replied = (content: string) => ({ role: "assistant", content });

function intent(overrides: Partial<IntentTurnInput>): IntentTurnInput {
  return {
    question: "",
    history: [],
    today: "2026-10-24",
    saved: null,
    raw: null,
    people: [],
    stores: STORES,
    headings: HEADINGS,
    templates: TEMPLATES,
    formInProgress: false,
    ...overrides,
  };
}

function secondTurn(first: string, reply: string, second: string, raw: unknown = null) {
  const one = decideIntentTurn(intent({ question: first, raw }));
  return decideIntentTurn(
    intent({
      question: second,
      history: [said(first), replied(reply)],
      saved: one.state,
      raw,
      formInProgress: true,
    }),
  );
}

let previous: string | undefined;
beforeEach(() => {
  previous = process.env[FLAG];
});
afterEach(() => {
  if (previous === undefined) delete process.env[FLAG];
  else process.env[FLAG] = previous;
});

describe("the level is only what the manager said (ported from Ask Sunny)", () => {
  it(`"${WHAT_HAPPENED}" after the assistant's "Verbal Warning or Written Warning?" stores no level, even with the slot model guessing`, () => {
    process.env[FLAG] = "true";
    const decision = secondTurn(REQUEST, REQUEST_REPLY, WHAT_HAPPENED, { warningLevel: "written", formTurn: true });
    expect(decision.state.warningLevel).toBeNull();
    expect(decision.question).not.toMatch(/Warning level:/);
    expect(decision.clarification ?? "").not.toMatch(/Which warning level did you mean/);
  });

  it("a level said only as history is not this form's", () => {
    process.env[FLAG] = "true";
    const decision = secondTurn(HISTORY_ONLY, NEEDS, "Test Employee");
    expect(decision.state.warningLevel).toBeNull();
  });

  it("flag off keeps main's reading (the defect), so the change is opt-in", () => {
    delete process.env[FLAG];
    expect(secondTurn(REQUEST, REQUEST_REPLY, WHAT_HAPPENED, { warningLevel: "written", formTurn: true }).state.warningLevel).toBe(
      "written",
    );
    expect(secondTurn(HISTORY_ONLY, NEEDS, "Test Employee").state.warningLevel).not.toBeNull();
  });

  it("a level the manager did state is still kept", () => {
    process.env[FLAG] = "true";
    expect(secondTurn(REQUEST, REQUEST_REPLY, "verbal, no payroll").state.warningLevel).toBe("verbal");
    expect(secondTurn("Written CA for Test Employee at Bellevue, NE; prior manual + verbal 10-5; $25 payroll for late open 10-21", NEEDS, "Test Employee").state.warningLevel).toBe("written");
  });

  it('a bare "Yes" counts only after one yes/no question about that exact level', () => {
    process.env[FLAG] = "true";
    expect(secondTurn(REQUEST, "Should I tick **Written Warning** on the form?", "Yes").state.warningLevel).toBe("written");
    expect(secondTurn(REQUEST, REQUEST_REPLY, "Yes").state.warningLevel).toBeNull();
    expect(
      managerStatedWarningLevel([
        said(REQUEST),
        replied("**Type of warning:** Written Warning, as you said — tell me if that should change"),
        said("Yes"),
      ]),
    ).toBeNull();
  });
});

describe('a bare "Yes"/"No" answers the payroll question just asked (ported from Ask Sunny)', () => {
  it.each([
    ["Yes", "yes", /Payroll deduct applies\./],
    ["No", "no", /No payroll deduction\./],
  ])('"%s" right after "Is payroll deduct applicable? Yes or No?" is the payroll answer', (reply, answer, sentence) => {
    process.env[FLAG] = "true";
    const decision = secondTurn(VERBAL_REQUEST, PAYROLL_ONLY_REPLY, reply);
    expect(decision.state.payrollDeduct).toBe(answer);
    // Saved, and put ahead of the question as a sentence the proposal reads (now, or once nothing is left to ask).
    expect(stateSentences(decision.state).join(" ")).toMatch(sentence);
  });

  it("a Yes beside another yes/no question, or confirming a name, is not a payroll answer", () => {
    process.env[FLAG] = "true";
    expect(secondTurn(REQUEST, REQUEST_REPLY, "Yes").state.payrollDeduct).toBeNull();
    expect(
      secondTurn(
        "CA for Testy Testersen at Bellevue, NE",
        "Did you mean **Testy Testerson**? Reply \"yes\" to use **Testy Testerson**, or \"no\" to keep **Testy Testersen** as you typed it.",
        "Yes",
      ).state.payrollDeduct,
    ).toBeNull();
  });

  it("flag off keeps main's reading: the bare answer is not stored", () => {
    delete process.env[FLAG];
    expect(secondTurn(VERBAL_REQUEST, PAYROLL_ONLY_REPLY, "Yes").state.payrollDeduct).toBeNull();
  });
});
