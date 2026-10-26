import { execFileSync } from "node:child_process";

import { APIError } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAT_UPSTREAM_RETRY_ENABLED IS THE CHAT ANSWER'S, AND NO OTHER CALLER'S.
 *
 * `callClaude` has one more caller here: the forms ingest refinement.
 * Retrying it inside a 45 s per-attempt deadline and the chat turn's 120 s
 * budget would turn its slow successes into failures, so it never asks for
 * it. With the flag on, its successful call is sent and returned byte for
 * byte as with it off, and a failure reaches it exactly as before — never as
 * the chat card, never retried by this loop.
 */

const state = vi.hoisted(() => ({
  script: [] as ("answer" | "502")[],
  calls: [] as { params: string; options: unknown }[],
  waits: [] as number[],
}));

const REPLY = "0: heading\n1: field";

vi.mock("@/lib/ai/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/anthropic")>()),
  getAnthropicClient: () => ({
    messages: {
      create: async (params: unknown, options?: unknown) => {
        state.calls.push({ params: JSON.stringify(params), options });
        if (state.script.shift() === "502") {
          throw APIError.generate(502, { type: "error", error: { type: "api_error", message: "x" } }, undefined, new Headers());
        }
        return { stop_reason: "end_turn", content: [{ type: "text", text: REPLY }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  }),
}));

vi.mock("@/lib/ai/retry-wait", () => ({
  waitBeforeRetry: async (ms: number) => {
    state.waits.push(ms);
  },
}));

const { refineUnresolved } = await import("@/lib/forms/ingest/refine");

const FLAG = "CHAT_UPSTREAM_RETRY_ENABLED";
const SAVED = process.env[FLAG];
let warnings: string[] = [];

beforeEach(() => {
  state.script = [];
  state.calls = [];
  state.waits = [];
  warnings = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  // callClaude already logs every failure's status and type on console.error.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (SAVED === undefined) delete process.env[FLAG];
  else process.env[FLAG] = SAVED;
});

const refine = () => refineUnresolved([{ index: 0, text: "Employee signature", reason: "unplaced" }]);

/** Runs `refine` with the flag off and on; returns what it settled with and what it sent, each time. */
async function offAndOn(script: ("answer" | "502")[]) {
  const outcomes: { settled: string; calls: typeof state.calls }[] = [];
  for (const value of [undefined, "on"]) {
    if (value === undefined) delete process.env[FLAG];
    else process.env[FLAG] = value;
    state.script = [...script];
    state.calls = [];
    outcomes.push({ settled: JSON.stringify(await refine()), calls: state.calls });
  }
  return { off: outcomes[0]!, on: outcomes[1]! };
}

describe("the forms ingest refinement is not retried by CHAT_UPSTREAM_RETRY_ENABLED", () => {
  it("a successful call is byte-identical with the flag on and off", async () => {
    const { off, on } = await offAndOn(["answer"]);
    expect(on.settled).toBe(off.settled);
    expect(on.calls).toEqual(off.calls);
    expect(on.calls).toHaveLength(1);
    // Main's request options: none, so the SDK's own retries and timeout apply.
    expect(on.calls[0]!.options).toBeUndefined();
  });

  it("a 502 reaches it exactly as before, after one call", async () => {
    const { off, on } = await offAndOn(["502", "answer"]);
    expect(on.settled).toBe(off.settled);
    expect(on.calls).toHaveLength(1);
    expect(state.waits).toEqual([]);
    expect(warnings.join("\n")).not.toMatch(/model call/);
  });

  it("only the chat answer asks for the retry", () => {
    const hits = execFileSync("git", ["grep", "-l", "upstreamRetry: true", "--", "src", ":(exclude)**/*.test.ts"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(hits).toEqual(["src/lib/ai/server-ask.ts"]);
  });
});
