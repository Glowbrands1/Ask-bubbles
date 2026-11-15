// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { pastMeetings } from "@/features/l10/lib/past";
import type { RecapRow } from "@/features/l10/lib/types";
import { PastMeetings } from "./_components/PastMeetings";

/* Past meetings shows a recap's notes and "To-dos completed" (Sunny #1032; QA, 15 Nov 2026). Made-up data only. */
const recap = (over: Partial<RecapRow> = {}): RecapRow => ({
  id: "r1",
  meeting_key: "bcs-dm",
  session_id: "s1",
  held_at: "2026-11-16T20:10:00.000Z",
  rating_avg: 9,
  attendee_count: 1,
  duration_seconds: 3600,
  cascade: null,
  attendees: [{ name: "Avery Quill", rating: 9 }],
  open_todos: [],
  resolved_issues: [{ title: "Door sticks", owner: "Bo Lark" }],
  ...over,
});

afterEach(cleanup);

describe("Past meetings: notes and To-dos completed", () => {
  it("shows both when the recap has them", () => {
    render(<PastMeetings meetingKey="bcs-dm" meetingName="BCS DM L10" meetings={pastMeetings([recap({ notes: "Talked about the schedule", todos_done: 1, todos_total: 3 })], {})} />);
    // Notes now sit in the row's full summary, its NOTES section (Sunny #1040), not on the row itself.
    const summary = within(screen.getByTestId("meeting-summary"));
    expect(summary.getByText("Talked about the schedule")).toBeTruthy();
    expect(screen.getByTestId("past-todos-completed").textContent).toBe("33%");
    expect(document.body.textContent).toContain("Door sticks");
  });

  it("shows neither on an older or auto-saved recap (no notes, null counts)", () => {
    render(<PastMeetings meetingKey="bcs-dm" meetingName="BCS DM L10" meetings={pastMeetings([recap({ notes: null, todos_done: null, todos_total: null })], {})} />);
    expect(screen.queryByTestId("past-todos-completed")).toBeNull();
    // The summary always lists both (Sunny #1040): a dash and "No notes." here.
    const summary = within(screen.getByTestId("meeting-summary"));
    expect(summary.getByText("To-dos completed").nextElementSibling?.textContent).toBe("—");
    expect(summary.getByText("No notes.")).toBeTruthy();
  });
});
