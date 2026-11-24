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
  managerReplied: false,
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
  canApproveSentBack: true,
  history: [
    { action: "changes_requested", by: "HR", note: "Add the time she arrived.", at: "2026-11-20T18:00:00Z" },
    { action: "commented", by: "Sorrel", note: "She arrived at 9:20.", at: "2026-11-21T14:00:00Z" },
  ],
  ...over,
});

describe("HR's list", () => {
  it("a replied form reads \"Manager replied to changes\", under Needs your decision", () => {
    render(<HrQueueList rows={[row({ managerReplied: true })]} />);
    const decide = screen.getByTestId("hr-queue-decide");
    expect(decide.textContent).toContain("Needs your decision (1)");
    expect(decide.textContent).toContain("Manager replied to changes");
    expect(screen.queryByText("Sent back for changes")).toBeNull();
  });

  it("a form still waiting on the manager reads \"Sent back for changes\", under Waiting on the manager", () => {
    render(<HrQueueList rows={[row({ managerReplied: false })]} />);
    expect(screen.getByTestId("hr-queue-decide").textContent).toContain("Needs your decision (0)");
    expect(screen.getByTestId("hr-queue-on-manager").textContent).toContain("Sent back for changes");
  });

  it("one row in each state: Needs your decision lists waiting then replied; N counts exactly those", () => {
    render(
      <HrQueueList
        rows={[
          row({ id: "p", state: "pending", line: "A pending form" }),
          row({ id: "m", managerReplied: true, line: "A replied form" }),
          row({ id: "s", line: "A sent-back form" }),
          row({ id: "r", state: "rejected", line: "A rejected form" }),
        ]}
      />,
    );
    const decide = screen.getByTestId("hr-queue-decide");
    expect(decide.textContent).toContain("Needs your decision (2)");
    expect(decide.textContent!.indexOf("A pending form")).toBeLessThan(decide.textContent!.indexOf("A replied form"));
    const onManager = screen.getByTestId("hr-queue-on-manager");
    expect(onManager.textContent).toContain("A sent-back form");
    expect(onManager.textContent).toContain("A rejected form");
  });

  it("the tab shows the count it is given", () => {
    render(<HrApprovalTabs active="hr" pending={1} overdue={0} />);
    expect(screen.getByRole("link", { name: /Pending HR approval \(1\)/ })).toBeTruthy();
  });
});

describe("the approval panel", () => {
  it("HR, after the manager replied: Approve and Send back, no Reject; Approve calls hr_approve", async () => {
    const call = vi.fn(async () => ({}));
    render(<HrApprovalPanel instanceId="f-1" view={view({})} call={call} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Send back for changes/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(call).toHaveBeenCalledTimes(1);
    const [url, init] = call.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/forms/instances/f-1");
    expect(JSON.parse(String(init.body))).toEqual({ action: "hr_approve" });
  });

  it("the manager, on the same form: no Approve", () => {
    render(<HrApprovalPanel instanceId="f-1" view={view({ canApproveSentBack: false })} call={async () => ({})} onChanged={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(screen.getByText("Manager replied to changes")).toBeTruthy();
  });
});

/*
 * The owner (23 Nov 2026): "its so small pending approval, make it red button and animated shaking if theres a pending".
 * (The sibling app's approvals were a "Sunny approvals ↗" link here; they are now a tab on this page, tested in
 * hr-approval-lists.dom.test.tsx. Owner, 23 Nov 2026: "i dont want the sunny approval in a different page and link,
 * just a tab pls".)
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

  /*
   * CHANGED ON PURPOSE: "not HR: no pending button" tested a `showPending={false}` that existed only to show the
   * sibling link to non-approvers. The link is gone (see above), so the page renders these tabs for HR only and the
   * prop is gone with it; that a non-approver sees no tab is the page's `hrSummary` check, unchanged.
   */
});
