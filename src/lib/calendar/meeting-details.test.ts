import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/l10/partner/client.server", () => ({ callHub: vi.fn() }));

import { meetingDetailsFromHub } from "./hub";
import { noDaySet, parseMeetingDetails, pickMeetings, scheduleLabel, type MeetingDetails } from "./meeting-details";

/* Invented people only. */
const DM: MeetingDetails = { key: "bcs-dm", name: "BCS DM L10", team: "BCS District Managers", weekday: 1, startTime: null, minutes: 90, leader: "Robin Example", attendees: ["Robin Example", "Pat Sample"] };
const GM: MeetingDetails = { key: "bcs-gm", name: "Example GM L10", team: null, weekday: null, startTime: null, minutes: 60, leader: "Lee Demo", attendees: ["Lee Demo"] };

describe("L10 details from the Leadership Hub (leadership-hub docs/calendar-design.md §5d)", () => {
  it("keeps well-formed meetings and drops a malformed one", () => {
    expect(parseMeetingDetails([DM, { key: "BAD", name: "x" }, "nope", GM])).toEqual([DM, GM]);
    expect(parseMeetingDetails(null)).toEqual([]);
  });

  it("says the schedule in words and never invents a time", () => {
    expect(scheduleLabel({ weekday: 1, startTime: "09:00", minutes: 90 })).toBe("Mondays at 9:00 AM CT · 90 min");
    expect(scheduleLabel(DM)).toBe("Mondays · time not set · 90 min");
    expect(scheduleLabel(GM)).toBe("No day set");
    expect(noDaySet([DM, GM])).toEqual([GM]);
  });

  it("finds a meeting by the name a manager uses", () => {
    expect(pickMeetings([DM, GM], "the BCS DM L10").map((m) => m.key)).toEqual(["bcs-dm"]);
    expect(pickMeetings([DM, GM], "bcs-dm").map((m) => m.key)).toEqual(["bcs-dm"]);
    expect(pickMeetings([DM, GM], "GM").map((m) => m.key)).toEqual(["bcs-gm"]);
    expect(pickMeetings([DM, GM], "").length).toBe(2);
    expect(pickMeetings([DM, GM], "Leadership")).toEqual([]);
  });

  it("asks the Hub's meeting-schedules op for this person, and tells apart off, none and failed", async () => {
    const call = vi.fn(async () => ({ status: 200, body: { ok: true, meetings: [DM, { bad: true }] } }));
    expect(await meetingDetailsFromHub("pat@example.test", call as never)).toEqual({ state: "ok", meetings: [DM] });
    expect(call).toHaveBeenCalledWith("meeting-schedules", "pat@example.test");
    expect(await meetingDetailsFromHub(null, call as never)).toEqual({ state: "off" });
    expect(await meetingDetailsFromHub("p@example.test", (async () => ({ status: 0, body: { error: "not_configured" } })) as never)).toEqual({ state: "off" });
    expect(await meetingDetailsFromHub("p@example.test", (async () => ({ status: 404, body: {} })) as never)).toEqual({ state: "ok", meetings: [] });
    expect(await meetingDetailsFromHub("p@example.test", (async () => ({ status: 503, body: {} })) as never)).toEqual({ state: "failed" });
  });
});
