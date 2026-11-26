import { describe, expect, it, vi } from "vitest";

import { snakeCase, SYNC_MODEL, SYNC_TRANSCRIBE_URL, transcribeVoice, type TranscribeInput } from "./transcribe";

const INPUT: TranscribeInput = {
  audio: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]),
  mime: "audio/webm",
  keyterms: ["Ada Quill", "Coaching Form"],
  prompt: "A manager dictating.",
  conversationContext: ["what about ada"],
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const problem = (status: number, title: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ status, title, detail: "x" }), { status, headers: { "content-type": "application/problem+json", ...headers } });

function deps(responses: (Response | Error)[]) {
  const calls: RequestInit[] = [];
  const fetchFake = vi.fn(async (_url: string, init: RequestInit) => {
    calls.push(init);
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => undefined);
  return { calls, fetchFake, sleep, deps: { apiKey: "test-key-not-real", fetch: fetchFake as unknown as typeof fetch, sleep, now: () => 0, deadlineAt: 40_000 } };
}

describe("transcribeVoice", () => {
  it("200: the provider's text as it is, the audio length in seconds, and the numeric status", async () => {
    const d = deps([json(200, { text: "coaching form for ada quill", audio_duration_ms: 4200, session_id: "s", words: [], confidence: 0.9 })]);
    const result = await transcribeVoice(INPUT, d.deps);
    expect(result).toEqual({ text: "coaching form for ada quill", audioSeconds: 4.2, status: 200, errorClass: null, retried: false });
    expect(typeof result.status).toBe("number");
    expect(d.fetchFake).toHaveBeenCalledTimes(1);
    expect(d.fetchFake.mock.calls[0][0]).toBe(SYNC_TRANSCRIBE_URL);
    const init = d.calls[0];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("test-key-not-real");
    expect((init.headers as Record<string, string>)["X-AAI-Model"]).toBe(SYNC_MODEL);
    expect(SYNC_MODEL).toBe("universal-3-6-pro");
    const form = init.body as FormData;
    const audio = form.get("audio") as Blob;
    expect(audio.type).toBe("audio/webm");
    const config = JSON.parse(await (form.get("config") as Blob).text());
    expect(config).toEqual({ keyterms_prompt: ["Ada Quill", "Coaching Form"], prompt: "A manager dictating.", language_codes: ["en"], conversation_context: ["what about ada"] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("an mp4 clip is sent as audio/mp4, and no conversation_context when there is none", async () => {
    const d = deps([json(200, { text: "hi", audio_duration_ms: 900 })]);
    await transcribeVoice({ ...INPUT, mime: "audio/mp4", conversationContext: null }, d.deps);
    const form = d.calls[0].body as FormData;
    expect((form.get("audio") as Blob).type).toBe("audio/mp4");
    expect(JSON.parse(await (form.get("config") as Blob).text())).not.toHaveProperty("conversation_context");
  });

  it("empty text is a 200 with empty text, not an error", async () => {
    const d = deps([json(200, { text: "", audio_duration_ms: 1000 })]);
    expect(await transcribeVoice(INPUT, d.deps)).toMatchObject({ text: "", status: 200, errorClass: null });
  });

  it.each([
    [400, "Bad Audio", "bad_audio"],
    [401, "Unauthorized", "unauthorized"],
    [413, "Audio Too Large", "audio_too_large"],
    [415, "Unsupported Media Type", "unsupported_media_type"],
  ])("%i is never retried; its class is the problem title snake-cased", async (status, title, errorClass) => {
    const d = deps([problem(status, title), json(200, { text: "should not be read" })]);
    const result = await transcribeVoice(INPUT, d.deps);
    expect(result).toMatchObject({ text: "", status, errorClass, retried: false });
    expect(typeof result.status).toBe("number");
    expect(d.fetchFake).toHaveBeenCalledTimes(1);
  });

  it("429 with Retry-After within 2 s is retried once; its wait is honoured", async () => {
    const d = deps([problem(429, "Too Many Requests", { "Retry-After": "1" }), json(200, { text: "ok", audio_duration_ms: 1000 })]);
    const result = await transcribeVoice(INPUT, d.deps);
    expect(result).toMatchObject({ text: "ok", status: 200, retried: true });
    expect(d.sleep).toHaveBeenCalledWith(1000);
  });

  it("429 asking for a longer wait is not retried and carries the Retry-After", async () => {
    const d = deps([problem(429, "Too Many Requests", { "Retry-After": "7" })]);
    const result = await transcribeVoice(INPUT, d.deps);
    expect(result).toMatchObject({ status: 429, errorClass: "too_many_requests", retried: false, retryAfterSeconds: 7 });
    expect(d.fetchFake).toHaveBeenCalledTimes(1);
  });

  it("503 then success", async () => {
    const d = deps([problem(503, "Service Unavailable"), json(200, { text: "second time", audio_duration_ms: 2000 })]);
    expect(await transcribeVoice(INPUT, d.deps)).toMatchObject({ text: "second time", status: 200, retried: true });
  });

  it("504 then success", async () => {
    const d = deps([problem(504, "Inference Timeout"), json(200, { text: "second time", audio_duration_ms: 2000 })]);
    expect(await transcribeVoice(INPUT, d.deps)).toMatchObject({ text: "second time", status: 200, retried: true });
  });

  it("a retry needs 8 s of the route left", async () => {
    const d = deps([problem(503, "Service Unavailable"), json(200, { text: "never" })]);
    const result = await transcribeVoice(INPUT, { ...d.deps, now: () => 35_000 });
    expect(result).toMatchObject({ status: 503, errorClass: "service_unavailable", retried: false });
    expect(d.fetchFake).toHaveBeenCalledTimes(1);
  });

  it("only one retry", async () => {
    const d = deps([problem(500, "Inference Error"), problem(500, "Inference Error"), json(200, { text: "never" })]);
    expect(await transcribeVoice(INPUT, d.deps)).toMatchObject({ status: 500, errorClass: "inference_error", retried: true });
    expect(d.fetchFake).toHaveBeenCalledTimes(2);
  });

  it("a timeout is status 0 and class timeout, recorded as a number", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    const d = deps([timeout as unknown as Error]);
    const result = await transcribeVoice(INPUT, d.deps);
    expect(result).toEqual({ text: "", audioSeconds: null, status: 0, errorClass: "timeout", retried: false });
    expect(typeof result.status).toBe("number");
  });

  it("a real 28 s timeout aborts the call", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))));
    const result = await transcribeVoice(INPUT, { apiKey: "k", fetch: hang as unknown as typeof fetch, timeoutMs: 20 });
    expect(result).toMatchObject({ status: 0, errorClass: "timeout" });
  });

  it("an answer that does not match the schema is invalid_response", async () => {
    const d = deps([json(200, { text: 42 })]);
    expect(await transcribeVoice(INPUT, d.deps)).toMatchObject({ text: "", status: 200, errorClass: "invalid_response" });
  });

  it("snake-cases titles", () => {
    expect(snakeCase("Too Many Requests")).toBe("too_many_requests");
    expect(snakeCase("Audio Too Short")).toBe("audio_too_short");
  });
});
