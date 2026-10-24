import { readFileSync } from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { CLAUDE_EFFORT, CLAUDE_MODEL } from "@/lib/config/models";

import { claudeSystemPayload, uncachedSystemPrompt } from "./call-claude";
import { buildSystemPrompt, splitSystemPrompt } from "./prompts";

/**
 * The Anthropic check is manual. CI and Vercel previews do not set
 * PROMPT_CACHE_LIVE, and previews have no API key. Run it with
 * `npm run prompt-cache:live` on a machine that has ANTHROPIC_API_KEY.
 *
 * That check warms the cache with one call, then measures three more.
 * The first measured call is included. A creation call is not dropped
 * from the sample. The local stand-in in prompt-cache-replay.test.ts
 * divides characters by four. It is not this check, and it is not what
 * chat_traces stores.
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
 * Samples taken after an explicit warmup. The first sample counts.
 * cache_read of 0 on that call fails the check.
 */
export function measuredCacheReads(input: {
  oldFirstTokenMs: readonly number[];
  samples: readonly UsageTiming[];
}): { ok: boolean; reason: string } {
  if (input.oldFirstTokenMs.length < READ_SAMPLES) {
    return { ok: false, reason: `need ${READ_SAMPLES} OLD samples` };
  }
  if (input.samples.length < READ_SAMPLES) {
    return { ok: false, reason: `need ${READ_SAMPLES} measured samples after the warmup` };
  }
  if ((input.samples[0]?.cacheRead ?? 0) <= 0) {
    return {
      ok: false,
      reason: "the first measured call was not a cache read; warm the cache first and keep that call in the sample",
    };
  }
  if (input.samples.some((sample) => sample.cacheRead <= 0)) {
    return { ok: false, reason: "a measured call had cache_read 0" };
  }
  const oldMedian = median(input.oldFirstTokenMs);
  const readMedian = median(input.samples.map((sample) => sample.firstTokenMs));
  if (readMedian > oldMedian * 1.25) {
    return {
      ok: false,
      reason: `cache-read median ${readMedian} ms is more than 125% of OLD median ${oldMedian} ms`,
    };
  }
  return { ok: true, reason: "median of the measured calls, including the first, is within 125% of OLD" };
}

function promptPair(): { legacy: string; current: string } {
  const input = {
    assistantName: "Bubbles",
    brandName: "Buff City Soap",
    productName: "Ask Bubbles",
    locationNoun: "store" as const,
    context: CONTEXT,
    mode: "standard" as const,
    hasContext: true,
  };
  const previous = process.env.PROMPT_CACHE_ENABLED;
  delete process.env.PROMPT_CACHE_ENABLED;
  const legacy = buildSystemPrompt(input);
  process.env.PROMPT_CACHE_ENABLED = "1";
  const current = buildSystemPrompt(input);
  if (previous === undefined) delete process.env.PROMPT_CACHE_ENABLED;
  else process.env.PROMPT_CACHE_ENABLED = previous;
  const parts = splitSystemPrompt(current);
  if (!parts) throw new Error("the system prompt has no dynamic tail");
  if (uncachedSystemPrompt(parts.staticBlock, parts.dynamicTail).includes("---DYNAMIC---")) {
    throw new Error("the marker must not be sent");
  }
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

describe("prompt cache gate", () => {
  it("includes the first measured call and rejects a sample that was not warmed", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 40, 20, 30])).toBe(25);
    const warmed = measuredCacheReads({
      oldFirstTokenMs: [100, 100, 100],
      samples: [
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 140 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 100 },
        { cacheCreation: 0, cacheRead: 800, firstTokenMs: 100 },
      ],
    });
    expect(warmed.ok).toBe(true);
    expect(median([140, 100, 100])).toBe(100);

    const notWarmed = measuredCacheReads({
      oldFirstTokenMs: [100, 100, 100],
      samples: [
        { cacheCreation: 1800, cacheRead: 0, firstTokenMs: 900 },
        { cacheCreation: 0, cacheRead: 1800, firstTokenMs: 100 },
        { cacheCreation: 0, cacheRead: 1800, firstTokenMs: 100 },
      ],
    });
    expect(notWarmed.ok).toBe(false);
    expect(notWarmed.reason).toContain("first measured call");
    expect(measuredCacheReads({ oldFirstTokenMs: [100, 100, 100], samples: [] }).ok).toBe(false);
  });
});

describe.skipIf(process.env.PROMPT_CACHE_LIVE !== "1")("prompt cache live check (manual)", () => {
  afterEach(() => {
    delete process.env.PROMPT_CACHE_ENABLED;
  });

  it("warms the cache, then measures three calls and keeps the first", async () => {
    expect(KEY, "PROMPT_CACHE_LIVE=1 requires ANTHROPIC_API_KEY").toBeTruthy();
    const replay = JSON.parse(readFileSync("src/lib/ai/replay-set.json", "utf8")) as {
      cases: { id: string; turns: string[] }[];
    };
    const client = new Anthropic({ apiKey: KEY });
    const { legacy, current } = promptPair();
    const openings = replay.cases.filter((item) => ["b9", "b10", "b11", "b12"].includes(item.id));
    expect(openings).toHaveLength(4);

    for (const item of openings) {
      const question = item.turns[0]!;
      delete process.env.PROMPT_CACHE_ENABLED;
      const olds: UsageTiming[] = [];
      for (let i = 0; i < READ_SAMPLES; i += 1) olds.push(await measure(client, claudeSystemPayload(legacy), question));
      process.env.PROMPT_CACHE_ENABLED = "1";
      const warmup = await measure(client, claudeSystemPayload(current), question);
      const samples: UsageTiming[] = [];
      for (let i = 0; i < READ_SAMPLES; i += 1) samples.push(await measure(client, claudeSystemPayload(current), question));
      const gate = measuredCacheReads({
        oldFirstTokenMs: olds.map((sample) => sample.firstTokenMs),
        samples,
      });
      expect(gate.ok, `${item.id}: ${gate.reason}`).toBe(true);
      console.log(JSON.stringify({ caseId: item.id, warmup, olds, samples, reason: gate.reason }));
    }
  }, 600_000);
});
