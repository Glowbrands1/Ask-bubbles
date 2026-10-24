import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const readStoreSummaries = vi.fn();
vi.mock("@/lib/google-reviews/views", () => ({
  readStoreSummaries: (...args: unknown[]) => readStoreSummaries(...args),
}));

import {
  CHAT_QUALITY_FLAG_NAMES,
  chatDataToolsEnabled,
  reportBreakdownEnabled,
  selfCheckEnabled,
} from "@/lib/config/chat-quality-flags";
import type { StoreSummary } from "@/lib/google-reviews/views";
import type { Role } from "@/types";

import { loadChatDataBlock, reviewInventoryLine } from "./chat-data-tools";

/**
 * One-at-a-time replay of CHAT_DATA_TOOLS_ENABLED.
 *
 * The card path does not call this block, so the 18 card cases stay 7/18.
 * The effect is the text server-ask attaches before the model: password-reset
 * help, and Google Reviews from stored summaries. The summaries here are an
 * in-memory list. Nothing reads Supabase.
 */

const RESET = "how do I reset my Ask Bubbles password";
const FORGOT = "I forgot my password";
const REVIEWS = "how are our google reviews";
const SALES = "what are our sales totals";

const INVENTORY = reviewInventoryLine(16, false);

function summary(input: {
  storeCode: string;
  displayName: string;
  reviewCount: number;
  apiTotalReviewCount: number;
  averageRating: number;
  unansweredCount: number;
}): StoreSummary {
  return {
    storeCode: input.storeCode,
    displayName: input.displayName,
    address: "",
    matchStatus: "confirmed",
    matchConfidence: "high",
    reviewCount: input.reviewCount,
    averageRating: input.averageRating,
    unansweredCount: input.unansweredCount,
    ratings: [0, 0, 0, 0, input.reviewCount],
    latestReviewAt: null,
    oldestReviewAt: null,
    apiTotalReviewCount: input.apiTotalReviewCount,
    apiTotalCheckedAt: null,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    candidate: null,
    reason: null,
  };
}

const STORES: StoreSummary[] = [
  summary({
    storeCode: "loc-66",
    displayName: "Kearney",
    reviewCount: 10,
    apiTotalReviewCount: 12,
    averageRating: 4.5,
    unansweredCount: 1,
  }),
  summary({
    storeCode: "loc-67",
    displayName: "Bellevue",
    reviewCount: 3,
    apiTotalReviewCount: 4,
    averageRating: 5,
    unansweredCount: 0,
  }),
];

const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const name of CHAT_QUALITY_FLAG_NAMES) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.SELF_CHECK_ENABLED = "false";
  readStoreSummaries.mockReset();
});

afterEach(() => {
  for (const name of CHAT_QUALITY_FLAG_NAMES) {
    const value = saved.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function block(question: string, role: Role) {
  return loadChatDataBlock({
    enabled: chatDataToolsEnabled(),
    question,
    role,
    breakdown: reportBreakdownEnabled(),
  });
}

describe("CHAT_DATA_TOOLS_ENABLED alone", () => {
  it("reads nothing and attaches no help while the flag is off", async () => {
    expect(chatDataToolsEnabled()).toBe(false);
    expect(selfCheckEnabled()).toBe(false);
    expect(reportBreakdownEnabled()).toBe(false);
    readStoreSummaries.mockRejectedValue(new Error("should not read"));

    expect(await block(RESET, "owner")).toEqual({ help: null, data: null });
    expect(await block(FORGOT, "owner")).toEqual({ help: null, data: null });
    expect(await block(REVIEWS, "owner")).toEqual({ help: null, data: null });
    expect(await block(SALES, "owner")).toEqual({ help: null, data: null });
    expect(readStoreSummaries).not.toHaveBeenCalled();
  });

  it("treats the string false as off", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "false";
    readStoreSummaries.mockRejectedValue(new Error("should not read"));
    expect(chatDataToolsEnabled()).toBe(false);
    expect(await block(RESET, "owner")).toEqual({ help: null, data: null });
    expect(await block(REVIEWS, "owner")).toEqual({ help: null, data: null });
    expect(readStoreSummaries).not.toHaveBeenCalled();
  });

  it("attaches password-reset help and does not read reviews", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "1";
    expect(chatDataToolsEnabled()).toBe(true);
    expect(selfCheckEnabled()).toBe(false);
    expect(reportBreakdownEnabled()).toBe(false);

    const reset = await block(RESET, "employee");
    const forgot = await block(FORGOT, "owner");
    expect(readStoreSummaries).not.toHaveBeenCalled();
    expect(reset.data).toBeNull();
    expect(forgot.data).toBeNull();
    for (const result of [reset, forgot]) {
      expect(result.help).toContain("APP HELP — PASSWORD RESET");
      expect(result.help).toContain("/api/auth/forgot-password");
      expect(result.help).toContain("/reset-password");
    }
  });

  it("adds the stored Google Reviews inventory for a role that can view reports", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "1";
    readStoreSummaries.mockResolvedValue(STORES);

    const result = await block(REVIEWS, "owner");
    expect(readStoreSummaries).toHaveBeenCalledTimes(1);
    expect(result.help).toBeNull();
    expect(result.data).toContain("Google Reviews");
    expect(result.data).toContain("- Kearney (loc-66): 10 reviews, average 4.5, 1 unanswered");
    expect(result.data).toContain("- Bellevue (loc-67): 3 reviews, average 5, 0 unanswered");
    expect(result.data).toContain(INVENTORY);
    expect(INVENTORY).toBe(
      "The Google Reviews page holds 16 reviews in total. That is the inventory total, not the count of reviews that qualify this week.",
    );
  });

  it("does not give an employee review counts", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "1";
    readStoreSummaries.mockRejectedValue(new Error("should not read"));
    expect(await block(REVIEWS, "employee")).toEqual({ help: null, data: null });
    expect(readStoreSummaries).not.toHaveBeenCalled();
  });

  it("does not invent a sales total", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "1";
    const result = await block(SALES, "owner");
    expect(result.help).toBeNull();
    expect(result.data).toBe(
      "REPORT DATA\n\nNo Sales Totals or Comp Report breakdown is loaded for chat. No figure was invented.",
    );
    expect(readStoreSummaries).not.toHaveBeenCalled();
  });

  it("invents no review count when the stored summaries cannot be read", async () => {
    process.env.CHAT_DATA_TOOLS_ENABLED = "1";
    readStoreSummaries.mockRejectedValue(new Error("db down"));
    const result = await block(REVIEWS, "owner");
    expect(result.data).toBe(
      "Google Reviews\n\nThe review summaries could not be read. No count was invented.",
    );
  });
});
