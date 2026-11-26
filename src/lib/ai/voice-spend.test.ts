import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { usageCostUsd } from "./model-prices";
import { spendUsageRows } from "./spend-guard-store";

/** VOICE_INPUT_ENABLED: a voice clip in `slots.spend` is audio seconds at an hourly price, never a model call. */
describe("voice spend", () => {
  it("a voice entry is priced by the hour of audio", () => {
    const [entry] = spendUsageRows([{ source: "voice", audio_seconds: 3600, usd_per_hour: 0.35 }])!;
    expect(entry).toMatchObject({ model: null, audioSeconds: 3600, usdPerHour: 0.35 });
    expect(usageCostUsd(entry)).toBeCloseTo(0.35, 10);
  });

  it("is never priced as a model, even with no model name (which a token entry would price as the dearest)", () => {
    const [entry] = spendUsageRows([{ source: "voice", audio_seconds: 36, usd_per_hour: 0.35 }])!;
    expect(usageCostUsd(entry)).toBeCloseTo(0.0035, 10);
    expect(usageCostUsd({ model: null, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, audioSeconds: 0 })).toBe(0);
  });

  it("token entries are unchanged", () => {
    const rows = spendUsageRows([{ model: "claude-haiku-5-5", inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }])!;
    expect(rows[0]).toEqual({ model: "claude-haiku-5-5", inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(usageCostUsd(rows[0])).toBeCloseTo(0.1, 10);
  });
});
