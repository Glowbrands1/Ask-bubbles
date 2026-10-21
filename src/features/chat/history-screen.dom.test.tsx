// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { Providers } from "@/app/providers";
import { HistoryScreen } from "./history-screen";

/*
 * THE HISTORY PAGE ASKS BEFORE IT DELETES, like the chat rail. Its trash
 * control is the same hover-only one, so on a phone a tap meant for a thread's
 * right half used to remove it from the account outright.
 */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
});

vi.mock("@/data/demo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/demo")>();
  const at = new Date("2026-09-20T10:00:00.000Z").toISOString();
  const thread = (id: string, title: string) => ({
    id,
    title,
    createdAt: at,
    updatedAt: at,
    attachedDocumentIds: [],
    messages: [{ id: `${id}-q`, role: "user" as const, content: title, createdAt: at }],
  });
  return {
    ...actual,
    DEMO_CONVERSATIONS: [thread("conv-fixture-1", "Weekend coverage"), thread("conv-fixture-2", "Opening checklist")],
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/history",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  for (const name of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { value: () => false, writable: true });
    }
  }
});

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("History page", () => {
  it("confirms before deleting a conversation; Cancel keeps it", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );

    const trash = await screen.findByRole("button", { name: "Delete conversation: Opening checklist" });
    await user.click(trash);
    const dialog = await screen.findByRole("dialog", { name: "Delete this conversation?" });
    expect(within(dialog).getByText(/Forms created from it are not deleted/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /^Opening checklist/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete conversation: Opening checklist" }));
    const again = await screen.findByRole("dialog", { name: "Delete this conversation?" });
    await user.click(within(again).getByRole("button", { name: "Delete conversation" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Opening checklist/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Weekend coverage/ })).toBeTruthy();
  });

  it("opens a thread through the address the chat screen reopens", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <HistoryScreen />
      </Providers>,
    );
    await user.click(await screen.findByRole("button", { name: /^Weekend coverage/ }));
    expect(push).toHaveBeenCalledWith("/chat?c=conv-fixture-1");
  });
});
