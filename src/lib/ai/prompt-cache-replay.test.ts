import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { __setAnthropicClient } from "./anthropic";
import { callClaude, claudeSystemPayload } from "./call-claude";
import { buildSystemPrompt, splitSystemPrompt } from "./prompts";

/**
 * LOCAL REPLAY for prompt caching. The model is not called. A stand-in client
 * returns the usage fields Anthropic would, from the size of the blocks this
 * process actually sent. First-token time is the delay that stand-in waits
 * before the first token: the whole prompt when nothing is cached, and only
 * the dynamic tail when the static block is read back.
 *
 * Card pass/fail is not scored here. The form card does not read this prompt.
 * The round 1 scoreboard cases stay on their own expectations.
 */

const CONTEXT = {
  userName: "Dana Reyes",
  locationName: "Testville Downtown",
  todayIso: "2026-08-29",
};

function tokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Uncached work reads every character. A cache hit reads the tail only. */
function firstTokenMs(chars: number, cached: boolean): number {
  return (cached ? 12 : 45) + Math.ceil(chars / 800);
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface LoggedCall {
  kind: "old" | "new";
  firstTokenMs: number;
  usage: Usage;
  staticCached: boolean;
  dynamicCached: boolean;
}

function plan(system: unknown, seen: Set<string>): LoggedCall {
  if (typeof system === "string") {
    return {
      kind: "old",
      firstTokenMs: firstTokenMs(system.length, false),
      staticCached: false,
      dynamicCached: false,
      usage: {
        input_tokens: tokens(system),
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    };
  }
  const blocks = system as { text: string; cache_control?: { type: string } }[];
  const staticText = blocks[0]?.text ?? "";
  const dynamicText = blocks[1]?.text ?? "";
  const created = tokens(staticText);
  const hit = seen.has(staticText);
  if (!hit) seen.add(staticText);
  return {
    kind: "new",
    firstTokenMs: firstTokenMs(hit ? dynamicText.length : staticText.length + dynamicText.length, hit),
    staticCached: blocks[0]?.cache_control?.type === "ephemeral",
    dynamicCached: blocks[1]?.cache_control !== undefined,
    usage: {
      input_tokens: tokens(staticText) + tokens(dynamicText),
      output_tokens: 1,
      cache_creation_input_tokens: hit ? 0 : created,
      cache_read_input_tokens: hit ? created : 0,
    },
  };
}

const INPUT = {
  grounding: "COMPANY KNOWLEDGE\n\nNo company documents matched this question.",
  history: [] as { role: string; content: string }[],
  question: "What is the dress code?",
  maxTokens: 64,
};

describe("prompt cache replay", () => {
  afterEach(() => {
    __setAnthropicClient(null);
    vi.useRealTimers();
  });

  it("creates a cache on the first call, reads it later, and is faster than the uncached prompt", async () => {
    const prompt = buildSystemPrompt({
      assistantName: "Bubbles",
      brandName: "Buff City Soap",
      productName: "Ask Bubbles",
      locationNoun: "store",
      context: CONTEXT,
      mode: "standard",
      hasContext: true,
    });
    const parts = splitSystemPrompt(prompt);
    expect(parts).not.toBeNull();
    const legacy = `${parts!.staticBlock.slice(0, parts!.staticBlock.indexOf("\n"))} ${parts!.dynamicTail}${parts!.staticBlock.slice(parts!.staticBlock.indexOf("\n"))}`;
    expect(legacy).not.toContain("---DYNAMIC---");
    expect(claudeSystemPayload(legacy)).toBe(legacy);

    const payload = claudeSystemPayload(prompt);
    expect(Array.isArray(payload)).toBe(true);
    if (!Array.isArray(payload)) return;
    expect(payload[0]).toEqual({ type: "text", text: parts!.staticBlock, cache_control: { type: "ephemeral" } });
    expect(payload[1]).toEqual({ type: "text", text: parts!.dynamicTail });
    expect(payload[0].text).not.toContain("Dana Reyes");
    expect(payload[0].text).not.toContain("2026-08-29");
    expect(payload[0].text).not.toContain("Testville Downtown");

    const runs: LoggedCall[][] = [];
    for (let run = 0; run < 3; run += 1) {
      const seen = new Set<string>();
      const log: LoggedCall[] = [];
      vi.useFakeTimers();
      __setAnthropicClient({
        messages: {
          create: async (body: { system: unknown }) => {
            const next = plan(body.system, seen);
            log.push(next);
            await new Promise((resolve) => setTimeout(resolve, next.firstTokenMs));
            return {
              stop_reason: "end_turn",
              usage: next.usage,
              content: [{ type: "text", text: "Team members wear a clean apron." }],
            };
          },
        },
      } as never);

      const oldCall = callClaude({ ...INPUT, system: legacy });
      await vi.runAllTimersAsync();
      await oldCall;
      const first = callClaude({ ...INPUT, system: prompt });
      await vi.runAllTimersAsync();
      await first;
      const second = callClaude({ ...INPUT, system: prompt });
      await vi.runAllTimersAsync();
      await second;
      const third = callClaude({ ...INPUT, system: prompt });
      await vi.runAllTimersAsync();
      await third;
      runs.push(log.map((entry) => ({ ...entry, usage: { ...entry.usage } })));
      vi.useRealTimers();
    }

    expect(runs[0]).toEqual(runs[1]);
    expect(runs[1]).toEqual(runs[2]);
    const [old, created, read, readAgain] = runs[0]!;
    expect(old!.kind).toBe("old");
    expect(old!.usage.cache_creation_input_tokens).toBe(0);
    expect(old!.usage.cache_read_input_tokens).toBe(0);
    expect(created!.usage.cache_creation_input_tokens).toBeGreaterThan(0);
    expect(created!.usage.cache_read_input_tokens).toBe(0);
    expect(read!.usage.cache_read_input_tokens).toBeGreaterThan(0);
    expect(read!.usage.cache_creation_input_tokens).toBe(0);
    expect(readAgain!.usage.cache_read_input_tokens).toBe(read!.usage.cache_read_input_tokens);
    expect(created!.staticCached).toBe(true);
    expect(created!.dynamicCached).toBe(false);
    expect(read!.firstTokenMs).toBeLessThan(old!.firstTokenMs);
    expect(readAgain!.firstTokenMs).toBe(read!.firstTokenMs);

    const scoreboard = readFileSync("docs/scoreboard.md", "utf8");
    expect(scoreboard).toContain(`| NEW, 1st call | ${created!.usage.cache_creation_input_tokens} | 0 | ${created!.firstTokenMs} ms |`);
    expect(scoreboard).toContain(`| NEW, later calls | 0 | ${read!.usage.cache_read_input_tokens} | ${read!.firstTokenMs} ms |`);
    expect(scoreboard).toContain(`| OLD, one string, no cache | 0 | 0 | ${old!.firstTokenMs} ms |`);

    console.log(
      JSON.stringify({
        cache_creation_input_tokens: created!.usage.cache_creation_input_tokens,
        cache_read_input_tokens: read!.usage.cache_read_input_tokens,
        firstTokenMs: { old: old!.firstTokenMs, newFirst: created!.firstTokenMs, newLater: read!.firstTokenMs },
      }),
    );
  });
});
