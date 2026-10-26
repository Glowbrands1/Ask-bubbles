import { afterEach, describe, expect, it, vi } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, intentPayrollManagerOnlyEnabled } from "@/lib/config/chat-quality-flags";

import type { ConversationFormState } from "./form-state";
import { decideIntentTurn, type IntentTurnInput } from "./intent-slots";

/**
 * conv_mvmf4x1i2qxha7u, 24 Oct 2026, 13:12 UTC. The turns below are the
 * saved chat_messages, word for word. The manager said "verbal, no payroll".
 * chat_form_state saved payrollAmount "25" and payrollDeduct "yes": the $25
 * is the assistant's quote of the Late Opening policy, not the manager's.
 */

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-67", name: "Bellevue, NE" },
] as const;

const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;

const HEADINGS = ["Attendance", "Late Opening", "Standards of Conduct"];

const TURNS = [
  { role: "user", content: "CA for Testy Testerson at Bellevue, NE" },
  {
    role: "assistant",
    content:
      "I still need which employee — **Testy Testerson** is not in the Woven roster, what happened, the date it happened, and which form.",
  },
  { role: "user", content: "late opening on 10-21" },
  {
    role: "assistant",
    content:
      'Got it — same details as before: late opening on 10/21/2026, verbal, no payroll deduction.\n\nYou already have three Corrective Action Form drafts for Testy Testerson sitting unfinalized from earlier today. Worth checking the Forms Register to see if one of those already has what you need before making another, so you don\'t end up with duplicates on file.\n\nFor reference, Late Opening policy says the employee who fails to open is required to reimburse the company $25 via payroll deduction when applicable, and restitution to affected clients is handled by the manager or DM. If you\'re going verbal/no payroll, that\'s your call to document as the deviation from the standard policy language.\n\nJust say "create a corrective action form for Testy Testerson" when you\'re ready and I\'ll bring up a fresh draft card.',
  },
  { role: "user", content: "verbal, no payroll" },
] as const;

/** Each user turn in order, with the state the previous turn saved. */
function replay(): ConversationFormState {
  let saved: ConversationFormState | null = null;
  TURNS.forEach((turn, at) => {
    if (turn.role !== "user") return;
    const input: IntentTurnInput = {
      question: turn.content,
      history: TURNS.slice(0, at).map((item) => ({ role: item.role, content: item.content })),
      today: "2026-10-24",
      saved,
      raw: null,
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates: TEMPLATES,
      formInProgress: at > 0,
    };
    saved = decideIntentTurn(input).state;
  });
  return saved!;
}

describe("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults off and is a chat-quality flag", () => {
    expect(intentPayrollManagerOnlyEnabled()).toBe(false);
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("INTENT_PAYROLL_MANAGER_ONLY_ENABLED");
  });

  it('keeps "verbal, no payroll" as No and takes no amount from the policy quote', () => {
    vi.stubEnv("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "true");
    const state = replay();
    expect(state.payrollDeduct).toBe("no");
    expect(state.payrollAmount).toBeNull();
    expect(state.warningLevel).toBe("verbal");
    expect(state.locationId).toBe("loc-67");
    expect(state.formDate).toBe("2026-10-21");
  });

  it("still takes an amount the manager typed", () => {
    vi.stubEnv("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "true");
    const state = decideIntentTurn({
      question: "CA for Testy Testerson at Bellevue, NE, late opening on 10-21, verbal, payroll deduct $25",
      history: [],
      today: "2026-10-24",
      saved: null,
      raw: null,
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates: TEMPLATES,
      formInProgress: false,
    }).state;
    expect(state.payrollDeduct).toBe("yes");
    expect(state.payrollAmount).toBe("25");
  });

  it("does not take a shortage amount as a payroll deduction (QA, 24 Oct 2026)", () => {
    vi.stubEnv("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "true");
    const state = decideIntentTurn({
      question: "CA for Testy Testerson at Bellevue, NE, register short $40 on 10-21, verbal",
      history: [],
      today: "2026-10-24",
      saved: null,
      raw: null,
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates: TEMPLATES,
      formInProgress: false,
    }).state;
    expect(state.payrollDeduct).toBeNull();
    expect(state.payrollAmount).toBeNull();
  });

  it("off, reads the assistant's $25 as before (the saved state on 24 Oct)", () => {
    // Pinned to LATE_OPEN_DATE off, the state this pins; the env may set it (with it on, payroll is read from the manager's own Yes/No, its intended change). Restored by unstubAllEnvs.
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
    const state = replay();
    expect(state.payrollAmount).toBe("25");
    expect(state.payrollDeduct).toBe("yes");
  });
});
