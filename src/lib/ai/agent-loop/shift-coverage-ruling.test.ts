import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { rulesBookText } from "./rules-book";

/*
 * QA's live re-test B4a (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): "I need to make a coaching form
 * for <A>. He was scheduled to come in for a shift on 10/28/2026. He messaged <B> stating he had a personal event happen
 * and would not be into work. He did not find coverage. He also acknowledged the shift coverage policy in Woven on
 * 10/09/2026." cited Standards of Conduct p.12. Which policy fits is the model's decision (QA's class: instruction), so
 * the rules book says it; the replay case nov21-live-retest-b4a-* shows the card a model following it gets.
 */
describe("the rules book: a shift missed without coverage (B4a, item 22)", () => {
  const rules = rulesBookText();
  it("is Attendance, and Shift Replacement when the manager names that policy", () => {
    const ruling = rules.split("\n").find((line) => /without finding coverage/.test(line)) ?? "";
    expect(ruling).toMatch(/is Attendance/);
    expect(ruling).toMatch(/cite Shift Replacement/);
    expect(ruling).toMatch(/acknowledged \(in Woven or on paper\) is background to the account, never the offense/);
  });
  it("the Standards of Conduct takes only acknowledgements left undone", () => {
    expect(rules).toMatch(/Woven training, acknowledgements not done, assigned courses/);
  });
});
