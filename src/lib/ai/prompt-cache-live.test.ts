import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_EFFORT, CLAUDE_MODEL } from "@/lib/config/models";

import { claudeSystemPayload } from "./call-claude";
import { buildSystemPrompt, splitSystemPrompt } from "./prompts";

/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set, which CI and
 * this checkout are not. The local stand-in in prompt-cache-replay.test.ts
 * is not a bill and is not what this file measures.
 *
 * First-token time is the wait until the first text delta on messages.stream.
 * callClaude still uses messages.create, so chat_traces.latency_ms is the
 * full reply. The gate is the cache-read call: its first text token must
 * land within 125% of that case's uncached call. Cache creation on the
 * first NEW call may be slower.
 */

const KEY = process.env.ANTHROPIC_API_KEY;
const CONTEXT = {
  userName: "Dana Reyes",
  locationName: "Testville Downtown",
  todayIso: "2026-08-29",
};

interface LiveRow {
  caseId: string;
  old: UsageTiming;
  created: UsageTiming;
  read: UsageTiming;
}

interface UsageTiming {
  cacheCreation: number;
  cacheRead: number;
  firstTokenMs: number;
}

function promptPair(): { legacy: string; current: string } {
  const current = buildSystemPrompt({
    assistantName: "Bubbles",
    brandName: "Buff City Soap",
    productName: "Ask Bubbles",
    locationNoun: "store",
    context: CONTEXT,
    mode: "standard",
    hasContext: true,
  });
  const parts = splitSystemPrompt(current);
  if (!parts) throw new Error("the system prompt has no dynamic tail");
  const breakAt = parts.staticBlock.indexOf("\n");
  const legacy = `${parts.staticBlock.slice(0, breakAt)} ${parts.dynamicTail}${parts.staticBlock.slice(breakAt)}`;
  return { legacy, current };
}

async function measure(
  client: Anthropic,
  system: ReturnType<typeof claudeSystemPayload>,
  question: string,
): Promise<UsageTiming> {
  const started = Date.now();
  let firstTokenMs: number | null = null;
  const stream = client.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 256,
    thinking: { type: "adaptive" },
    output_config: { effort: CLAUDE_EFFORT },
    system,
    messages: [{ role: "user", content: `QUESTION\n\n${question}` }],
  });
  stream.on("text", () => {
    if (firstTokenMs === null) firstTokenMs = Date.now() - started;
  });
  const message = await stream.finalMessage();
  const usage = message.usage;
  return {
    cacheCreation: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    firstTokenMs: firstTokenMs ?? Date.now() - started,
  };
}

describe.skipIf(!KEY)("prompt cache, live Claude", () => {
  afterEach(() => {
    delete process.env.PROMPT_CACHE_ENABLED;
  });

  it("records real cache tokens per opening turn, and a cache read stays within 25% of OLD", async () => {
    const replay = JSON.parse(readFileSync("src/lib/ai/replay-set.json", "utf8")) as {
      cases: { id: string; turns: string[] }[];
    };
    const client = new Anthropic({ apiKey: KEY });
    const { legacy, current } = promptPair();
    const rows: LiveRow[] = [];

    for (const item of replay.cases) {
      const question = item.turns[0]!;
      delete process.env.PROMPT_CACHE_ENABLED;
      const old = await measure(client, claudeSystemPayload(legacy), question);
      process.env.PROMPT_CACHE_ENABLED = "1";
      const created = await measure(client, claudeSystemPayload(current), question);
      const read = await measure(client, claudeSystemPayload(current), question);
      rows.push({ caseId: item.id, old, created, read });
    }

    console.log(JSON.stringify({ model: CLAUDE_MODEL, rows }));

    const wrote = rows.some((row) => row.created.cacheCreation > 0 || row.read.cacheCreation > 0);
    expect(wrote, "static prefix was not cached: under the model minimum, or cache_control is not on that block").toBe(true);

    for (const row of rows) {
      expect(row.old.cacheCreation, row.caseId).toBe(0);
      expect(row.old.cacheRead, row.caseId).toBe(0);
      const hit = row.read.cacheRead > 0 ? row.read : row.created.cacheRead > 0 ? row.created : null;
      expect(hit, `${row.caseId}: cache_read stayed 0. The static prefix is under the model's cache minimum, or the breakpoint is not on that block.`).not.toBeNull();
      expect(hit!.firstTokenMs, `${row.caseId}: cache-read first token ${hit!.firstTokenMs}ms vs OLD ${row.old.firstTokenMs}ms. If cache_read is non-zero, adaptive thinking in callClaude runs before the first text token and dominates both sides.`).toBeLessThanOrEqual(row.old.firstTokenMs * 1.25);
    }
  }, 180_000);
});
