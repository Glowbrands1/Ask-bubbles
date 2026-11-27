import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * POST /api/chat/voice (VOICE_INPUT_ENABLED), run for real over stand-ins: the auth helper, the L10 viewer and the Hub's
 * meeting list, the spend guard, the database and AssemblyAI (a fake `fetch`). Invented people and emails only.
 */

type Who = { subject: string; email: string; role: string; canAsk: boolean } | null;
let who: Who;
vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: vi.fn(async (_request: Request, permission: string) => {
      if (!who) throw new AuthError("unauthenticated", "You are not signed in.");
      if (permission !== "ask_questions" || !who.canAsk) throw new AuthError("forbidden", "Your role does not have permission to do that.");
      return {
        identity: { subject: who.subject, email: who.email, role: who.role, displayName: "Ada", verified: true, scope: { level: "location", primaryAreaId: "loc-0001", alsoCoversAreaIds: [] } },
        permission,
        provider: "test",
      };
    }),
  };
});

let viewer: { email: string; userId: string } | null;
let hubMeetings: string[];
vi.mock("@/features/l10/data.server", () => ({
  l10Viewer: vi.fn(async () =>
    viewer ? { email: viewer.email, displayName: "Ada", userId: viewer.userId, role: "store_manager", scope: { level: "location", primaryAreaId: "loc-0001", alsoCoversAreaIds: [] } } : null,
  ),
  listMyMeetings: vi.fn(async () => hubMeetings.map((key) => ({ key, name: "Invented Weekly", team: "", cadence: "", description: "" }))),
  openMeeting: vi.fn(async () => ({
    ok: true,
    meeting: { info: { key: "bcs-dm", name: "Invented Weekly" }, people: [{ id: "hub-1", name: "Dorian Felsworth" }], viewer: {}, loaded: {}, roster: {} },
  })),
}));

let spendReply: string | null;
vi.mock("@/lib/ai/spend-guard", async (original) => ({
  ...(await original<typeof import("@/lib/ai/spend-guard")>()),
  modelSpendGuard: vi.fn(async () => (spendReply ? { content: spendReply, citations: [] } : null)),
}));

vi.mock("@/lib/chat/store", () => ({
  getOwnConversation: vi.fn(async (userId: string, id: string) => {
    if (userId !== "user-ada" || id !== OWN_CONVERSATION) throw new Error("not yours");
    return { messages: [{ role: "user", content: "coach dorian today" }] };
  }),
}));
vi.mock("@/lib/forms/employee-roster", () => ({
  loadScopedRoster: vi.fn(async () => [{ id: "e1", firstName: "Dorian", lastName: "Felsworth", locationIds: ["loc-0001"] }]),
}));
vi.mock("@/lib/forms/repository", () => ({
  listTemplateSummaries: vi.fn(async () => [{ name: "Coaching Form", active: true, currentVersion: { id: "v1" } }]),
}));

import { __setSupabaseAdmin } from "@/lib/supabase/server";
import { __setRateLimiter, InMemoryRateLimiter } from "@/lib/api/rate-limit";
import { MONTHLY_BUDGET_REPLY } from "@/lib/ai/spend-guard";
import { MAX_BYTES } from "@/lib/voice/voice-limits";
import { VOICE_MESSAGES } from "@/lib/voice/voice-messages";
import { POST } from "./route";
import { l10Viewer, listMyMeetings } from "@/features/l10/data.server";
import { modelSpendGuard } from "@/lib/ai/spend-guard";

const OWN_CONVERSATION = `conv_${Date.now().toString(36)}abcdefgh`;
const ORIGIN = "https://bubbles.example.test";

const WEBM = (size = 4096) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
};
const MP4 = (size = 4096) => {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70], 0);
  return bytes;
};

function request(
  surface: string,
  init: { audio?: Uint8Array; type?: string; fields?: Record<string, string>; query?: Record<string, string>; headers?: Record<string, string>; rawBody?: BodyInit } = {},
) {
  const query = new URLSearchParams({ surface, ...(init.query ?? {}) });
  let body: BodyInit;
  if (init.rawBody !== undefined) body = init.rawBody;
  else {
    const form = new FormData();
    form.append("clipSeconds", "3.2");
    for (const [name, value] of Object.entries(init.fields ?? {})) form.set(name, value);
    form.append("audio", new Blob([(init.audio ?? WEBM()) as BlobPart], { type: init.type ?? "audio/webm;codecs=opus" }), "clip.webm");
    body = form;
  }
  return new Request(`${ORIGIN}/api/chat/voice?${query.toString()}`, { method: "POST", body, headers: { origin: ORIGIN, ...(init.headers ?? {}) } });
}

let rpcCalls: { fn: string; args: Record<string, unknown> }[];
let traceRows: Record<string, unknown>[];
let storageTouched: boolean;
let claimAnswer: unknown;
let providerResponses: Response[];
let providerCalls: RequestInit[];
let logs: string[];

const SAVED = ["VOICE_INPUT_ENABLED", "VOICE_INPUT_USERS", "ASSEMBLYAI_API_KEY", "NEXT_PUBLIC_DEMO_MODE"].map((key) => [key, process.env[key]] as const);

beforeEach(() => {
  process.env.VOICE_INPUT_ENABLED = "true";
  process.env.VOICE_INPUT_USERS = "ada@example.test";
  process.env.ASSEMBLYAI_API_KEY = "test-key-not-real";
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  who = { subject: "user-ada", email: "ada@example.test", role: "store_manager", canAsk: true };
  viewer = { email: "ada@example.test", userId: "user-ada" };
  hubMeetings = ["bcs-dm"];
  spendReply = null;
  rpcCalls = [];
  traceRows = [];
  storageTouched = false;
  claimAnswer = { ok: true, id: "11111111-2222-4333-8444-555555555555" };
  providerResponses = [new Response(JSON.stringify({ text: "coach dorian felsworth about the late start", audio_duration_ms: 3200 }), { status: 200 })];
  providerCalls = [];
  logs = [];
  __setRateLimiter(new InMemoryRateLimiter());
  __setSupabaseAdmin({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "voice_usage_claim") return { data: claimAnswer, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        if (table === "chat_traces") traceRows.push(row);
        return { error: null };
      },
    }),
    get storage() {
      storageTouched = true;
      return {};
    },
  } as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      providerCalls.push(init);
      const next = providerResponses.shift();
      if (!next) throw new Error("no provider response");
      return next;
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

const SURFACES = ["chat", "overview", "report", "l10"] as const;
const forSurface = (surface: (typeof SURFACES)[number]) => (surface === "l10" ? { query: { meetingKey: "bcs-dm" } } : {});

describe("the pilot gate: 404, the same as a route that does not exist", () => {
  it.each(SURFACES)("flag off: 404 (%s)", async (surface) => {
    process.env.VOICE_INPUT_ENABLED = "false";
    const response = await POST(request(surface, forSurface(surface)));
    expect(response.status).toBe(404);
    expect(providerCalls).toHaveLength(0);
  });

  it.each(SURFACES)("VOICE_INPUT_USERS unset: 404 (%s)", async (surface) => {
    delete process.env.VOICE_INPUT_USERS;
    expect((await POST(request(surface, forSurface(surface)))).status).toBe(404);
  });

  it.each(SURFACES)("an email not on the list: 404 (%s)", async (surface) => {
    process.env.VOICE_INPUT_USERS = "bea@example.test";
    expect((await POST(request(surface, forSurface(surface)))).status).toBe(404);
    expect(rpcCalls).toHaveLength(0);
  });

  it("no key: 404", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    expect((await POST(request("chat"))).status).toBe(404);
  });
});

describe("each box keeps its own access", () => {
  it("not signed in: 401", async () => {
    who = null;
    const response = await POST(request("chat"));
    expect(response.status).toBe(401);
  });

  it.each(["chat", "overview", "report"] as const)("without ask_questions: refused for %s", async (surface) => {
    who = { subject: "user-ada", email: "ada@example.test", role: "viewer", canAsk: false };
    const response = await POST(request(surface));
    expect(response.status).toBe(403);
    expect(providerCalls).toHaveLength(0);
  });

  it("l10: no verified viewer: 404", async () => {
    viewer = null;
    expect((await POST(request("l10", { query: { meetingKey: "bcs-dm" } }))).status).toBe(404);
  });

  it("l10: a meeting the Hub does not list for this person: 404", async () => {
    hubMeetings = ["bcs-gm"];
    expect((await POST(request("l10", { query: { meetingKey: "bcs-dm" } }))).status).toBe(404);
    expect(providerCalls).toHaveLength(0);
  });

  it("l10: a person without ask_questions but with Hub access succeeds", async () => {
    who = { subject: "user-ada", email: "ada@example.test", role: "viewer", canAsk: false };
    const response = await POST(request("l10", { query: { meetingKey: "bcs-dm" } }));
    expect(response.status).toBe(200);
    const config = JSON.parse(await ((providerCalls[0].body as FormData).get("config") as Blob).text());
    expect(config.keyterms_prompt.slice(0, 2)).toEqual(["Dorian Felsworth", "Invented Weekly"]);
    expect(config).not.toHaveProperty("conversation_context");
  });

  it("l10 needs a valid meetingKey", async () => {
    expect((await POST(request("l10"))).status).toBe(400);
    expect((await POST(request("l10", { query: { meetingKey: "not-a-meeting" } }))).status).toBe(400);
  });

  it("cross-site: 403 before anything else", async () => {
    const response = await POST(request("chat", { headers: { origin: "https://evil.example.test" } }));
    expect(response.status).toBe(403);
  });
});

describe("the request is validated strictly", () => {
  it("an unknown surface is refused", async () => {
    expect((await POST(request("kiosk"))).status).toBe(400);
  });

  it("an unknown query parameter is refused", async () => {
    expect((await POST(request("chat", { query: { extra: "1" } }))).status).toBe(400);
  });

  it("an unknown form field is refused", async () => {
    const response = await POST(request("chat", { fields: { keyterms: "Ada" } }));
    expect(response.status).toBe(400);
    expect(providerCalls).toHaveLength(0);
  });

  it("a meetingKey on a chat box is refused", async () => {
    expect((await POST(request("chat", { query: { meetingKey: "bcs-dm" } }))).status).toBe(400);
  });

  it("a wrong type is refused", async () => {
    const response = await POST(request("chat", { type: "text/plain" }));
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: VOICE_MESSAGES.badAudio, code: "bad_audio" });
  });

  it("wrong first bytes are refused", async () => {
    const fake = new Uint8Array(4096).fill(7);
    expect((await POST(request("chat", { audio: fake }))).status).toBe(415);
    expect((await POST(request("chat", { audio: MP4(), type: "audio/webm" }))).status).toBe(415);
  });

  it("an MP4 clip (Safari) is accepted and sent as audio/mp4", async () => {
    const response = await POST(request("chat", { audio: MP4(), type: "audio/mp4" }));
    expect(response.status).toBe(200);
    expect(((providerCalls[0].body as FormData).get("audio") as Blob).type).toBe("audio/mp4");
  });

  it("larger than MAX_BYTES while streaming is 413, whatever Content-Length says", async () => {
    let sent = 0;
    const chunk = new Uint8Array(256 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BYTES * 2) controller.close();
        else {
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        }
      },
    });
    const response = await POST(
      new Request(`${ORIGIN}/api/chat/voice?surface=chat`, {
        method: "POST",
        body: stream,
        headers: { origin: ORIGIN, "content-type": "multipart/form-data; boundary=x", "content-length": "10" },
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe(VOICE_MESSAGES.tooLong);
    expect(sent).toBeLessThan(MAX_BYTES + 1024 * 1024); // abandoned near the cap, not read to the end (2 × MAX_BYTES)
    expect(rpcCalls).toHaveLength(0);
  });

  it("a clip too small to hold speech is 'I did not hear anything'", async () => {
    const response = await POST(request("chat", { audio: WEBM(200) }));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(VOICE_MESSAGES.nothingHeard);
  });
});

describe("a clip that passes", () => {
  it("success: the provider's text as it is, the trace id, a pending row first, then the trace row", async () => {
    const response = await POST(request("chat", { fields: { conversationId: OWN_CONVERSATION } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "coach dorian felsworth about the late start", traceId: "11111111-2222-4333-8444-555555555555" });
    expect(rpcCalls.map((call) => call.fn)).toEqual(["voice_usage_claim", "voice_usage_finish"]);
    expect(rpcCalls[0].args).toMatchObject({ p_user_id: "user-ada", p_store_id: "loc-0001", p_surface: "chat", p_clip_seconds: 3.2 });
    expect(rpcCalls[1].args).toMatchObject({ p_status: "succeeded", p_audio_seconds: 3.2 });
    const config = JSON.parse(await ((providerCalls[0].body as FormData).get("config") as Blob).text());
    expect(config.keyterms_prompt[0]).toBe("Dorian Felsworth");
    expect(config.conversation_context).toEqual(["coach dorian today"]);
  });

  it("a conversationId that is not the person's is ignored for hints, and the clip still works", async () => {
    const response = await POST(request("overview", { fields: { conversationId: `conv_${Date.now().toString(36)}zzzzzzzz` } }));
    expect(response.status).toBe(200);
    const config = JSON.parse(await ((providerCalls[0].body as FormData).get("config") as Blob).text());
    // CHANGED ON PURPOSE (the owner, 27 Nov 2026: "i said Curt, it spelled it as Kurt"): the scoped roster is now a hint
    // on every clip, so "Dorian Felsworth" is sent here as a roster name. What someone else's conversation must never
    // give is its turns, and that is still pinned.
    expect(config).not.toHaveProperty("conversation_context");
  });

  it("the trace row has the agreed fields and no text", async () => {
    await POST(request("report"));
    expect(traceRows).toHaveLength(1);
    const row = traceRows[0];
    expect(row).toMatchObject({
      id: "11111111-2222-4333-8444-555555555555",
      intent: "voice",
      model: null,
      original_query: "[voice] transcription",
      user_id: "user-ada",
      succeeded: true,
      error_status: 200,
      error_class: null,
      slots: {
        voice: { provider: "assemblyai", endpoint: "sync/v1/transcribe", surface: "report", audio_seconds: 3.2, bytes: 4096, mime: "audio/webm", keyterm_count: expect.any(Number), retried: false, outcome: "ok" },
        spend: [{ source: "voice", audio_seconds: 3.2, usd_per_hour: 0.35 }],
      },
    });
    expect(typeof row.latency_ms).toBe("number");
    expect(row).not.toHaveProperty("e2e_latency_ms");
    expect(JSON.stringify(row)).not.toMatch(/coach|dorian|felsworth|ada@|Coaching Form/i);
  });

  it("no Storage call is ever made", async () => {
    await POST(request("chat"));
    expect(storageTouched).toBe(false);
  });

  it("no log line carries text, names, emails or the hint list", async () => {
    providerResponses = [new Response(JSON.stringify({ status: 401, title: "Unauthorized" }), { status: 401 })];
    await POST(request("chat", { fields: { conversationId: OWN_CONVERSATION } }));
    await POST(request("chat"));
    __setSupabaseAdmin({ rpc: async () => ({ data: null, error: { message: "down" } }), from: () => ({ insert: async () => ({ error: { message: "down" } }) }) } as never);
    await POST(request("chat"));
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toMatch(/coach|dorian|felsworth|ada@|example\.test|Coaching Form|test-key/i);
  });

  it("monthly guard on and over: the chat's own budget sentence", async () => {
    spendReply = MONTHLY_BUDGET_REPLY;
    const response = await POST(request("chat"));
    expect(response.status).toBe(429);
    expect((await response.json()).error).toBe(MONTHLY_BUDGET_REPLY);
    expect(providerCalls).toHaveLength(0);
  });
});

describe("every refusal says one of the agreed sentences", () => {
  it.each([
    [{ ok: false, reason: "user_minute", retry_after: 17 }, 429, "Try again in 17 seconds."],
    [{ ok: false, reason: "user_day" }, 429, VOICE_MESSAGES.userDay],
    [{ ok: false, reason: "store_day" }, 429, VOICE_MESSAGES.storeDay],
    [{ ok: false, reason: "company_day" }, 429, VOICE_MESSAGES.companyDay],
    [null, 503, VOICE_MESSAGES.unavailable],
  ])("usage answer %j", async (answer, status, message) => {
    claimAnswer = answer;
    const response = await POST(request("chat"));
    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(message);
    if (status === 429) expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(providerCalls).toHaveLength(0);
  });

  it.each([
    [400, "Bad Audio", 400, VOICE_MESSAGES.badAudio],
    [415, "Unsupported Media Type", 400, VOICE_MESSAGES.badAudio],
    [413, "Audio Too Large", 413, VOICE_MESSAGES.tooLong],
    [401, "Unauthorized", 503, VOICE_MESSAGES.unavailable],
    [429, "Too Many Requests", 503, VOICE_MESSAGES.busy],
  ])("provider %i: %s", async (providerStatus, title, status, message) => {
    providerResponses = [new Response(JSON.stringify({ status: providerStatus, title }), { status: providerStatus, headers: { "Retry-After": "9" } })];
    const response = await POST(request("chat"));
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error).toBe(message);
    expect(body.error).not.toMatch(/No answer was produced/);
    // QA, 27 Nov 2026: a clear rejection (400, 401, 413, 415) counts 0 seconds; anything else keeps the reported length.
    const cleared = [400, 401, 413, 415].includes(providerStatus);
    expect(rpcCalls[1].args).toMatchObject({ p_status: "failed", p_audio_seconds: cleared ? 0 : null });
    expect((traceRows[0].slots as { spend: { audio_seconds: number }[] }).spend[0].audio_seconds).toBe(cleared ? 0 : 3.2);
    expect(traceRows[0]).toMatchObject({ succeeded: false, error_status: providerStatus });
  });

  it("empty text: 'I did not hear anything'", async () => {
    providerResponses = [new Response(JSON.stringify({ text: "  ", audio_duration_ms: 1200 }), { status: 200 })];
    const response = await POST(request("chat"));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toBe(VOICE_MESSAGES.nothingHeard);
  });
});

describe("never a blank body (QA, 27 Nov 2026)", () => {
  const unexpected = () => Object.assign(new Error("ada@example.test said coach dorian"), { name: "HubDownError" });

  async function expectUnavailable(response: Response) {
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: VOICE_MESSAGES.unavailable, code: "voice_unavailable" });
    for (const line of logs) expect(line).not.toMatch(/ada@|dorian|said/i);
    expect(logs.some((line) => /HubDownError/.test(line))).toBe(true);
    expect(providerCalls).toHaveLength(0);
  }

  it("l10Viewer throwing is the unavailable sentence, not a blank 500", async () => {
    vi.mocked(l10Viewer).mockRejectedValueOnce(unexpected());
    await expectUnavailable(await POST(request("l10", { query: { meetingKey: "bcs-dm" } })));
  });

  it("listMyMeetings throwing is the unavailable sentence, not a throw", async () => {
    vi.mocked(listMyMeetings).mockRejectedValueOnce(unexpected());
    await expectUnavailable(await POST(request("l10", { query: { meetingKey: "bcs-dm" } })));
  });

  it("the spend guard throwing is the unavailable sentence", async () => {
    vi.mocked(modelSpendGuard).mockRejectedValueOnce(unexpected());
    await expectUnavailable(await POST(request("chat")));
  });

  it("a hint reader blowing up mid-request still answers in JSON", async () => {
    const { getOwnConversation } = await import("@/lib/chat/store");
    vi.mocked(getOwnConversation).mockImplementationOnce(() => {
      throw unexpected();
    });
    // The hint builder swallows its own reader failures: the clip still goes through.
    const response = await POST(request("chat", { fields: { conversationId: OWN_CONVERSATION } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: expect.any(String) });
  });
});


describe('"i said Curt, it spelled it as Kurt" (the owner, 27 Nov 2026; ported from Ask Sunny)', () => {
  /*
   * The report's people are swapped for invented ones of the same shape: the directory's "Cade Holloway", heard by the
   * provider as "Kade Holloway". This pins both halves: the name is SENT as a hint on the first clip, before anybody
   * typed it, and a mishearing that still comes back is corrected before the text reaches the box.
   */
  async function rosterWithCade() {
    const { loadScopedRoster } = await import("@/lib/forms/employee-roster");
    vi.mocked(loadScopedRoster).mockResolvedValueOnce([
      { id: "e7", firstName: "Cade", lastName: "Holloway", locationIds: ["loc-0001"] },
    ] as never);
  }

  it("the scoped roster is sent as hints on the first clip", async () => {
    await rosterWithCade();
    await POST(request("chat"));
    const config = JSON.parse(await ((providerCalls[0].body as FormData).get("config") as Blob).text());
    expect(config.keyterms_prompt).toContain("Cade Holloway");
  });

  it("i said Cade, it spelled it as Kade: the box gets the directory spelling, and no log line names them", async () => {
    await rosterWithCade();
    providerResponses = [new Response(JSON.stringify({ text: "Hey can you create a CA for Kade Holloway please", audio_duration_ms: 3200 }), { status: 200 })];
    const response = await POST(request("chat"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "Hey can you create a CA for Cade Holloway please" });
    expect(logs.join("\n")).not.toMatch(/Holloway|Cade|Kade/);
  });
});
