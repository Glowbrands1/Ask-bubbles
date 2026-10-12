// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { WOVEN_SAMPLE_DATASET as SAMPLE } from "@/data/demo/woven";
import { employeeDetailFrom, employeeName, parseDirectoryQuery, queryDirectory } from "@/lib/employees/woven/views";
import { EmployeeDetailView, WovenEmployeeScreen } from "./employee-detail";
import type { WovenEmployeeProps } from "./load";
import { WovenViewScreen } from "./woven-view-screen";

/**
 * One employee's page, rendered as a demo build renders it (the labelled
 * sample set), and the directory's link to it.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const withChanges = SAMPLE.directory.find((r) => SAMPLE.changes.some((c) => c.externalEmployeeId === r.externalEmployeeId))!;

function screenProps(content: WovenEmployeeProps["content"], overrides: Partial<WovenEmployeeProps> = {}): WovenEmployeeProps {
  return { sampleLabel: SAMPLE.label, liveMode: false, content, ...overrides };
}

describe("Employee Directory → one employee", () => {
  it("links every name to that employee's page, and keeps the name column in view while scrolling", () => {
    render(
      <WovenViewScreen
        props={{
          view: "directory",
          sampleLabel: SAMPLE.label,
          liveMode: false,
          content: { state: "ready", data: { view: "directory", page: queryDirectory(SAMPLE.directory, parseDirectoryQuery({})) } },
        }}
        params={{}}
      />,
    );
    const link = screen.getByRole("link", { name: employeeName(withChanges) });
    expect(link.getAttribute("href")).toBe(`/admin/integrations/woven/directory/${withChanges.id}`);
    expect(link.closest("th")?.className).toContain("sticky");
    expect(screen.getByRole("columnheader", { name: "Name" }).className).toContain("sticky");
  });
});

describe("Employee page", () => {
  const detail = employeeDetailFrom(SAMPLE.directory, SAMPLE.changes, withChanges.id)!;

  it("shows who they are, their employment, locations, data issues and their own change history", () => {
    render(<WovenEmployeeScreen props={screenProps({ state: "ready", detail })} />);
    expect(screen.getByRole("heading", { level: 2, name: employeeName(withChanges) })).toBeTruthy();
    for (const section of ["Employment", "Location assignments", "Data issues", "Change history"]) {
      expect(screen.getByRole("region", { name: section })).toBeTruthy();
    }
    expect(screen.getByText(`Woven ID ${withChanges.externalEmployeeId}`)).toBeTruthy();
    expect(screen.getByTestId("woven-sample-banner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Employee Directory", current: false }).getAttribute("href")).toBe(
      "/admin/integrations/woven/directory",
    );
  });

  it("reuses the change table without an Employee column — it is them", () => {
    render(<WovenEmployeeScreen props={screenProps({ state: "ready", detail })} />);
    const history = screen.getByRole("region", { name: "Change history" });
    const headers = within(history).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[0]).toBe("Change type");
    expect(headers).not.toContain("Employee");
    expect(within(history).getAllByRole("row")).toHaveLength(detail.changes.length + 1);
  });

  it("disables marking a change reviewed on sample data", () => {
    render(<WovenEmployeeScreen props={screenProps({ state: "ready", detail })} />);
    const buttons = within(screen.getByRole("region", { name: "Change history" })).queryAllByRole("button");
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("says a scheduled departure is information only, and never calls them terminated", () => {
    const leaving = { ...withChanges, employmentStatus: "active" as const, terminationDate: "2026-11-01" };
    const { container } = render(
      <EmployeeDetailView detail={{ row: leaving, changes: [], changesTruncated: false }} actionsDisabled today="2026-10-12" />,
    );
    expect(screen.getByText("Scheduled departure Nov 1, 2026")).toBeTruthy();
    expect(container.textContent).toContain("Shown for information only");
    expect(container.textContent).toContain("changes nobody");
    expect(screen.getByText("No changes recorded")).toBeTruthy();
  });

  it("says when Woven still says Active after the stated date has passed", () => {
    const passed = { ...withChanges, employmentStatus: "active" as const, terminationDate: "2026-09-01" };
    render(<EmployeeDetailView detail={{ row: passed, changes: [], changesTruncated: false }} actionsDisabled today="2026-10-12" />);
    expect(screen.getByText("Woven still says Active")).toBeTruthy();
    expect(screen.queryByText(/Scheduled departure/)).toBeNull();
  });

  it("names an ActiveHidden employee and says it is not treated as active", () => {
    const hidden = { ...withChanges, employmentStatus: "unknown" as const, dataIssues: ["unknown_status", "status_active_hidden"] };
    const { container } = render(<EmployeeDetailView detail={{ row: hidden, changes: [], changesTruncated: false }} actionsDisabled />);
    expect(container.textContent).toContain("Woven calls it ActiveHidden. Not treated as active");
  });

  it("says plainly when the history was cut at the limit", () => {
    render(<EmployeeDetailView detail={{ ...detail, changes: detail.changes.slice(0, 1), changesTruncated: true }} actionsDisabled />);
    expect(screen.getByText("The 1 most recent changes. Older ones are in the Change Feed.")).toBeTruthy();
  });

  it("tells not-found, missing, unavailable and unconfigured apart", () => {
    const cases: [WovenEmployeeProps["content"], string][] = [
      [{ state: "not_found" }, "No employee with that id"],
      [{ state: "missing" }, "The Woven directory has not been created yet"],
      [{ state: "unavailable", code: "PGRST000" }, "The Woven directory could not be read"],
      [{ state: "unconfigured" }, "Supabase is not configured for this deployment"],
    ];
    for (const [content, title] of cases) {
      render(<WovenEmployeeScreen props={screenProps(content, { sampleLabel: null, liveMode: true })} />);
      expect(screen.getByText(title)).toBeTruthy();
      cleanup();
    }
  });
});
