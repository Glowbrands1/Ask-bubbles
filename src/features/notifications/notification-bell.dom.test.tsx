// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@/components/ui/overlays";
import type { BellData } from "@/lib/notifications/types";

/**
 * THE BELL, ported from the sibling app (30cac4c) for the HR form approval (Pau, 23 Nov 2026): unread count, the list,
 * opening one marks it read and goes to it. Plus what only Ask Bubbles has: the rail variant, because the desktop
 * top bar is hidden on band pages (the Forms Register among them).
 */

const push = vi.fn();
const markRead = vi.fn<(ids: string[] | null) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
const dismiss = vi.fn<(ids: string[] | null) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./actions", () => ({ markNotificationsReadAction: (ids: string[] | null) => markRead(ids), dismissNotificationsAction: (ids: string[] | null) => dismiss(ids) }));

const { NotificationBell, timeAgo } = await import("./notification-bell");

const data: BellData = {
  unread: 2,
  items: [
    { id: "n2", kind: "form_approval_requested", title: "Rowan Pike sent a form for approval", body: "Corrective Action Form", href: "/forms/monitoring", createdAt: new Date().toISOString(), readAt: null },
    { id: "n1", kind: "form_approval_requested", title: "Quinn Ash sent a form for approval", body: "Exit Form", href: "/forms/monitoring", createdAt: new Date().toISOString(), readAt: null },
    { id: "n0", kind: "form_approval_requested", title: "Old one", body: "", href: null, createdAt: "2026-11-01T00:00:00Z", readAt: "2026-11-02T00:00:00Z" },
  ],
};

afterEach(() => {
  cleanup();
  push.mockReset();
  markRead.mockClear();
  dismiss.mockClear();
});

/* Changed on purpose (Pau, 23 Nov 2026): each row now has an × whose name holds the row's title ("Remove notification:
 * <title>"), so a row is found by a name that starts with its title. */
describe("the notification bell", () => {
  it("shows how many are unread", () => {
    render(<NotificationBell data={data} />);
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }).textContent).toBe("2");
  });

  it("opening a notification marks it read and goes to it", async () => {
    render(<NotificationBell data={data} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Rowan Pike sent a form for approval/ }));
    });
    expect(markRead).toHaveBeenCalledWith(["n2"]);
    expect(push).toHaveBeenCalledWith("/forms/monitoring");
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
  });

  it("opening one with nowhere to go only marks it read", async () => {
    render(<NotificationBell data={{ unread: 1, items: [{ ...data.items[2]!, id: "n9", readAt: null }] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Old one/ }));
    });
    expect(markRead).toHaveBeenCalledWith(["n9"]);
    expect(push).not.toHaveBeenCalled();
  });

  it("marks all read", async () => {
    render(<NotificationBell data={data} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    });
    expect(markRead).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("says so when there is nothing", () => {
    render(<NotificationBell data={{ unread: 0, items: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
  });

  it("in the rail it is labelled, keeps the count, and closes the drawer when it navigates", async () => {
    const onNavigate = vi.fn();
    render(<NotificationBell data={data} variant="rail" onNavigate={onNavigate} />);
    const trigger = screen.getByRole("button", { name: "Notifications, 2 unread" });
    expect(trigger.textContent).toBe("Notifications2");
    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Quinn Ash sent a form for approval/ }));
    });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/forms/monitoring");
  });

  it("in a collapsed rail it is an icon with the count and no label", () => {
    // The app wraps every page in TooltipProvider (src/app/providers.tsx); the collapsed rail's tooltip needs it.
    render(
      <TooltipProvider>
        <NotificationBell data={data} variant="rail" collapsed />
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" }).textContent).toBe("2");
  });

  it("words the time simply", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(timeAgo("2026-11-20T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-11-20T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-11-20T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-11-18T12:00:00Z", now)).toBe("2 d ago");
  });
});

/* Pau (23 Nov 2026): "able to delete notification all or clicking x by removing 1". */
describe("removing notifications from the bell", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

  it("the × removes that one, does not open it, and the unread count drops at once", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove notification: Rowan Pike sent a form for approval" }));
    });
    expect(dismiss).toHaveBeenCalledWith(["n2"]);
    expect(push).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Rowan Pike sent a form for approval/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^Quinn Ash sent a form for approval/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
  });

  it("removing a read one leaves the unread count as it was", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove notification: Old one" }));
    });
    expect(dismiss).toHaveBeenCalledWith(["n0"]);
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("Clear all removes every one and the badge goes", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    });
    expect(dismiss).toHaveBeenCalledWith(null);
    expect(screen.getByText(/Nothing yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("clicking a row still opens its form", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Quinn Ash sent a form for approval/ }));
    });
    expect(push).toHaveBeenCalledWith("/forms/monitoring");
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("with nothing to show there is no Clear all", () => {
    render(<NotificationBell data={{ unread: 0, items: [] }} />);
    open();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });
});
