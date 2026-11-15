import { describe, expect, it } from "vitest";

import { cellText } from "../assistant/citations";
import { pastMeetings } from "./past";
import { issuesSection, recapsSection } from "./report";
import { solvedIssues, solvedOwner, solvedTitle, type RecapRow } from "./types";

/*
 * QA, 15 Nov 2026: the Leadership Hub is about to store each solved issue on a NEW recap as { title, owner } instead of
 * a plain title; recaps the Hub auto-saves stay plain titles. Every reader here takes both shapes and skips anything
 * else, so an object never reaches JSX as a child (which would crash the page). Made-up data only.
 */
const JUNK: unknown[] = [null, undefined, 7, true, ["Nested"], {}, { title: 3 }, { owner: "Bo Lark" }];

const recap = (over: Partial<RecapRow> = {}): RecapRow => ({
  id: "r1",
  meeting_key: "bcs-dm",
  session_id: "s1",
  held_at: "2026-11-16T20:10:00.000Z",
  rating_avg: 9,
  attendee_count: 2,
  duration_seconds: 3600,
  cascade: null,
  attendees: [],
  open_todos: [],
  resolved_issues: ["Old title", { title: "New title", owner: "Bo Lark" }, ...JUNK],
  ...over,
});

describe("solvedTitle / solvedOwner / solvedIssues", () => {
  it("a plain title is itself, with no owner", () => {
    expect(solvedTitle("Door sticks")).toBe("Door sticks");
    expect(solvedOwner("Door sticks")).toBeNull();
  });

  it("an object gives its title and owner; a missing or blank owner is none", () => {
    expect(solvedTitle({ title: "Door sticks", owner: "Bo Lark" })).toBe("Door sticks");
    expect(solvedOwner({ title: "Door sticks", owner: "Bo Lark" })).toBe("Bo Lark");
    expect(solvedOwner({ title: "Door sticks" })).toBeNull();
    expect(solvedOwner({ title: "Door sticks", owner: null })).toBeNull();
    expect(solvedOwner({ title: "Door sticks", owner: "  " })).toBeNull();
  });

  it("anything else is no title and no owner, and is skipped from a list", () => {
    for (const j of JUNK) {
      expect(solvedTitle(j)).toBeNull();
      expect(solvedOwner(j)).toBeNull();
    }
    expect(solvedIssues(recap().resolved_issues)).toEqual([
      { title: "Old title", owner: null },
      { title: "New title", owner: "Bo Lark" },
    ]);
    expect(solvedIssues(undefined)).toEqual([]);
    expect(solvedIssues("not a list")).toEqual([]);
  });
});

describe("the readers take both shapes", () => {
  it("Past meetings: titles from both shapes, junk not counted", () => {
    const [row] = pastMeetings([recap()], {});
    expect(row.solvedTitles).toEqual(["Old title", "New title"]);
    expect(row.issuesSolved).toBe(2);
  });

  it("the report: solved counts from both shapes, junk not counted", () => {
    expect(issuesSection([], [recap()]).solvedLast).toBe(2);
    expect(recapsSection([recap()])[0].solved).toBe(2);
  });

  it("a recap with the newer optional fields (notes, to-do counts, possibly null) reads as before", () => {
    const withNew = recap({ resolved_issues: ["Old title"], notes: "Talked about the schedule", todos_done: null, todos_total: 4 });
    expect(pastMeetings([withNew], {})[0]).toMatchObject({ issuesSolved: 1, solvedTitles: ["Old title"] });
    expect(recapsSection([withNew, recap({ id: "r2", notes: null, todos_done: 3, todos_total: 4 })]).map((r) => r.solved)).toEqual([1, 2]);
  });

  it("the assistant's source viewer shows a mixed list as titles (with owners), not as JSON", () => {
    expect(cellText(["Old title", { title: "New title", owner: "Bo Lark" }, { title: "No owner" }])).toBe("Old title, New title (Bo Lark), No owner");
    // A list of other objects is shown as before.
    expect(cellText([{ a: 1 }])).toBe('[{"a":1}]');
  });
});
