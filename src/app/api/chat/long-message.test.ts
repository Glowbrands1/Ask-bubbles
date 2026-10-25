import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LEGACY_MESSAGE_LIMIT, LONG_MESSAGE_LIMIT } from "@/lib/chat/message-limit";

/**
 * ============================================================================
 * LONG CHAT MESSAGES — CHAT_LONG_MESSAGE_ENABLED, through POST /api/chat
 * ============================================================================
 *
 * Pau's decision (25 Oct 2026): chat messages may be longer than 4,000
 * characters, the manager is warned before sending, and text is never cut
 * silently.
 *
 * Ported from Ask Sunny, where a 5,089-character paste (26 Aug 2026) was
 * refused after it was sent and the conversation ended there. In this app
 * the longest of 908 manager messages (6 to 25 Oct 2026) is 507 characters
 * and none reached 4,000; the route and its limit are the same code, so the
 * same refusal was waiting.
 *
 * With the flag on the route takes up to 12,000 characters, passes the text
 * through whole, refuses anything longer with a 400 that says how long it
 * is, and refuses a history turn over 40,000 characters instead of slicing
 * it. Off, the 4,000 check, its wording and the history slice are unchanged.
 */

const ORIGINAL = { ...process.env };

interface Seen {
  questions: string[];
  histories: { role: string; content: string }[][];
}

async function load() {
  vi.resetModules();
  const seen: Seen = { questions: [], histories: [] };

  vi.doMock("@/lib/auth/server", () => ({
    authorizeRequest: async (_request: Request, permission: string) => ({
      identity: {
        subject: "user-1",
        email: "manager@example.test",
        displayName: "Test Manager",
        role: "location_manager",
        scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] },
        verified: true,
      },
      permission,
      provider: "supabase",
    }),
  }));

  vi.doMock("@/lib/ai/server-ask", () => ({
    answerQuestion: async (request: { question: string; history: { role: string; content: string }[] }) => {
      seen.questions.push(request.question);
      seen.histories.push(request.history);
      return { content: "Here is what the manual says.", citations: [], recommendedVideoIds: [] };
    },
  }));

  vi.doMock("@/lib/supabase/server", () => ({
    getSupabaseAdmin: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
  }));

  const route = await import("./route");
  return { route, seen };
}

/**
 * A written statement of the kind managers paste: whole sentences, synthetic
 * names, padded to an exact length. The last sentence is the question, so a
 * cut anywhere would lose it.
 */
function statement(length: number): string {
  const question = " What level of corrective action does the JBA Policy Manual call for?";
  const body =
    "On Saturday Avery Holt arrived at 9:40 for a 9:00 opening, the second late opening this month. " +
    "Jordan Pike covered the register until Avery arrived and two customers left without being served. ";
  let text = "";
  while (text.length + body.length < length - question.length) text += body;
  text += "x".repeat(length - question.length - text.length);
  return `${text}${question}`;
}

function ask(question: string, history: unknown[] = []): Request {
  return new Request("https://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, history, mode: "standard" }),
  });
}

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = ["sb", "secret", "TESTFIXTURE"].join("_");
  process.env.ANTHROPIC_API_KEY = "test";
  delete process.env.CHAT_LONG_MESSAGE_ENABLED;
  delete process.env.NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.doUnmock("@/lib/auth/server");
  vi.doUnmock("@/lib/ai/server-ask");
  vi.doUnmock("@/lib/supabase/server");
  vi.resetModules();
});

describe("flag off: the 4,000-character limit main ships", () => {
  it("refuses a 10,000-character message with the existing wording and never calls the model", async () => {
    const { route, seen } = await load();
    const response = await route.POST(ask(statement(10_000)));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("A question is too long. The limit is 4000 characters.");
    expect(seen.questions).toHaveLength(0);
  });

  it("refuses a message the length of the Ask Sunny production paste (5,089 characters)", async () => {
    const { route } = await load();
    const response = await route.POST(ask(statement(5_089)));
    expect(response.status).toBe(400);
  });

  it("still accepts a message of exactly 4,000 characters, whole", async () => {
    const { route, seen } = await load();
    const text = statement(LEGACY_MESSAGE_LIMIT);
    const response = await route.POST(ask(text));
    expect(response.status).toBe(200);
    expect(seen.questions[0]).toBe(text);
  });

  it("still slices an over-long history turn to 40,000 characters, as main does", async () => {
    const { route, seen } = await load();
    const response = await route.POST(
      ask("And what form is that?", [{ id: "msg_a", role: "user", content: "y".repeat(40_001) }]),
    );
    expect(response.status).toBe(200);
    expect(seen.histories[0]![0]!.content).toHaveLength(40_000);
  });

  it("treats 'off' and unset the same", async () => {
    process.env.CHAT_LONG_MESSAGE_ENABLED = "off";
    const { route } = await load();
    const response = await route.POST(ask(statement(10_000)));
    expect(response.status).toBe(400);
  });
});

describe("flag on: up to 12,000 characters, never cut", () => {
  beforeEach(() => {
    process.env.CHAT_LONG_MESSAGE_ENABLED = "1";
  });

  it("accepts a 10,000-character message and hands the model the whole text", async () => {
    const { route, seen } = await load();
    const text = statement(10_000);
    const response = await route.POST(ask(text));

    expect(response.status).toBe(200);
    expect(seen.questions).toHaveLength(1);
    expect(seen.questions[0]).toHaveLength(10_000);
    expect(seen.questions[0]).toBe(text);
    expect(seen.questions[0]!.endsWith("call for?")).toBe(true);
  });

  it("accepts the Ask Sunny production length (5,089 characters) whole", async () => {
    const { route, seen } = await load();
    const text = statement(5_089);
    const response = await route.POST(ask(text));
    expect(response.status).toBe(200);
    expect(seen.questions[0]).toBe(text);
  });

  it("accepts exactly 12,000 characters", async () => {
    const { route, seen } = await load();
    const text = statement(LONG_MESSAGE_LIMIT);
    const response = await route.POST(ask(text));
    expect(response.status).toBe(200);
    expect(seen.questions[0]).toBe(text);
  });

  it("refuses 12,001 characters with a 400 that says how long it is, and calls nothing", async () => {
    const { route, seen } = await load();
    const response = await route.POST(ask(statement(LONG_MESSAGE_LIMIT + 1)));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("bad_request");
    expect(payload.error).toBe(
      "This message is 12,001 characters. The limit is 12,000. Shorten it or split it into two messages. Nothing was cut.",
    );
    expect(seen.questions).toHaveLength(0);
  });

  it("passes a long earlier manager turn through history whole", async () => {
    const { route, seen } = await load();
    const earlier = statement(10_000);
    const response = await route.POST(
      ask("Which form should I use for that?", [
        { id: "msg_a", role: "user", content: earlier },
        { id: "msg_b", role: "assistant", content: "That reads as a second late opening." },
      ]),
    );
    expect(response.status).toBe(200);
    expect(seen.histories[0]![0]!.content).toBe(earlier);
  });

  it("refuses a history turn over 40,000 characters instead of slicing it", async () => {
    const { route, seen } = await load();
    const response = await route.POST(
      ask("And what form is that?", [{ id: "msg_a", role: "user", content: "y".repeat(40_001) }]),
    );
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "An earlier message in this conversation is longer than 40,000 characters, so it cannot be sent again in full. Nothing was cut. Start a new conversation.",
    );
    expect(seen.questions).toHaveLength(0);
  });

  it("the public twin alone turns the server limit up too, so the two never disagree", async () => {
    delete process.env.CHAT_LONG_MESSAGE_ENABLED;
    process.env.NEXT_PUBLIC_CHAT_LONG_MESSAGE_ENABLED = "true";
    const { route } = await load();
    const response = await route.POST(ask(statement(10_000)));
    expect(response.status).toBe(200);
  });
});
