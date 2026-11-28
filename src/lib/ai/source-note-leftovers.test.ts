import { describe, expect, it } from "vitest";

import { withoutLoopMarkers } from "./source-note";

/* Port of the sibling app (the owner's live check, 28 Nov 2026): "(<the coaching guide>,)" after its [S3] was removed. */
describe("withoutLoopMarkers (the loop's reply)", () => {
  it("the live line: the comma before the removed marker goes with it", () => {
    expect(withoutLoopMarkers("Words to use (Store Coaching Guide, [S3]): \"We've already had a written warning on file.\"")).toBe("Words to use (Store Coaching Guide): \"We've already had a written warning on file.\"");
  });

  it("markers elsewhere go as before, and brackets left empty go too", () => {
    expect(withoutLoopMarkers("Attendance matters [S2]. See the manual ([S1]).")).toBe("Attendance matters. See the manual.");
  });

  it("leaves ordinary brackets and commas alone", () => {
    expect(withoutLoopMarkers("A common excuse (overslept, car trouble) is not a plan.")).toBe("A common excuse (overslept, car trouble) is not a plan.");
  });
});
