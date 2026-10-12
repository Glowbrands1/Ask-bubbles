// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AutoSyncPanel } from "./auto-sync-panel";
import type { AutoSyncPanelData } from "./load";

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

const data = (over: Partial<AutoSyncPanelData> = {}): AutoSyncPanelData => ({
  setting: { state: "ready", enabled: false, updatedAt: null },
  schedule: { expression: "17 11 * * *", description: "Once a day at 11:17 UTC", nextRunAt: "2026-10-15T11:17:00.000Z" },
  readiness: { syncReady: true, writesEnabled: true, scheduled: true, directorySaved: true },
  lastSuccessAt: "2026-10-14T16:00:00.000Z",
  lastScheduledSuccessAt: null,
  recentRuns: [],
  ...over,
});

describe("Auto Sync panel", () => {
  it("shows the real frequency, the next run only when ON, and the last success", () => {
    render(<AutoSyncPanel data={data({ setting: { state: "ready", enabled: true, updatedAt: "2026-10-14T17:00:00.000Z" } })} />);
    expect(screen.getByText("Auto Sync is ON")).toBeTruthy();
    expect(screen.getByTestId("auto-sync-frequency").textContent).toContain("Once a day at 11:17 UTC");
    expect(screen.getByTestId("auto-sync-frequency").textContent).toContain("6:17 AM CDT Central");
    expect(screen.getByTestId("auto-sync-next").textContent).toContain("Oct 15");
    expect(screen.getByRole("button", { name: /Turn Auto Sync off/ })).toBeTruthy();
  });

  it("OFF: no next run is claimed", () => {
    render(<AutoSyncPanel data={data()} />);
    expect(screen.getByText("Auto Sync is OFF")).toBeTruthy();
    expect(screen.getByTestId("auto-sync-next").textContent).toContain("None");
  });

  it("cannot be turned on until every check is done, and names the one that is not", () => {
    render(<AutoSyncPanel data={data({ readiness: { syncReady: true, writesEnabled: true, scheduled: true, directorySaved: false } })} />);
    expect((screen.getByRole("button", { name: /Turn Auto Sync on/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Not yet:/).parentElement?.textContent).toContain("A stored sync has saved the directory");
  });

  it("turning on needs an explicit confirmation, sends enabled:true once, then refreshes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok", enabled: true, changed: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AutoSyncPanel data={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /Turn Auto Sync on/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/never create logins|will not create logins/)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Confirm: turn on" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/admin/employees/woven/auto-sync");
    expect(JSON.parse(String(init.body))).toEqual({ enabled: true });
    await screen.findByText("Auto Sync is ON.");
    expect(refresh).toHaveBeenCalled();
  });

  it("says why when the server refuses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status: "refused", code: "auto_sync_requires_saved_directory" }), { status: 409 })));
    render(<AutoSyncPanel data={data()} />);
    fireEvent.click(screen.getByRole("button", { name: /Turn Auto Sync on/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm: turn on" }));
    await screen.findByText(/Save the directory with a stored sync first/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("turning off needs no confirmation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "ok", enabled: false, changed: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AutoSyncPanel data={data({ setting: { state: "ready", enabled: true, updatedAt: null } })} />);
    fireEvent.click(screen.getByRole("button", { name: /Turn Auto Sync off/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ enabled: false });
  });

  it("missing and unreadable settings are shown as such, never as OFF", () => {
    const { rerender } = render(<AutoSyncPanel data={data({ setting: { state: "missing" } })} />);
    expect(screen.getByText("Status unavailable")).toBeTruthy();
    expect(screen.getByText(/20261014001000/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Turn Auto Sync on/ }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<AutoSyncPanel data={data({ setting: { state: "unavailable", code: null } })} />);
    expect(screen.getByText(/could not be read/)).toBeTruthy();
  });

  it("lists recent runs with who started them, results and errors — and no names or emails", () => {
    render(
      <AutoSyncPanel
        data={data({
          recentRuns: [
            { id: "1", startedAt: "2026-10-14T11:17:00.000Z", scheduled: true, status: "succeeded", errorCode: null, employeesReceived: 80, changesRecorded: 0 },
            { id: "2", startedAt: "2026-10-13T16:00:00.000Z", scheduled: false, status: "rejected", errorCode: "company_scope_mismatch", employeesReceived: 0, changesRecorded: 0 },
          ],
        })}
      />,
    );
    const list = screen.getByRole("list", { name: "Recent sync runs" });
    expect(within(list).getByText("Scheduled")).toBeTruthy();
    expect(within(list).getByText("Manual")).toBeTruthy();
    expect(within(list).getByText("company scope mismatch")).toBeTruthy();
    expect(within(list).getByText(/80 received/)).toBeTruthy();
  });

  it("an unscheduled build says so", () => {
    render(<AutoSyncPanel data={data({ schedule: null, readiness: { syncReady: true, writesEnabled: true, scheduled: false, directorySaved: true } })} />);
    expect(screen.getByTestId("auto-sync-frequency").textContent).toContain("Not scheduled in this build");
    expect((screen.getByRole("button", { name: /Turn Auto Sync on/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
