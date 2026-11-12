import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installEarlierManagerTurns, readExitFacts } from "./exit-facts";
import { separateQuestions } from "./message-parts";

/**
 * FIELD_LABEL_NOT_A_QUESTION_ENABLED, the round-6 rollback (QA, 9 Nov 2026), in the replayed chat's wording (the
 * person and address invented): turn 1 said "immediate voluntary term, no notice given"; turn 5, "resignation date
 * 10-26-2026. how employee resigned - Marisol told management she quit …", filled "Date that notice was given:
 * October 26, 2026" and added 'You also asked "how employee resigned - …"'.
 */
const TURN_1 =
  "create an exit for marisol fenwick, assistant store manager at lees summit, mo. last day worked 10-26-26. store items not returned and $25 will be payroll deducted for store key. immediate voluntary term, no notice given. payroll deduct applies. drop wage and forfeit bonus. not eligible for rehire. marisol's address is 812 Ne Larkmoor Court, lees summit, MO. 64064";
const TURN_4 = "create exit for marisol fenwick";
const TURN_5 =
  "resignation date 10-26-2026. how employee resigned - Marisol told management she quit effective immediately on 10-26-2026. Reason for resignation - Marisol quit due to personal family issues.";
const TODAY = "2026-11-08";
/** What the exit card reads at turn 5: this form's turns, from turn 4's request on. */
const SCOPED = `${TURN_4}\n${TURN_5}`;

beforeEach(() => {
  vi.stubEnv("NO_NOTICE_NO_DATE_ENABLED", "true");
  vi.stubEnv("FIELD_LABEL_NOT_A_QUESTION_ENABLED", "true");
  installEarlierManagerTurns(() => [TURN_1, "marisol told management on 10-26-26 that she quit effective immediately due to personal reasons.", "exit is for marisol fenwick", TURN_4]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  installEarlierManagerTurns(() => undefined);
});

describe("an earlier \"no notice given\" holds on the exit card", () => {
  it("off: the resignation date is also the notice date (the bug)", () => {
    // Changed on purpose (QA, 12 Nov 2026): EXIT_NOTICE_STATED_ONLY pinned off — with it on, a resignation date never
    // dates the notice by itself (next arm).
    vi.stubEnv("EXIT_NOTICE_STATED_ONLY_ENABLED", "false");
    vi.stubEnv("FIELD_LABEL_NOT_A_QUESTION_ENABLED", "");
    expect(readExitFacts(SCOPED, TODAY).noticeGiven).toBe("2026-10-26");
  });

  it("off, with EXIT_NOTICE_STATED_ONLY on: no notice is stated, so no notice date", () => {
    vi.stubEnv("EXIT_NOTICE_STATED_ONLY_ENABLED", "true");
    vi.stubEnv("FIELD_LABEL_NOT_A_QUESTION_ENABLED", "");
    expect(readExitFacts(SCOPED, TODAY).noticeGiven).toBeNull();
    expect(readExitFacts(SCOPED, TODAY).resignationDate).toBe("2026-10-26");
  });

  it("on: no notice date; the resignation date stays", () => {
    const facts = readExitFacts(SCOPED, TODAY);
    expect(facts.noticeGiven).toBeNull();
    expect(facts.resignationDate).toBe("2026-10-26");
  });

  it("on: notice stated in the text read keeps its date (\"gave notice 10/12\")", () => {
    expect(readExitFacts("exit for marisol fenwick. gave notice 10/12/26, last day worked 10/26/26", TODAY).noticeGiven).toBe("2026-10-12");
  });

  it("on: no earlier turns entered (the draft, a test): as before", () => {
    // Changed on purpose (QA, 12 Nov 2026): EXIT_NOTICE_STATED_ONLY pinned off; the next arm holds it on.
    vi.stubEnv("EXIT_NOTICE_STATED_ONLY_ENABLED", "false");
    installEarlierManagerTurns(() => undefined);
    expect(readExitFacts(SCOPED, TODAY).noticeGiven).toBe("2026-10-26");
  });

  it("on, with EXIT_NOTICE_STATED_ONLY on and no earlier turns: no notice is stated, so no notice date", () => {
    vi.stubEnv("EXIT_NOTICE_STATED_ONLY_ENABLED", "true");
    installEarlierManagerTurns(() => undefined);
    expect(readExitFacts(SCOPED, TODAY).noticeGiven).toBeNull();
    expect(readExitFacts(SCOPED, TODAY).resignationDate).toBe("2026-10-26");
  });
});

describe("a field label is no question", () => {
  it("off: \"how employee resigned - …\" is a question (the stray \"You also asked\")", () => {
    vi.stubEnv("FIELD_LABEL_NOT_A_QUESTION_ENABLED", "");
    expect(separateQuestions(TURN_5).questions).toHaveLength(1);
  });

  it("on: the turn's labels are statements; a real question is still one", () => {
    expect(separateQuestions(TURN_5).questions).toEqual([]);
    expect(separateQuestions("how employee resigned - told management").questions).toEqual([]);
    expect(separateQuestions("how employee resigned?").questions).toEqual(["how employee resigned?"]);
    expect(separateQuestions("how do I fill in the notice date").questions).toHaveLength(1);
  });
});
