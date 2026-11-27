import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/l10/partner/client.server", () => ({ callHub: vi.fn() }));

import { leadershipHubUrl } from "@/config/company/app-links";
import { meetingDetailsFromHub, meetingEventsFromHub, setMeetingOccurrenceInHub, setMeetingScheduleInHub } from "./hub";
import { meetingHref, noDaySet, parseMeetingDetails, pickMeetings, scheduleLabel, shortDate, type MeetingDetails } from "./meeting-details";

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

/**
 * Port from the sibling app (the owner, 27 Nov 2026: "can u ask it to plot the calendar pls for all meetings recurring
 * DM L10 etc"). The Hub now
 * sends the shared Leadership and Maintenance L10s too, marked opensInApp false: this app plots them and links them to
 * the Hub. An admin's day and time go to the Hub ("set-meeting-schedule").
 */
describe("every recurring L10 (the owner, 27 Nov 2026)", () => {
  const hub = leadershipHubUrl();
  const OWN = DM;
  it("plots the Leadership and Maintenance L10s, linked to the Hub; this app's own L10 stays on its L10 tab", async () => {
    const call = vi.fn(async () => ({
      status: 200,
      body: {
        ok: true,
        events: [
          { id: "hub:meeting:leadership:2026-11-30", source: "leadership-hub", kind: "meeting", title: "Leadership L10", date: "2026-11-30", startTime: "09:00", href: "/meetings/leadership", meetingKey: "leadership", opensInApp: false },
          { id: `hub:meeting:${OWN.key}:2026-11-30`, source: "leadership-hub", kind: "meeting", title: OWN.name, date: "2026-11-30", href: `/meetings/${OWN.key}`, meetingKey: OWN.key },
          { id: "hub:meeting:maintenance:2026-12-02", source: "leadership-hub", kind: "meeting", title: "Maintenance L10", date: "2026-12-02", href: "/meetings/maintenance", meetingKey: "maintenance", opensInApp: false },
        ],
      },
    }));
    const r = await meetingEventsFromHub("owner@example.test", { from: "2026-11-29", to: "2026-12-05" }, call as never);
    expect(r.state).toBe("ok");
    const events = r.state === "ok" ? r.events : [];
    expect(events.map((e) => [e.meetingKey, e.href])).toEqual([
      ["leadership", `${hub}/meetings/leadership`],
      [OWN.key, `/meetings/${OWN.key}`],
      ["maintenance", `${hub}/meetings/maintenance`],
    ]);
    expect(parseMeetingDetails([{ ...OWN, key: "leadership", opensInApp: false }])[0]).toMatchObject({ opensInApp: false });
    expect(meetingHref({ key: "leadership", opensInApp: false }, hub)).toBe(`${hub}/meetings/leadership`);
    expect(meetingHref(OWN, hub)).toBe(`/meetings/${OWN.key}`);
  });

  it("an admin's day and time go to the Hub as set-meeting-schedule; a refusal says why", async () => {
    const call = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const input = { key: OWN.key, weekday: 2, time: "10:30", minutes: 60 };
    expect(await setMeetingScheduleInHub("owner@example.test", input, call as never)).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith("set-meeting-schedule", "owner@example.test", input);
    const refused = async () => ({ status: 200, body: { ok: false, reason: "forbidden" } });
    expect(await setMeetingScheduleInHub("p@example.test", input, refused as never)).toEqual({ ok: false, reason: "forbidden" });
    expect(await setMeetingScheduleInHub("p@example.test", input, (async () => ({ status: 503, body: {} })) as never)).toEqual({ ok: false, reason: "unavailable" });
    expect(await setMeetingScheduleInHub(null, input, call as never)).toEqual({ ok: false, reason: "signin" });
  });
});

describe('"make it recurring or just for that specific time" (the owner, 27 Nov 2026)', () => {
  it("one date's time goes to the Hub as set-meeting-occurrence; a refusal says why", async () => {
    const call = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    const input = { key: "bcs-dm", date: "2026-11-03", time: "11:30", minutes: null, cancelled: false };
    expect(await setMeetingOccurrenceInHub("owner@example.test", input, call as never)).toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith("set-meeting-occurrence", "owner@example.test", input);
    expect(await setMeetingOccurrenceInHub("p@example.test", input, (async () => ({ status: 200, body: { ok: false, reason: "invalid" } })) as never)).toEqual({ ok: false, reason: "invalid" });
    expect(await setMeetingOccurrenceInHub(null, input, call as never)).toEqual({ ok: false, reason: "signin" });
    expect(shortDate("2026-11-03")).toBe("Tue, Nov 3");
  });
});
