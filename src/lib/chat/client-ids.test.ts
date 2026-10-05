import { describe, expect, it } from "vitest";

import { DEMO_CONVERSATIONS } from "@/data/demo";
import { createId } from "@/lib/utils/id";
import {
  DEMO_SEED_CONVERSATION_IDS,
  isClientConversationId,
  isClientMessageId,
} from "./client-ids";

/**
 * ============================================================================
 * SEEDED DEMO CONVERSATIONS MUST NEVER REACH SUPABASE
 * ============================================================================
 *
 * Importing a seeded thread would put invented history into a real person's
 * account, where it would be indistinguishable from the real thing. The demo
 * build ships no seeded conversations today, so the guard is held two ways:
 * the named exclusion list is pinned to the seed data itself, so a seed added
 * to `data/demo/chat.ts` tomorrow must be named; and the structural rule
 * rejects any id shaped the way seeds are written, named or not.
 */

/* Seed-shaped ids: hand-written, hyphenated, not what `createId` mints. */
const SEED_SHAPED_CONVERSATION_IDS = ["conv-seed-1", "conv-seed-6", "conv-demo", "CONV_ABC123XYZ"];
const SEED_SHAPED_MESSAGE_IDS = ["msg-s1", "msg-s12a", "msg-seed-1"];

describe("seeded demo conversations are not importable", () => {
  it("names every seeded id that actually exists in the demo data", () => {
    expect([...DEMO_SEED_CONVERSATION_IDS].sort()).toEqual(
      DEMO_CONVERSATIONS.map((conversation) => conversation.id).sort(),
    );
  });

  it("rejects every seeded conversation and message id read from the demo data", () => {
    for (const conversation of DEMO_CONVERSATIONS) {
      expect(
        isClientConversationId(conversation.id),
        `${conversation.id} must never be importable`,
      ).toBe(false);
      for (const message of conversation.messages) {
        expect(isClientMessageId(message.id), `${message.id} must never be importable`).toBe(
          false,
        );
      }
    }
  });

  it.each(SEED_SHAPED_CONVERSATION_IDS)("rejects the seed-shaped conversation id %s", (id) => {
    expect(isClientConversationId(id)).toBe(false);
  });

  it.each(SEED_SHAPED_MESSAGE_IDS)("rejects the seed-shaped message id %s", (id) => {
    expect(isClientMessageId(id)).toBe(false);
  });

  it("rejects them on shape alone, without the named list", () => {
    /*
     * The structural rule is the belt: a seed id carries hyphens, and
     * `createId` produces lowercase base36 only. This asserts the belt holds on
     * its own, so loosening one rule cannot silently disarm both.
     */
    for (const id of SEED_SHAPED_CONVERSATION_IDS) {
      expect(/^conv_[0-9a-z]{9,32}$/.test(id)).toBe(false);
    }
  });
});

describe("ids this application actually mints are accepted", () => {
  it("accepts a freshly created conversation id", () => {
    expect(isClientConversationId(createId("conv"))).toBe(true);
  });

  it("accepts a freshly created message id", () => {
    expect(isClientMessageId(createId("msg"))).toBe(true);
  });

  it("accepts a thousand of them in a row", () => {
    /*
     * `createId` appends a counter that grows with the session and six random
     * base36 characters that can occasionally be shorter. A validator too tight
     * on length would reject a real id somewhere in a long conversation, and
     * the person would be told their own history is not importable.
     */
    for (let index = 0; index < 1000; index += 1) {
      expect(isClientConversationId(createId("conv"))).toBe(true);
      expect(isClientMessageId(createId("msg"))).toBe(true);
    }
  });

  it("keeps the two prefixes apart", () => {
    expect(isClientConversationId(createId("msg"))).toBe(false);
    expect(isClientMessageId(createId("conv"))).toBe(false);
  });
});

describe("anything else fails closed", () => {
  const NOW = Date.UTC(2026, 8, 21);

  it.each([
    ["an empty string", ""],
    ["a bare prefix", "conv_"],
    ["a hyphenated id", "conv-abcdefghij"],
    ["uppercase, which base36 never produces", "conv_ABCDEFGHIJ"],
    ["a path traversal", "conv_../../etc/passwd"],
    ["a SQL fragment", "conv_1' or '1'='1"],
    ["a uuid", "conv_11111111-1111-4111-8111-111111111111"],
    ["too short to carry a timestamp", "conv_abc"],
    ["a timestamp before Ask Bubbles existed", `conv_${(0).toString(36).padStart(8, "0")}1abcdef`],
  ])("rejects %s", (_label, value) => {
    expect(isClientConversationId(value, NOW)).toBe(false);
    expect(isClientMessageId(String(value).replace("conv", "msg"), NOW)).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 12345],
    ["an object", { id: "conv_abcdefghij" }],
    ["an array", ["conv_abcdefghij"]],
  ])("rejects %s without throwing", (_label, value) => {
    expect(isClientConversationId(value, NOW)).toBe(false);
    expect(isClientMessageId(value, NOW)).toBe(false);
  });

  it("rejects an id longer than the column allows", () => {
    expect(isClientConversationId(`conv_${"a".repeat(200)}`, NOW)).toBe(false);
  });

  it("rejects a timestamp far beyond this clock", () => {
    const farFuture = (NOW + 1000 * 60 * 60 * 24 * 365).toString(36);
    expect(isClientConversationId(`conv_${farFuture}1abcdef`, NOW)).toBe(false);
  });

  it("allows a browser clock that is a few hours ahead", () => {
    const slightlyAhead = (NOW + 1000 * 60 * 60 * 3).toString(36);
    expect(isClientConversationId(`conv_${slightlyAhead}1abcdef`, NOW)).toBe(true);
  });
});
