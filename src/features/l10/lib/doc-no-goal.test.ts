import { describe, expect, it } from "vitest";

import { cellTone, hasGoal, isMiss } from "./doc";
import type { ScorecardRow } from "./types";

const row = (over: Partial<ScorecardRow> = {}): ScorecardRow => ({
  id: "r",
  metric: "Store · Labor %",
  owner: "DM",
  goal: "≥ 5%",
  goalValue: 5,
  higherIsBetter: true,
  format: "percent",
  weeks: [],
  ...over,
});

// Port from the Leadership Hub (Glowbrands1/leadership-hub#106): a metric set up with its goal left blank
// ("leave goals blank", the owner, 18 Nov 2026) is never green or red until someone gives it a goal.
describe("scorecard metric with no goal", () => {
  it("shows its values plain, never on or off goal", () => {
    const blank = row({ goal: "", goalValue: 0 });
    expect(cellTone(blank, 12.5)).toBe("plain");
    expect(cellTone(blank, 0)).toBe("plain");
    expect(cellTone(blank, null)).toBe("empty");
    expect(cellTone(blank, -3)).toBe("negative");
    expect(cellTone(row({ goal: "   ", goalValue: 0, higherIsBetter: false }), 40)).toBe("plain");
    expect(isMiss(blank, 12.5)).toBe(false);
    expect(hasGoal(blank)).toBe(false);
    expect(hasGoal(row())).toBe(true);
    expect(cellTone(row(), 6)).toBe("good");
    expect(cellTone(row(), 3)).toBe("bad");
  });
});
