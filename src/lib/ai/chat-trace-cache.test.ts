import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { chatTraceInsert, openChatTrace } from "./chat-trace";
import { runChatTrace } from "./chat-trace-store";
import { noteModelCall } from "./model-failure";

/**
 * Cache counts written to chat_traces are the numbers Anthropic returned.
 * They are not a character count divided by 4. A live read of those numbers
 * is a production check: previews have no Anthropic key. See
 * LIVE_PROMPT_CACHE_CHECK in prompts.ts.
 */

const MODEL_FAILURE = readFileSync("src/lib/ai/model-failure.ts", "utf8");
const CHAT_TRACE = readFileSync("src/lib/ai/chat-trace.ts", "utf8");
const MIGRATION = readFileSync("supabase/migrations/20261024100000_chat_traces_cache_tokens.sql", "utf8");

function rowFor(usage: unknown, prompt = "x".repeat(400)) {
  const draft = openChatTrace({ originalQuery: "where is the late policy", formInProgress: false });
  draft.prompt = prompt;
  runChatTrace(draft, async () => {
    noteModelCall({
      model: "claude-sonnet-5",
      maxTokens: 64,
      stopReason: "end_turn",
      latencyMs: 12,
      usage,
    });
  });
  return chatTraceInsert(draft);
}

describe("chat_traces cache usage", () => {
  it("copies usage.cache_creation_input_tokens and usage.cache_read_input_tokens", () => {
    const draft = openChatTrace({ originalQuery: "where is the late policy", formInProgress: false });
    const prompt = "x".repeat(400);
    draft.prompt = prompt;
    runChatTrace(draft, async () => {
      noteModelCall({
        model: "claude-sonnet-5",
        maxTokens: 64,
        stopReason: "end_turn",
        latencyMs: 12,
        usage: {
          input_tokens: 11,
          output_tokens: 7,
          cache_creation_input_tokens: 4096,
          cache_read_input_tokens: 2048,
        },
      });
    });

    const row = chatTraceInsert(draft);
    expect(row.cache_creation_input_tokens).toBe(4096);
    expect(row.cache_read_input_tokens).toBe(2048);
    expect(row.input_tokens).toBe(11);
    expect(row.output_tokens).toBe(7);
    const estimate = prompt.length / 4;
    expect(row.cache_creation_input_tokens).not.toBe(estimate);
    expect(row.cache_read_input_tokens).not.toBe(estimate);
  });

  it("stores a reported zero and leaves a missing field null", () => {
    const withZero = rowFor({
      input_tokens: 11,
      output_tokens: 7,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(withZero.cache_creation_input_tokens).toBe(0);
    expect(withZero.cache_read_input_tokens).toBe(0);

    const missing = rowFor({ input_tokens: 11, output_tokens: 7 });
    expect(missing.cache_creation_input_tokens).toBeNull();
    expect(missing.cache_read_input_tokens).toBeNull();
    expect(missing.cache_creation_input_tokens).not.toBe(100);
  });

  it("reads those usage fields and does not divide a length by 4", () => {
    expect(MODEL_FAILURE).toContain('readUsageNumber(input.usage, "cache_creation_input_tokens")');
    expect(MODEL_FAILURE).toContain('readUsageNumber(input.usage, "cache_read_input_tokens")');
    expect(MODEL_FAILURE).not.toMatch(/\/\s*4/);
    expect(CHAT_TRACE).toContain("cache_creation_input_tokens: model?.cacheCreationInputTokens");
    expect(CHAT_TRACE).toContain("cache_read_input_tokens: model?.cacheReadInputTokens");
    expect(MIGRATION).toContain("cache_creation_input_tokens");
    expect(MIGRATION).toContain("cache_read_input_tokens");
    expect(MIGRATION).not.toMatch(/\/\s*4/);
  });
});
