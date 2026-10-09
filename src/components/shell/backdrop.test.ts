import { describe, expect, it } from "vitest";

import { backdropForPath, chromeForPath, isBandPage } from "./backdrop";

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
    expect(backdropForPath("/forms/templates")).toBe("band");
  });

  it("gives the band pages the patterned soft-tint canvas", () => {
    for (const path of [
      "/history",
      "/knowledge",
      "/forms/monitoring",
      "/forms/templates",
      "/reports",
      "/reports/location-performance",
      "/admin/analytics",
    ]) {
      expect(backdropForPath(path), path).toBe("band");
    }
  });

  it("uses the quiet level everywhere else", () => {
    for (const path of ["/admin/integrations", "/admin/users", "/admin/ai-usage", "/knowledge/document/abc"]) {
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

  it("gives the band pages the band header too", () => {
    for (const path of ["/history", "/forms/monitoring", "/forms/templates", "/knowledge", "/reports", "/admin/analytics"]) {
      expect(chromeForPath(path), path).toBe("band");
    }
  });

  it("keeps the plain bar everywhere else, lookalikes included", () => {
    for (const path of [
      "/chatter",
      "/historyx",
      "/admin/users",
      "/admin/integrations",
      "/knowledge/document/abc",
      "/forms/templates/team-member-check-in",
    ]) {
      expect(chromeForPath(path), path).toBe("plain");
    }
  });
});

describe("isBandPage", () => {
  it("keeps the template editor and a single document plain", () => {
    expect(isBandPage("/forms/templates")).toBe(true);
    expect(isBandPage("/forms/templates/team-member-check-in")).toBe(false);
    expect(isBandPage("/knowledge")).toBe(true);
    expect(isBandPage("/knowledge/document/abc")).toBe(false);
    expect(isBandPage("/admin/analyticsx")).toBe(false);
    expect(isBandPage(null)).toBe(false);
  });
});
