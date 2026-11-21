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
