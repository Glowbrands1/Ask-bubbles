// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HrApprovalTabs, HrQueueList, type HrQueueListRow } from "./hr-approval-lists";
import { HrApprovalPanel, type HrApprovalPanelView } from "./hr-approval-panel";

/**
 * "MANAGER REPLIED TO CHANGES" ON HR'S LIST AND PANEL (owner, 23 Nov 2026): "colene sent to marissa, marissa replied
 * and it shows … 'sent back for changes' still. it should be Manager Replied to changes. then view then approve."
 * Invented names.
 */

afterEach(cleanup);

const row = (over: Partial<HrQueueListRow>): HrQueueListRow => ({
  id: "f-1",
  line: "Corrective Action Form for Ottoline Brackwater at Invented Store",
  createdByName: "Sorrel",
  state: "changes_requested",
  stage: "changes_requested",
  requestedAt: "2026-11-20T15:00:00Z",
  waiting: "Waiting 1 business day",
  overdue: false,
  ...over,
});

const view = (over: Partial<HrApprovalPanelView>): HrApprovalPanelView => ({
  state: "changes_requested",
  stage: "manager_replied",
  label: "Manager replied to changes",
  requestedAt: "2026-11-20T15:00:00Z",
  waiting: null,
  overdue: false,
  canDecide: false,
  canEdit: false,
  canApprove: true,
  history: [
    { action: "changes_requested", by: "HR", note: "Add the time she arrived.", at: "2026-11-20T18:00:00Z" },
    { action: "commented", by: "Sorrel", note: "She arrived at 9:20.", at: "2026-11-21T14:00:00Z" },
  ],
  ...over,
});

describe("HR's list", () => {
  it("a replied form reads \"Manager replied to changes\", not \"Sent back for changes\"", () => {
    render(<HrQueueList rows={[row({ stage: "manager_replied" })]} />);
    expect(screen.getByText("Manager replied to changes")).toBeTruthy();
    expect(screen.queryByText("Sent back for changes")).toBeNull();
  });

  it("a form still waiting on the manager reads \"Sent back for changes\"", () => {
    render(<HrQueueList rows={[row({ stage: "changes_requested" })]} />);
    expect(screen.getByText("Sent back for changes")).toBeTruthy();
  });

  it("the tab shows the count it is given", () => {
    render(<HrApprovalTabs active="hr" pending={1} overdue={0} />);
    expect(screen.getByRole("link", { name: /Pending HR approval \(1\)/ })).toBeTruthy();
  });
});

describe("the approval panel", () => {
  it("HR, after the manager replied: Approve, and no Reject or Send back; Approve calls hr_approve", async () => {
    const call = vi.fn(async () => ({}));
    render(<HrApprovalPanel instanceId="f-1" view={view({})} call={call} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Send back/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(call).toHaveBeenCalledTimes(1);
    const [url, init] = call.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/forms/instances/f-1");
    expect(JSON.parse(String(init.body))).toEqual({ action: "hr_approve" });
  });

  it("the manager, on the same form: no Approve", () => {
    render(<HrApprovalPanel instanceId="f-1" view={view({ canApprove: false })} call={async () => ({})} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.getByText("Manager replied to changes")).toBeTruthy();
  });
});

/*
 * The owner (23 Nov 2026): "its so small pending approval, make it red button and animated shaking if theres a pending".
 * And "Sunny approvals ↗" for people with access to both apps: a plain link, no count.
 */
describe("the Pending HR approval button", () => {
  it("with forms waiting: red and shaking", () => {
    render(<HrApprovalTabs active="all" pending={2} overdue={1} />);
    const tab = screen.getByTestId("hr-pending-tab");
    expect(tab.textContent).toContain("Pending HR approval (2)");
    expect(tab.className).toContain("hr-pending-shake");
    expect(tab.className).toContain("bg-status-failed");
    expect(tab.getAttribute("data-waiting")).toBe("true");
  });

  it("with none waiting: the normal style, no shake", () => {
    render(<HrApprovalTabs active="all" pending={0} overdue={0} />);
    const tab = screen.getByTestId("hr-pending-tab");
    expect(tab.className).not.toContain("hr-pending-shake");
    expect(tab.className).not.toContain("bg-status-failed");
  });

  it("the shake repeats with a pause and stops under prefers-reduced-motion", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.hr-pending-shake\s*\{\s*animation: hr-pending-shake 4s ease-in-out infinite;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.hr-pending-shake\s*\{\s*animation: none;/);
  });

  it("not HR: no pending button", () => {
    render(<HrApprovalTabs active="all" pending={3} overdue={0} showPending={false} sunnyHref="https://sunny.example/forms/monitoring?view=hr" />);
    expect(screen.queryByTestId("hr-pending-tab")).toBeNull();
  });
});

describe("Sunny approvals ↗", () => {
  it("a link to the sibling app's Pending HR approval view, in a new tab, with no count", () => {
    render(<HrApprovalTabs active="all" pending={1} overdue={0} sunnyHref="https://sunny.example/forms/monitoring?view=hr" />);
    const link = screen.getByTestId("sunny-approvals-tab");
    expect(link.textContent).toBe("Sunny approvals ↗");
    expect(link.getAttribute("href")).toBe("https://sunny.example/forms/monitoring?view=hr");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("without the app switcher: no link", () => {
    render(<HrApprovalTabs active="all" pending={1} overdue={0} />);
    expect(screen.queryByTestId("sunny-approvals-tab")).toBeNull();
  });
});

