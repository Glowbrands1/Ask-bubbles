// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { OverviewScreen, type OverviewFollowUps } from "./overview";

/**
 * HOME READS THE FORMS DATABASE, AND ONLY THE FORMS DATABASE.
 *
 * The desync this guards was structural, not arithmetic: a follow-up card that
 * derived its figures from `useAppStore().forms`, a browser-side collection
 * with its own statuses, while the forms register read Supabase. Two sources,
 * two answers, same location.
 *
 * So the load-bearing tests here are the two that assert the SOURCE — that the
 * card renders what the server handed it, and that the module no longer reaches
 * for the store's forms at all. The rest check the wording and the colour, and
 * that the page invents nothing where no data source is connected.
 */

const TODAY = "2026-09-04";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

/*
 * The store still backs the knowledge list on this screen, which is allowed.
 * It is stubbed with an EMPTY forms array so that if the follow-up card ever
 * starts reading it again, it renders nothing and the assertions below fail
 * loudly.
 */
vi.mock("@/lib/store/app-store", () => ({
  useAppStore: () => ({
    forms: [],
    documents: [],
    /*
     * The band writes its inline turns to the same store the chat screen uses,
     * and reads the thread back out of it. These cases never send, so no-ops
     * are enough.
     */
    conversations: [],
    addConversation: () => {},
    appendConversationMessages: () => {},
    updateConversation: () => {},
  }),
}));

vi.mock("@/lib/session/session-context", () => ({
  useSession: () => ({
    user: { name: "Test Owner", isLocationAccount: false, title: "Owner", scope: {} },
    role: "owner",
    can: () => true,
    primaryLocationName: "Testville Downtown",
    managerDisplayName: "Test",
    demoMode: true,
    /* The band asks through the real provider, which needs the brand's scope. */
    brand: { knowledgeScopeId: "company-core" },
  }),
}));

vi.mock("@/components/shell/app-shell", () => ({
  DesktopSearchLauncher: () => null,
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function followUps(overrides: Partial<OverviewFollowUps> = {}): OverviewFollowUps {
  return {
    attention: { overdue: 0, dueThisWeek: 0, needsAttention: 0 },
    items: [],
    today: TODAY,
    failure: null,
    connected: true,
    excluded: 0,
    scopeLabel: null,
    ...overrides,
  };
}

function Overview(props: { followUps: OverviewFollowUps }) {
  return <OverviewScreen followUps={props.followUps} />;
}

describe("the follow-ups card", () => {
  it("states the counts the server calculated", () => {
    render(
      <Overview
        followUps={followUps({ attention: { overdue: 2, dueThisWeek: 2, needsAttention: 4 } })}
      />,
    );
    expect(screen.getByText("4 follow-ups need attention")).toBeTruthy();
    expect(screen.getByText("2 overdue · 2 due this week")).toBeTruthy();
  });

  it("lists the rows the server sent, with the location and how late each is", () => {
    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 1, dueThisWeek: 1, needsAttention: 2 },
          items: [
            {
              id: "a",
              employeeName: "Jane Kowalski",
              templateName: "Coaching Form",
              locationName: "Testville Downtown",
              followUpDate: "2026-09-01",
              overdue: true,
            },
            {
              id: "b",
              employeeName: "Sofia Delgado",
              templateName: "Policy Review",
              locationName: "Testville Uptown",
              followUpDate: "2026-09-05",
              overdue: false,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Jane Kowalski")).toBeTruthy();
    expect(screen.getByText("Coaching Form · Testville Downtown")).toBeTruthy();
    // Measured against the business date the server passed, not the demo
    // anchor — which would call these dates "in 6 days".
    expect(screen.getByText("3 days late")).toBeTruthy();
    expect(screen.getByText("Sofia Delgado")).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
  });

  it("gives an overdue row the filled follow-up pink and an upcoming one nothing", () => {
    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 1, dueThisWeek: 1, needsAttention: 2 },
          items: [
            {
              id: "a",
              employeeName: "Jane Kowalski",
              templateName: "Coaching Form",
              locationName: null,
              followUpDate: "2026-09-01",
              overdue: true,
            },
            {
              id: "b",
              employeeName: "Sofia Delgado",
              templateName: "Policy Review",
              locationName: null,
              followUpDate: "2026-09-05",
              overdue: false,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("3 days late").className).toContain("bg-followup-attention");
    expect(screen.getByText("Tomorrow").className).not.toContain("followup");
  });

  it("links each row to the filter it belongs to", () => {
    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 1, dueThisWeek: 1, needsAttention: 2 },
          items: [
            { id: "a", employeeName: "Late Row", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-01", overdue: true },
            { id: "b", employeeName: "Soon Row", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-05", overdue: false },
          ],
        })}
      />,
    );
    expect(screen.getByText("Late Row").closest("a")?.getAttribute("href")).toBe(
      "/forms/monitoring?followup=overdue",
    );
    expect(screen.getByText("Soon Row").closest("a")?.getAttribute("href")).toBe(
      "/forms/monitoring?followup=open",
    );
  });

  it("says nothing needs attention rather than showing a pink zero", () => {
    render(<Overview followUps={followUps()} />);
    expect(screen.getByText("Nothing needs attention today")).toBeTruthy();
    expect(screen.getByText("Nothing needs attention today").className).not.toContain(
      "followup",
    );
    expect(screen.getByText("No follow-ups are being tracked.")).toBeTruthy();
  });

  it("survives the database being unreachable — this is the home page", () => {
    render(
      <Overview followUps={followUps({ failure: "connection refused" })} />,
    );
    expect(screen.getByText("Follow-ups could not be read")).toBeTruthy();
    expect(screen.getByText("The forms record could not be reached.")).toBeTruthy();
    // And the rest of the screen is still there.
    expect(screen.getByText("Forms awaiting follow-up")).toBeTruthy();
    expect(screen.getByText("Latest knowledge updates")).toBeTruthy();
  });
});

describe("the second card agrees with the first, and its tiles add up", () => {
  it("partitions the outstanding work into three disjoint buckets", () => {
    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 2, dueThisWeek: 1, needsAttention: 3 },
          items: [
            { id: "a", employeeName: "A", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-01", overdue: true },
            { id: "b", employeeName: "B", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-02", overdue: true },
            { id: "c", employeeName: "C", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-05", overdue: false },
            { id: "d", employeeName: "D", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-20", overdue: false },
          ],
        })}
      />,
    );

    const pipeline = screen.getByText("Forms awaiting follow-up").closest("div")?.parentElement
      ?.parentElement;
    const tiles = within(pipeline as HTMLElement);
    /*
     * THE REGRESSION THIS GUARDS, from the 14 September review: "The Overview
     * follow-up card shows 15, then 16, while the individual categories total
     * 20: 11 + 4 + 5."
     *
     * The old third tile was `total - overdue`, which already contained the
     * due-this-week rows, so the row double-counted them. Here: 4 outstanding,
     * 2 overdue, 1 due this week — so 1 is due later, and 2 + 1 + 1 = 4.
     *
     * The tiles read LABEL then FIGURE — the eyebrow sits above the number in
     * the approved counter — so the figure is the label's next sibling.
     */
    expect(tiles.getByText("Overdue").nextElementSibling?.textContent).toBe("2");
    expect(tiles.getByText("Due this week").nextElementSibling?.textContent).toBe("1");
    expect(tiles.getByText("Due later").nextElementSibling?.textContent).toBe("1");
  });

  it("never lets the three tiles sum to more than the outstanding total", () => {
    /*
     * The shape that produced 11 + 4 + 5 = 20 against a total of 16: every
     * overdue record, plus some due this week, plus some later.
     */
    const items = Array.from({ length: 16 }, (_, index) => ({
      id: String(index),
      employeeName: `E${index}`,
      templateName: "Coaching Form",
      locationName: null,
      followUpDate: index < 11 ? "2026-09-01" : "2026-09-20",
      overdue: index < 11,
    }));

    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 11, dueThisWeek: 4, needsAttention: 15 },
          items,
        })}
      />,
    );

    const pipeline = screen.getByText("Forms awaiting follow-up").closest("div")?.parentElement
      ?.parentElement;
    const tiles = within(pipeline as HTMLElement);
    const read = (label: string) =>
      Number(tiles.getByText(label).nextElementSibling?.textContent ?? "0");

    const sum = read("Overdue") + read("Due this week") + read("Due later");
    expect(sum).toBe(items.length);
    // Specifically not the 20 the review saw.
    expect(sum).not.toBe(20);
  });

  it("does not repeat the forms register link three times on one card", () => {
    render(
      <Overview
        followUps={followUps({
          attention: { overdue: 2, dueThisWeek: 1, needsAttention: 3 },
          items: [
            { id: "a", employeeName: "A", templateName: "Coaching Form", locationName: null, followUpDate: "2026-09-01", overdue: true },
          ],
        })}
      />,
    );
    /*
     * Two links to the register remain and they are different objects — the
     * alarm bar, which renders only when something needs a person, and the
     * card's own button under the list. The section rule carries no third
     * copy: a heading is not an action.
     */
    expect(screen.getAllByRole("link", { name: /open the forms register/i })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /view all follow-ups/i })).toHaveLength(1);
  });

  it("names the reader's own assignment rather than every location they cover", () => {
    render(
      <Overview
        followUps={followUps({ scopeLabel: "Testville Downtown" })}
      />,
    );
    expect(screen.getByText("Across Testville Downtown")).toBeTruthy();
    expect(screen.queryByText("Across every location you cover")).toBeNull();
  });

  it("says how many records were held back as non-production", () => {
    render(<Overview followUps={followUps({ excluded: 3 })} />);
    expect(screen.getByText(/3 records are filed against a location that is not on the roster/)).toBeTruthy();
    expect(screen.getByText(/still in the forms register/)).toBeTruthy();
  });
});

describe("the module's source", () => {
  const SOURCE = readFileSync("src/features/dashboard/overview.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("no longer takes forms from the client store", () => {
    /*
     * THE LOAD-BEARING ASSERTION. Every number on this screen's follow-up
     * cards used to come from `useAppStore().forms`. Destructuring it again is
     * how the desync would return, and it would look perfectly reasonable in a
     * diff.
     */
    expect(SOURCE).toMatch(/useAppStore\(\)/); // documents still do
    expect(SOURCE).not.toMatch(/\{[^}]*\bforms\b[^}]*\}\s*=\s*useAppStore\(\)/);
    expect(SOURCE).not.toMatch(/\bforms\.filter\b/);
    expect(SOURCE).not.toMatch(/DEMO_GENERATED_FORMS/);
  });

  it("does not measure follow-ups against the demo anchor", () => {
    // `daysFromNow` and `relativeDay` are anchored to a fixed August instant.
    // The card uses `relativeBusinessDay` instead.
    expect(SOURCE).not.toMatch(/daysFromNow/);
    expect(SOURCE).toMatch(/relativeBusinessDay/);
  });

  it("reads the live query on the server, not in the browser", () => {
    const page = readFileSync("src/app/(app)/page.tsx", "utf8");
    expect(page).toMatch(/listOutstandingFollowUps/);
    expect(page).toMatch(/attentionSummary/);
    // `force-dynamic` is what makes a navigation re-read Supabase.
    expect(page).toMatch(/export const dynamic = "force-dynamic"/);
  });
});

describe("Home invents nothing where no data source is connected", () => {
  const SOURCE = readFileSync("src/features/dashboard/overview.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("carries no performance block, seeded figure or demo note", () => {
    const { container } = render(<Overview followUps={followUps()} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\$\d|revenue|sales|sample data|demo/i);
    expect(SOURCE).not.toMatch(/@\/data\/demo|DEMO_[A-Z_]+/);
    expect(SOURCE).not.toMatch(/isDemoMode/);
  });

  it("says the knowledge library is empty rather than showing a blank panel", () => {
    render(<Overview followUps={followUps()} />);
    expect(screen.getByText(/No documents have been added yet/)).toBeTruthy();
  });

  it("offers only internal destinations under Get started", () => {
    const { container } = render(<Overview followUps={followUps()} />);
    for (const anchor of container.querySelectorAll("a")) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href.startsWith("/"), href).toBe(true);
    }
  });
});

describe("a deployment with no forms database", () => {
  it("says forms are not connected rather than reporting a failure", () => {
    render(<OverviewScreen followUps={followUps({ connected: false })} />);
    expect(screen.getByText("Forms are not connected in this deployment")).toBeTruthy();
    expect(screen.queryByText("Follow-ups could not be read")).toBeNull();
  });
});
