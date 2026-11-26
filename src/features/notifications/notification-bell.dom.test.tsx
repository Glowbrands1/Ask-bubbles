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
const markUnread = vi.fn<(ids: string[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("./actions", () => ({
  markNotificationsReadAction: (ids: string[] | null) => markRead(ids),
  dismissNotificationsAction: (ids: string[] | null) => dismiss(ids),
  markNotificationsUnreadAction: (ids: string[]) => markUnread(ids),
}));

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
  markUnread.mockClear();
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

/*
 * Port from Ask Sunny. Pau, 24 Nov 2026, on the forms page showing "Pending HR approval (2)" while the bar had no badge:
 * "for form monitoring can u please not remove the notification in the bar on the left side if there are still pending
 * inside". Reading or removing a notification does not decide the form, so the badge stays until the forms are decided.
 */
describe("\"can u please not remove the notification in the bar on the left side if there are still pending inside\" (Pau, 24 Nov 2026)", () => {
  const readButWaiting: BellData = { unread: 0, waitingHr: 2, items: [{ ...data.items[0]!, readAt: new Date().toISOString() }] };

  it("keeps the badge on the rail bar when every notification is read but 2 forms still wait for HR", () => {
    render(<TooltipProvider><NotificationBell data={readButWaiting} variant="rail" /></TooltipProvider>);
    expect(screen.getByRole("button", { name: "Notifications, 2 forms waiting for your approval" }).textContent).toContain("2");
  });

  it("keeps it after Clear all, and links to the pending tab", async () => {
    render(<NotificationBell data={readButWaiting} variant="rail" />);
    fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    });
    expect(screen.getByRole("button", { name: "Notifications, 2 forms waiting for your approval" }).textContent).toContain("2");
    expect(screen.getByRole("link", { name: /2 forms still need your decision/ }).getAttribute("href")).toBe("/forms/monitoring?view=hr");
  });

  it("keeps it after Mark all as read, showing the larger of unread and waiting", async () => {
    render(<NotificationBell data={{ ...data, waitingHr: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread, 1 form waiting for your approval" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    });
    expect(screen.getByRole("button", { name: "Notifications, 1 form waiting for your approval" }).textContent).toBe("1");
  });

  it("drops the badge once nothing is unread and nothing is waiting", () => {
    render(<NotificationBell data={{ ...readButWaiting, waitingHr: 0 }} />);
    expect(screen.getByRole("button", { name: "Notifications" }).textContent).toBe("");
  });
});

/* Owner, 24 Nov 2026: "do not remove the unread if not solved yet keep it persistent unless [HR] or anyone sends it back
 * to manager". A pinned row (HR's request while the form still waits) stays unread when opened, has no ×, and survives
 * Mark all as read and Clear all in this panel. */
describe("a pinned approval request", () => {
  const pinnedData: BellData = {
    unread: 2,
    items: [
      { id: "p1", kind: "form_hr_approval_request", title: "A form is waiting for your approval", body: "Resignation/Exit Form for Pell Hargrove", href: "/forms/hr-approval/f1", createdAt: new Date().toISOString(), readAt: null, pinned: true },
      { id: "n9", kind: "ai_training_submission", title: "Rowan Pike submitted their work", body: "", href: null, createdAt: new Date().toISOString(), readAt: null },
    ],
  };

  it("opening it goes to the form and leaves it unread", async () => {
    render(<NotificationBell data={pinnedData} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^A form is waiting for your approval/ }));
    });
    expect(markRead).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/forms/hr-approval/f1");
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("has no ×, and Mark all as read and Clear all leave it", async () => {
    render(<NotificationBell data={pinnedData} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.queryByRole("button", { name: "Remove notification: A form is waiting for your approval" })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    });
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    });
    expect(screen.getByRole("button", { name: /^A form is waiting for your approval/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Rowan Pike/ })).toBeNull();
  });
});

/* Pau, 24 Nov 2026, with the bell open on "3 forms are waiting for your approval" (already read): "have option to unread
 * pls so notification stays there". A read row has a "Mark as unread" button: it goes bold again, the badge counts it,
 * it stays in the list, and nothing is opened or removed. */
describe("marking a notification unread so it stays", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));

  it("a read row can be marked unread: it goes bold, the count goes up, and it is not opened or removed", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as unread: Old one" }));
    });
    expect(markUnread).toHaveBeenCalledWith(["n0"]);
    expect(push).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notifications, 3 unread" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Old one\s*\(unread\)/ })).toBeTruthy();
    // Now unread, so it has nothing left to mark.
    expect(screen.queryByRole("button", { name: "Mark as unread: Old one" })).toBeNull();
  });

  it("an unread row has no Mark as unread", () => {
    render(<NotificationBell data={data} />);
    open();
    expect(screen.queryByRole("button", { name: "Mark as unread: Rowan Pike sent a form for approval" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mark as unread: Old one" })).toBeTruthy();
  });

  it("opening it reads it again, and it can be marked unread once more", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as unread: Old one" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Old one/ }));
    });
    expect(markRead).toHaveBeenCalledWith(["n0"]);
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
    open();
    expect(screen.getByRole("button", { name: "Mark as unread: Old one" })).toBeTruthy();
  });

  it("after Mark all as read, a row marked unread is the one left counted", async () => {
    render(<NotificationBell data={data} />);
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mark as unread: Old one" }));
    });
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
  });

  it("a pinned approval request has no Mark as unread: it is unread already", () => {
    render(
      <NotificationBell
        data={{ unread: 1, items: [{ id: "p1", kind: "form_hr_approval_request", title: "A form is waiting for your approval", body: "", href: "/forms/hr-approval/f1", createdAt: new Date().toISOString(), readAt: null, pinned: true }] }}
      />,
    );
    open();
    expect(screen.queryByRole("button", { name: /Mark as unread/ })).toBeNull();
  });
});

/*
 * Port from Ask Sunny. Pau, 24 Nov 2026, told the bar counted only this app's forms and not the other app's approvals
 * tab: "fix". The badge adds the forms waiting in the other app, and the panel links to that tab.
 */
describe("the other app's waiting forms on the bar (Pau, 24 Nov 2026: \"fix\")", () => {
  const read: BellData = { unread: 0, items: [{ ...data.items[0]!, readAt: new Date().toISOString() }] };

  it("keeps the badge when only the other app has forms waiting, and links to its tab", () => {
    render(<NotificationBell data={{ ...read, waitingSiblingHr: { app: "Other App", count: 2 } }} />);
    const bar = screen.getByRole("button", { name: "Notifications, 2 forms waiting for your approval" });
    expect(bar.textContent).toBe("2");
    fireEvent.click(bar);
    expect(screen.getByRole("link", { name: /2 in Other App need your decision/ }).getAttribute("href")).toBe("/forms/monitoring?view=hr&app=sibling");
    expect(screen.queryByRole("link", { name: /forms? still needs? your decision/ })).toBeNull();
  });

  it("adds both apps' forms, with a link to each tab", () => {
    render(<NotificationBell data={{ ...read, waitingHr: 2, waitingSiblingHr: { app: "Other App", count: 1 } }} />);
    const bar = screen.getByRole("button", { name: "Notifications, 3 forms waiting for your approval" });
    expect(bar.textContent).toBe("3");
    fireEvent.click(bar);
    expect(screen.getByRole("link", { name: /2 forms still need your decision/ }).getAttribute("href")).toBe("/forms/monitoring?view=hr");
    expect(screen.getByRole("link", { name: /1 in Other App needs your decision/ }).getAttribute("href")).toBe("/forms/monitoring?view=hr&app=sibling");
  });
});

/*
 * Pau, 26 Nov 2026, of the daily follow-up notices: "ability to click from notification that they have completed it like
 * COmpleted or extend". A follow-up notice carries its form; the bell offers Completed and Extend on it, through the
 * same follow-up route the Forms Register uses. Names are invented.
 */
describe("ability to click from notification that they have completed it like COmpleted or extend", () => {
  const FORM = "0b6f3c1e-2d4a-4c5b-9e8f-112233445566";
  const notice: BellData = {
    unread: 1,
    items: [
      {
        id: "fu1",
        kind: "form_follow_up_overdue",
        title: "Follow-up overdue",
        body: "Your follow-up on the Corrective Action for Marlo Quint was due Nov 24 and is not marked done yet.",
        href: `/forms/monitoring?followup=overdue&form=${FORM}`,
        createdAt: new Date().toISOString(),
        readAt: null,
      },
    ],
  };
  const calls: { url: string; method: string; body: unknown }[] = [];
  function stubFetch(ok = true) {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: String(init.method), body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(ok ? { instance: {} } : { error: "This follow-up is already marked complete." }), { status: ok ? 200 : 409 });
      }),
    );
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    refresh.mockClear();
  });

  it("Completed marks the follow-up done and clears the notice", async () => {
    stubFetch();
    render(<NotificationBell data={notice} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    });
    expect(calls).toEqual([{ url: `/api/forms/instances/${FORM}/follow-up`, method: "POST", body: { action: "complete" } }]);
    expect(await screen.findByText("Marked done.")).toBeTruthy();
    expect(dismiss).toHaveBeenCalledWith(["fu1"]);
    expect(refresh).toHaveBeenCalled();
  });

  it("Extend sets a new follow-up date", async () => {
    stubFetch();
    render(<NotificationBell data={notice} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    fireEvent.click(screen.getByRole("button", { name: "Extend" }));
    fireEvent.change(screen.getByLabelText("New follow-up date"), { target: { value: "2030-01-15" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save date" }));
    });
    expect(calls).toEqual([{ url: `/api/forms/instances/${FORM}/follow-up`, method: "PUT", body: { date: "2030-01-15" } }]);
    expect(await screen.findByText("Moved to Jan 15.")).toBeTruthy();
  });

  it("a refusal is shown, and the notice stays", async () => {
    stubFetch(false);
    render(<NotificationBell data={notice} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(/already marked complete/);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("other notifications get no Completed / Extend", () => {
    render(<NotificationBell data={data} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
    expect(screen.queryByRole("button", { name: "Completed" })).toBeNull();
  });
});
