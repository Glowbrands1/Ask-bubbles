import { describe, expect, it } from "vitest";

import { backdropForPath, chromeForPath } from "./backdrop";

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

describe("chromeForPath", () => {
  it("gives Home and every chat URL the band header, with no separate bar", () => {
    expect(chromeForPath("/")).toBe("band");
    expect(chromeForPath(null)).toBe("band");
    expect(chromeForPath("/chat")).toBe("band");
    expect(chromeForPath("/chat/abc-123")).toBe("band");
  });

  it("keeps the plain bar everywhere else, lookalikes included", () => {
    for (const path of ["/history", "/forms/monitoring", "/knowledge", "/reports", "/chatter"]) {
      expect(chromeForPath(path), path).toBe("plain");
    }
  });
});
