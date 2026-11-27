import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * POST /api/chat/voice/stream (VOICE_INPUT_ENABLED), live dictation, ported from Ask Sunny. The owner, 27 Nov 2026: "it
 * transcribes as you talk then when done, press check mark and auto send"; and "i said Curt, it spelled it as Kurt"
 * (here invented: "Cade Holloway", heard as "Kade"). Stand-ins: auth, the Hub, the spend guard, the database and
 * AssemblyAI's token endpoint (a fake `fetch`). Invented people and emails only.
 */

let who: { subject: string; email: string } | null;
vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: vi.fn(async (_request: Request, permission: string) => {
      if (!who) throw new AuthError("unauthenticated", "You are not signed in.");
      return {
        identity: { subject: who.subject, email: who.email, role: "store_manager", displayName: "Ada", verified: true, scope: { level: "location", primaryAreaId: "loc-0001", alsoCoversAreaIds: [] } },
        permission,
        provider: "test",
      };
    }),
  };
});
vi.mock("@/features/l10/data.server", () => ({ l10Viewer: vi.fn(async () => null), listMyMeetings: vi.fn(async () => []), openMeeting: vi.fn() }));
vi.mock("@/lib/ai/spend-guard", async (original) => ({
  ...(await original<typeof import("@/lib/ai/spend-guard")>()),
  modelSpendGuard: vi.fn(async () => null),
}));
vi.mock("@/lib/chat/store", () => ({ getOwnConversation: vi.fn(async () => ({ messages: [] })) }));
vi.mock("@/lib/forms/employee-roster", () => ({
  loadScopedRoster: vi.fn(async () => [{ id: "e1", firstName: "Cade", lastName: "Holloway", locationIds: ["loc-0001"] }]),
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: vi.fn(async () => []) }));
vi.mock("@/lib/stores/woven-aliases", () => ({ loadWovenStoreAliases: vi.fn(async () => []) }));

import { __setSupabaseAdmin } from "@/lib/supabase/server";
import { __setRateLimiter, InMemoryRateLimiter } from "@/lib/api/rate-limit";
import { POST } from "./route";

const ORIGIN = "https://bubbles.example.test";
const SAVED = ["VOICE_INPUT_ENABLED", "VOICE_INPUT_USERS", "ASSEMBLYAI_API_KEY", "NEXT_PUBLIC_DEMO_MODE"].map((key) => [key, process.env[key]] as const);

function request(body: Record<string, unknown>, headers: Record<string, string> = { origin: ORIGIN }): Request {
  return new Request(`${ORIGIN}/api/chat/voice/stream`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
}

let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let traceRows: Record<string, unknown>[];
let tokenResponse: () => Response;
let tokenCalls: number;
let logs: string[];

beforeEach(() => {
  process.env.VOICE_INPUT_ENABLED = "true";
  process.env.VOICE_INPUT_USERS = "ada@example.test";
  process.env.ASSEMBLYAI_API_KEY = "test-key-not-real";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  who = { subject: "user-ada", email: "ada@example.test" };
  rpcCalls = [];
  traceRows = [];
  tokenCalls = 0;
  logs = [];
  tokenResponse = () => Response.json({ token: "tmp-token-not-real", expires_in_seconds: 60 });
  __setRateLimiter(new InMemoryRateLimiter());
  __setSupabaseAdmin({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "voice_usage_claim") return { data: { ok: true, id: "11111111-2222-4333-8444-555555555555" }, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "chat_traces") traceRows.push(row);
        return { error: null };
      },
    }),
  } as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "https://token.assemblyai.com/v1/token") {
        tokenCalls += 1;
        return tokenResponse();
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  for (const [key, value] of SAVED) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function started(): Promise<{ socketUrl: string; session: string; maxSeconds: number }> {
  const response = await POST(request({ action: "start", surface: "chat" }));
  expect(response.status).toBe(200);
  return (await response.json()) as { socketUrl: string; session: string; maxSeconds: number };
}

describe("start", () => {
  it("claims a session, mints a token, answers the socket URL: the token and audio format, never a name or the key", async () => {
    const body = await started();
    const url = new URL(body.socketUrl);
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("wss://streaming.assemblyai.com/v3/ws");
    expect(url.searchParams.get("token")).toBe("tmp-token-not-real");
    expect(url.searchParams.get("encoding")).toBe("pcm_s16le");
    expect(url.searchParams.has("keyterms_prompt")).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/Holloway|Cade|test-key-not-real|ada@example/);
    expect(rpcCalls[0]).toMatchObject({ fn: "voice_usage_claim", args: { p_user_id: "user-ada", p_store_id: "loc-0001", p_surface: "chat" } });
  });

  it("voice not on for this person: 404, and no token", async () => {
    process.env.VOICE_INPUT_USERS = "someone@example.test";
    expect((await POST(request({ action: "start", surface: "chat" }))).status).toBe(404);
    expect(tokenCalls).toBe(0);
  });

  it("cross-site: 403", async () => {
    expect((await POST(request({ action: "start", surface: "chat" }, { origin: "https://elsewhere.example" }))).status).toBe(403);
  });

  it("the token cannot be minted: 'use the recording instead', and the row counts 0 seconds", async () => {
    tokenResponse = () => new Response("{}", { status: 500 });
    const response = await POST(request({ action: "start", surface: "chat" }));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code: string }).code).toBe("stream_unavailable");
    expect(rpcCalls.at(-1)).toMatchObject({ fn: "voice_usage_finish", args: { p_status: "failed", p_audio_seconds: 0 } });
  });
});

describe('finish: "press check mark and auto send" (the owner, 27 Nov 2026)', () => {
  it("✓ with the owner's case (i said Cade, it heard Kade): the names are respelled before it is sent", async () => {
    const { session } = await started();
    const response = await POST(request({ action: "finish", surface: "chat", session, outcome: "send", text: "Hey can you create a CA for Kade Holloway please", seconds: 4.2 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "Hey can you create a CA for Cade Holloway please" });
    expect(rpcCalls.at(-1)).toMatchObject({ fn: "voice_usage_finish", args: { p_status: "succeeded", p_audio_seconds: 4.2 } });
    expect(traceRows[0]).toMatchObject({ intent: "voice", slots: { voice: { endpoint: "streaming", outcome: "ok" } } });
    expect(logs.join("\n")).not.toMatch(/Holloway|Kade|Cade|tmp-token/);
  });

  it("✕: only the trace id comes back", async () => {
    const { session } = await started();
    const response = await POST(request({ action: "finish", surface: "chat", session, outcome: "discard", text: "", seconds: 3 }));
    expect(Object.keys((await response.json()) as object)).toEqual(["traceId"]);
    expect(traceRows[0]).toMatchObject({ slots: { voice: { endpoint: "streaming", outcome: "discarded" } } });
  });

  it("only a session handle signed for this person is accepted", async () => {
    const { session } = await started();
    who = { subject: "user-bea", email: "ada@example.test" };
    expect((await POST(request({ action: "finish", surface: "chat", session, outcome: "send", text: "Kade Holloway", seconds: 2 }))).status).toBe(404);
  });
});
