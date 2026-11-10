import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stateForTurn, type ConversationFormState } from "./form-state";

/**
 * SECOND_REQUEST_OWN_ACCOUNT_ENABLED, the same request sent again (ported from the sibling app: its sf-s38, QA's
 * round-6 gate, 8 Nov 2026). A request sent twice started a "new request" there, so the card lost its Policy line. This
 * app's words; the person is the pack's invented Remy Calder.
 */
const ASKED = "create a corrective action for Remy Calder, he missed his saturday and sunday shifts at the store and didnt call in";

const STATE = {
  employeeId: "e-remy",
  employeeName: "Remy Calder",
  keptTypedName: null,
  locationId: "loc-264",
  title: null,
  formDate: null,
  warningLevel: null,
  payrollDeduct: null,
  policyHeading: "Attendance",
  policyPage: 14,
  templateKey: "dpoa",
  incident: ASKED,
  incidentType: "Attendance",
} as unknown as ConversationFormState;

const kept = (question: string, earlier: string[] = [ASKED]) => stateForTurn(STATE, question, earlier)?.policyHeading ?? null;

describe("SECOND_REQUEST_OWN_ACCOUNT_ENABLED: the same request sent again keeps its policy", () => {
  beforeEach(() => vi.stubEnv("SECOND_REQUEST_OWN_ACCOUNT_ENABLED", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("the request sent twice keeps the Attendance policy (before the fix it was cleared)", () => {
    expect(stateForTurn(STATE, ASKED, [ASKED])).toBe(STATE);
  });

  it("the same words with other case, spaces or punctuation, or a closing \"please\" / \"thanks\"", () => {
    for (const again of [ASKED.toUpperCase(), `${ASKED}.`, ASKED.replace(/ /g, "  "), `${ASKED} please`, `please ${ASKED}`, `${ASKED}, thanks!`]) {
      expect(kept(again), again).toBe("Attendance");
    }
  });

  it("one word's typo fixed (\"didnt\" → \"didn't\", \"shifts\" → \"shfits\") is still the same request", () => {
    expect(kept(ASKED.replace("didnt", "didn't"))).toBe("Attendance");
    expect(kept(ASKED.replace("shifts", "shfits"))).toBe("Attendance");
  });

  it("a request of its own still gets its own account: another day, another person, another incident", () => {
    for (const other of [
      ASKED.replace("saturday and sunday", "friday and sunday"),
      ASKED.replace("Remy Calder", "Juno Paxton"),
      "create a corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
    ]) {
      expect(kept(other), other).toBeNull();
    }
  });

  it("off: the state is as given", () => {
    vi.stubEnv("SECOND_REQUEST_OWN_ACCOUNT_ENABLED", "");
    expect(stateForTurn(STATE, ASKED, [ASKED])).toBe(STATE);
  });
});
