import { describe, expect, it } from "vitest";

import { backdropForPath } from "./backdrop";

describe("backdropForPath", () => {
  it("gives Home the more decorative level", () => {
    expect(backdropForPath("/")).toBe("home");
    expect(backdropForPath(null)).toBe("home");
  });

  it("keeps chat plain, including a conversation's own URL", () => {
    expect(backdropForPath("/chat")).toBe("none");
    expect(backdropForPath("/chat/abc-123")).toBe("none");
  });

  it("keeps the form editor plain but not the template library", () => {
    expect(backdropForPath("/forms/templates/team-member-check-in")).toBe("none");
    expect(backdropForPath("/forms/templates")).toBe("work");
  });

  it("uses the quiet level everywhere else", () => {
    for (const path of ["/history", "/forms/monitoring", "/knowledge", "/admin/integrations", "/reports"]) {
      expect(backdropForPath(path), path).toBe("work");
    }
  });

  it("does not mistake a lookalike path for chat", () => {
    expect(backdropForPath("/chatter")).toBe("work");
  });
});
