// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RecapRow } from "@/features/l10/lib/types";

/*
 * QA, 15 Nov 2026: the recaps page renders solved issues stored as plain titles and as { title, owner } (the Hub's
 * newer recaps) side by side without crashing, skips anything else, and tolerates the newer optional fields.
 * Made-up data only.
 */
const state = vi.hoisted(() => ({ recaps: [] as unknown[] }));

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); }, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth/page", () => ({ requireAuthenticatedPage: async () => ({ verified: true }) }));
vi.mock("@/features/l10/L10Frame", () => ({ L10Frame: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/features/l10/actions", () => ({ deleteRecapAction: vi.fn() }));
vi.mock("@/features/l10/data.server", () => ({
  openMeeting: async () => ({
    ok: true,
    meeting: { info: { key: "bcs-dm", name: "BCS DM L10" }, viewer: { id: "h1", label: "a@example.test", name: "Avery", isHubAdmin: false }, loaded: { version: 1, updatedAt: null, doc: {} }, people: [], roster: { members: [], leader: null } },
  }),
  listRecaps: async () => ({ ok: true, recaps: state.recaps }),
}));

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
  resolved_issues: [],
  ...over,
});

afterEach(cleanup);

describe("the recaps page reads both shapes of solved issues", () => {
  it("shows plain titles and { title, owner } together, skips anything else, and shows the notes", async () => {
    state.recaps = [
      recap({
        resolved_issues: ["Old title", { title: "New title", owner: "Bo Lark" }, { title: "No owner" }, null, 7, { owner: "Cy Marlow" }],
        notes: "Talked about the schedule",
        todos_done: null,
        todos_total: null,
      }),
    ];
    const { default: RecapsPage } = await import("@/app/(app)/meetings/[key]/recaps/page");
    render(await RecapsPage({ params: Promise.resolve({ key: "bcs-dm" }), searchParams: Promise.resolve({}) }));
    const list = screen.getByRole("heading", { name: "Issues solved" }).nextElementSibling as HTMLElement;
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Old title", "New title · Bo Lark", "No owner"]);
    expect(document.body.textContent).not.toContain("Cy Marlow");
    expect(document.body.textContent).not.toContain("[object Object]");
    // Notes are shown (Sunny #1032); null to-do counts show no "To-dos completed".
    expect(screen.getByTestId("recap-notes").textContent).toBe("Talked about the schedule");
    expect(screen.queryByTestId("recap-todos-completed")).toBeNull();
  });

  it("shows To-dos completed as a percent when the recap has the counts, and no Notes when it has none", async () => {
    state.recaps = [recap({ resolved_issues: ["Old title"], todos_done: 3, todos_total: 4, notes: null })];
    const { default: RecapsPage } = await import("@/app/(app)/meetings/[key]/recaps/page");
    render(await RecapsPage({ params: Promise.resolve({ key: "bcs-dm" }), searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("recap-todos-completed").textContent).toBe("To-dos completed75%");
    expect(screen.queryByTestId("recap-notes")).toBeNull();
  });
});
