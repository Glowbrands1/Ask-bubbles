import { describe, expect, it } from "vitest";

import { attendanceKindSaid } from "./attendance-said";

/** QA's live re-test (21 Nov 2026, Pau's account, agent loop on), item 25: the manager's words, an invented name. */
describe("attendanceKindSaid", () => {
  it.each([
    "create ca form for Fenna Prewitt for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching",
    "verbal",
    "create ca form for Fenna Prewitt for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching\nverbal",
  ])("says no kind: %s", (words) => {
    expect(attendanceKindSaid(words)).toBe(false);
  });

  it.each([
    "ca for Fenna Prewitt, she did not come in on 10-20-26, attendance policy",
    "she was a no call no show on 10/20",
    "she was 20 minutes late on 10/20",
    "she was tardy again",
    "she left early on 10/20",
    "she walked out mid-shift",
    "she clocked out early without telling anyone",
    "she called out on 10/20",
    "she missed her shift on 10/20",
  ])("says the kind: %s", (words) => {
    expect(attendanceKindSaid(words)).toBe(true);
  });
});
