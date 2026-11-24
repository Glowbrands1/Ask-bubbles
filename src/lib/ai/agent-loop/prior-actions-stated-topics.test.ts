import { describe, expect, it } from "vitest";

import { priorActionsWithStatedTopics } from "./tools";

/**
 * QA's live re-test (21 Nov 2026, A6/A7, item 8): "previous coaching was jba policy manual 1-1-26" saved "Coaching —
 * 01/01/2026", the manual lost. The manager's reading of the step (`statedPriorActions`) names the manual; the model's
 * line for that date that drops it is replaced. The route-level case is
 * `replay-pack/nov21-agent-loop-prior-coaching-manual-cases.ts`.
 */
const STATED = ["Coaching — JBA Policy Manual — 01/01/2026"];

describe("prior actions keep a topic the manager named for a step", () => {
  it("\"previous coaching was jba policy manual 1-1-26\": the model's \"Coaching — 01/01/2026\" names the manual", () => {
    expect(priorActionsWithStatedTopics("Coaching — 01/01/2026", STATED)).toBe("Coaching — JBA Policy Manual — 01/01/2026");
  });
  it("a model line that already names the manual is kept as written", () => {
    expect(priorActionsWithStatedTopics("JBA Policy Manual — 01/01/2026", STATED)).toBe("JBA Policy Manual — 01/01/2026");
  });
  it("other steps the model listed are kept; a stated step with no line of its date is added", () => {
    expect(priorActionsWithStatedTopics("Verbal warning — 09/01/2026", STATED)).toBe("Verbal warning — 09/01/2026; Coaching — JBA Policy Manual — 01/01/2026");
  });
  it("a stated step with no topic changes nothing", () => {
    expect(priorActionsWithStatedTopics("Coaching — 01/01/2026", ["Coaching — 01/01/2026"])).toBe("Coaching — 01/01/2026");
  });
});

/* QA's live round 3 (22 Nov 2026, U21): T4's "jba woven policys were acknowledged on 5/26/26" left out of the model's list at T5. */
describe("a stated step with no topic stays on the card (U21, round 3)", () => {
  it("\"Policy acknowledgement — 05/26/2026\", missing from the model's list, is added", () => {
    expect(priorActionsWithStatedTopics("Coaching — 09/22/2026 (cleaning tasks not being completed)", ["Policy acknowledgement — 05/26/2026"])).toBe("Coaching — 09/22/2026 (cleaning tasks not being completed); Policy acknowledgement — 05/26/2026");
  });
  it("a model line for the same date is kept as written", () => {
    expect(priorActionsWithStatedTopics("JBA Woven policies acknowledged — 05/26/2026", ["Policy acknowledgement — 05/26/2026"])).toBe("JBA Woven policies acknowledged — 05/26/2026");
  });
});
