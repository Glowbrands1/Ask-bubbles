// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { AskResponse, ClientAskRequest } from "@/lib/ai/types";

/* Demo mode, set before the store module loads — see forms-without-rating. */
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
});

/**
 * A QUESTION SENT FROM THE REAL SCREEN CARRIES WHO ASKED IT.
 *
 * The avatar beside a question reads `author` (see `message-author.ts`), so
 * the stamp has to be put on at send time, by the screen, from the session —
 * not reconstructed later from whoever happens to be signed in.
 */

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const asked: ClientAskRequest[] = [];

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    aiProviderStatus: () => ({ name: "stub", connected: true, detail: "Answering live." }),
    getAIProvider: () => ({
      name: "stub",
      connected: true,
      titleForConversation: (first: string) => first.slice(0, 40),
      async ask(request: ClientAskRequest): Promise<AskResponse> {
        asked.push(request);
        return { content: `Answer ${asked.length}.`, citations: [], coverage: "not_applicable" };
      },
    }),
  };
});

const { Providers } = await import("@/app/providers");
const { ChatScreen } = await import("./chat-screen");
const { useSession } = await import("@/lib/session/session-context");

afterEach(cleanup);

async function ask(text: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/ask bubbles a question/i), text);
  await user.click(screen.getByRole("button", { name: /send message/i }));
}

describe("the question stamp", () => {
  it("stamps each question with the signed-in person and draws their initials from it", async () => {
    let session: ReturnType<typeof useSession> | null = null;
    function Probe() {
      session = useSession();
      return null;
    }
    render(
      <Providers>
        <Probe />
        <ChatScreen />
      </Providers>,
    );

    await ask("What is the dress code?");
    await screen.findByText("Answer 1.");
    await ask("And for the Makery?");
    await waitFor(() => expect(asked).toHaveLength(2));

    const signedIn = session!;
    const first = asked[1]!.history.find((message) => message.role === "user");
    expect(first?.author).toEqual({
      userId: signedIn.user.id,
      name: signedIn.managerDisplayName,
      initials: signedIn.user.avatarInitials,
    });
    expect(screen.getAllByTitle(signedIn.managerDisplayName)[0]!.textContent).toBe(signedIn.user.avatarInitials);
    expect(screen.queryByLabelText("Unknown asker")).toBeNull();
  });
});
