import { afterEach, describe, expect, it, vi } from "vitest";

import { describedAttendanceKeys } from "./ca-policy";

/**
 * QA's Bubbles round-3 gate (7 Nov 2026): with DENIAL_NO_ACCOUNT and DESCRIBED_ATTENDANCE_CARD on, "ca for <name>
 * not late" and "create a corrective action for <name>, not late" were drafted as "Policy: Attendance, from what you
 * described ("late")". A denied fault describes no attendance. The pack's invented Rowan Kestrel.
 */
afterEach(() => vi.unstubAllEnvs());

describe("describedAttendanceKeys and a denied fault", () => {
  it("off: read as before (the denied \"late\" counts)", () => {
    expect(describedAttendanceKeys("ca for Rowan Kestrel not late")).not.toBeNull();
  });

  describe("DESCRIBED_ATTENDANCE_CARD_ENABLED on", () => {
    const on = () => vi.stubEnv("DESCRIBED_ATTENDANCE_CARD_ENABLED", "true");

    it("QA's two wordings describe no attendance", () => {
      on();
      expect(describedAttendanceKeys("ca for Rowan Kestrel not late")).toBeNull();
      expect(describedAttendanceKeys("create a corrective action for Rowan Kestrel, not late")).toBeNull();
      expect(describedAttendanceKeys("ca for Rowan Kestrel, she was never late")).toBeNull();
    });

    it("lateness or absence that is stated still counts", () => {
      on();
      expect(describedAttendanceKeys("ca for Rowan Kestrel, she was late on 11/2")).not.toBeNull();
      expect(describedAttendanceKeys("ca for Rowan Kestrel, she didn't show up and was late on 11/2")).not.toBeNull();
      expect(describedAttendanceKeys("ca for Rowan Kestrel, not late but absent from her shift on 11/2")).not.toBeNull();
    });
  });
});

describe("withoutDeniedFaults: the denial goes, what sits beside it stays (coding 2's review)", () => {
  it("removes the denied fault and keeps the account or omission next to it", async () => {
    const { withoutDeniedFaults } = await import("./denial-no-account");
    const kept = (text: string) => withoutDeniedFaults(text).replace(/\s+/g, " ").trim();
    expect(kept("not late but left the register open")).toBe("but left the register open");
    expect(kept("she was never late, she did not count the drawer")).toBe("she was , she did not count the drawer");
    expect(kept("wasn't really late and forgot to clock out")).toBe("and forgot to clock out");
    expect(kept("she didn't show up and was late")).toBe("she didn't show up and was late");
    expect(kept("no complaints, but she was absent on 11/2")).toBe(", but she was absent on 11/2");
  });
});
