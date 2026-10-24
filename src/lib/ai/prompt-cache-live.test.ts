import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_EFFORT, CLAUDE_MODEL } from "@/lib/config/models";

import { claudeSystemPayload, uncachedSystemPrompt } from "./call-claude";
import { buildSystemPrompt, splitSystemPrompt } from "./prompts";

/**
 * Real Claude calls. Skipped unless ANTHROPIC_API_KEY is set, which CI and
 * this checkout are not. The local stand-in in prompt-cache-replay.test.ts
 * is not a bill and is not what the live case measures.
 *
 * First-token time is the wait until the first text delta on messages.stream.
 * callClaude streams when the client provides messages.stream, and falls
 * back to messages.create when it does not. chat_traces.latency_ms stays
 * the full reply. The +25% gate uses the median of the cache-read samples
 * only. A call that writes the cache (cache_creation > 0 and cache_read
 * === 0) can be slower and is not gated. A warm cache, whose first NEW
 * call already has cache_read > 0, is a success.
 */

const KEY = process.env.ANTHROPIC_API_KEY;
const CONTEXT = {
  userName: "Dana Reyes",
  locationName: "Testville Downtown",
  todayIso: "2026-08-29",
};
const READ_SAMPLES = 3;

interface UsageTiming {
  cacheCreation: number;
  cacheRead: number;
  firstTokenMs: number;
}

/** Median of three or more samples. An even count averages the two middle values. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median needs at least one sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Gate the cache-read samples only. Creation samples are dropped. Fewer
 * than three reads fails. A warm cache (every sample is a read) passes
 * when that median is within 125% of the OLD median.
 */
export function cacheReadWithinGate(input: {
  oldFirstTokenMs: readonly number[];
  samples: readonly UsageTiming[];
}): { ok: boolean; reason: string } {
  if (input.oldFirstTokenMs.length < READ_SAMPLES) {
    return { ok: false, reason: `need ${READ_SAMPLES} OLD samples` };
  }
  const reads = input.samples.filter((sample) => sample.cacheRead > 0);
  if (reads.length < READ_SAMPLES) {
    return { ok: false, reason: `need ${READ_SAMPLES} cache-read samples; cache_read stayed 0 or the prefix was not warm` };
  }
  const oldMedian = median(input.oldFirstTokenMs);
  const readMedian = median(reads.map((sample) => sample.firstTokenMs));
  if (readMedian > oldMedian * 1.25) {
    return {
      ok: false,
      reason: `cache-read median ${readMedian} ms is more than 125% of OLD median ${oldMedian} ms`,
    };
  }
  return { ok: true, reason: "cache-read median is within 125% of OLD" };
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
  return { legacy: uncachedSystemPrompt(parts.staticBlock, parts.dynamicTail), current };
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

describe("prompt cache gate", () => {
  it("takes the median and does not gate a cache-creation call", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 40, 20, 30])).toBe(25);
    const warm = cacheReadWithinGate({
      oldFirstTokenMs: [100, 100, 100],
      samples: [
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 110 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 120 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 115 },
      ],
    });
    expect(warm.ok).toBe(true);

    const created = cacheReadWithinGate({
      oldFirstTokenMs: [100, 110, 90],
      samples: [
        { cacheCreation: 1800, cacheRead: 0, firstTokenMs: 900 },
        { cacheCreation: 0, cacheRead: 1800, firstTokenMs: 100 },
        { cacheCreation: 0, cacheRead: 1800, firstTokenMs: 110 },
        { cacheCreation: 0, cacheRead: 1800, firstTokenMs: 105 },
      ],
    });
    expect(created.ok).toBe(true);

    const slow = cacheReadWithinGate({
      oldFirstTokenMs: [100, 100, 100],
      samples: [
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 200 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 210 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 190 },
      ],
    });
    expect(slow.ok).toBe(false);
    expect(cacheReadWithinGate({ oldFirstTokenMs: [100, 100, 100], samples: [] }).ok).toBe(false);
  });
});

describe.skipIf(!KEY)("prompt cache, live Claude", () => {
  afterEach(() => {
    delete process.env.PROMPT_CACHE_ENABLED;
  });

  it("accepts a warm cache and gates the median of three cache-read samples", async () => {
    const replay = JSON.parse(readFileSync("src/lib/ai/replay-set.json", "utf8")) as {
      cases: { id: string; turns: string[] }[];
    };
    const client = new Anthropic({ apiKey: KEY });
    const { legacy, current } = promptPair();
    const openings = replay.cases.filter((item) => ["b9", "b10", "b11", "b12"].includes(item.id));
    expect(openings).toHaveLength(4);
    const allNew: UsageTiming[] = [];

    for (const item of openings) {
      const question = item.turns[0]!;
      delete process.env.PROMPT_CACHE_ENABLED;
      const olds: UsageTiming[] = [];
      for (let i = 0; i < READ_SAMPLES; i += 1) olds.push(await measure(client, claudeSystemPayload(legacy), question));
      process.env.PROMPT_CACHE_ENABLED = "1";
      const news: UsageTiming[] = [];
      for (let i = 0; i < READ_SAMPLES + 1; i += 1) news.push(await measure(client, claudeSystemPayload(current), question));
      allNew.push(...news);
      const gate = cacheReadWithinGate({
        oldFirstTokenMs: olds.map((sample) => sample.firstTokenMs),
        samples: news,
      });
      expect(gate.ok, `${item.id}: ${gate.reason}`).toBe(true);
      console.log(JSON.stringify({ caseId: item.id, olds, news, reason: gate.reason }));
    }

    const wrote = allNew.some((sample) => sample.cacheCreation > 0 && sample.cacheRead === 0);
    const warm = allNew.every((sample) => sample.cacheRead > 0);
    expect(wrote || warm, "static prefix was not cached: under the model minimum, or cache_control is not on that block").toBe(true);
  }, 600_000);
});
