// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

/* Port from Ask Sunny: a time shown to people is in the business zone (Central), never the host's or browser's. */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE = "America/Chicago";
});

describe("admin feedback queue times", () => {
  it("03:30 UTC on the 15th is 9:30 PM CT on the 14th", async () => {
    const { longDate, shortDate } = await import("./feedback-queue");
    expect(longDate("2026-11-15T03:30:00Z")).toBe("Nov 14, 9:30 PM CT");
    expect(shortDate("2026-11-15T03:30:00Z")).toBe("Nov 14");
  });
  it("admin usage shape: the day of a point is the Central day", async () => {
    const { shortDate } = await import("./usage-shape");
    expect(shortDate("2026-11-15T03:30:00Z")).toBe("Nov 14");
  });
  it("another business zone keeps its own label", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_TIMEZONE", "America/New_York");
    const { formatBusinessTime } = await import("@/lib/business-date");
    expect(formatBusinessTime("2026-11-14T12:01:00Z")).toBe("Nov 14, 7:01 AM ET");
    vi.unstubAllEnvs();
  });
});
