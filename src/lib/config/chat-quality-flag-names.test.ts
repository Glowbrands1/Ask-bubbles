import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_QUALITY_FLAG_NAMES } from "@/lib/config/chat-quality-flags";

/*
 * QA, 12 Nov 2026: flags kept shipping with a getter in chat-quality-flags.ts but no CHAT_QUALITY_FLAG_NAMES entry
 * (#671, #686, #689, #692, #807, #808, and before that #773, #718). The e2e suites reset every listed flag before each
 * case, so a missing name leaks the flag's value from one test into the next and off-pins stop pinning off.
 * Every `envFlag("X_ENABLED")` getter must be listed, or exempted below with the reason.
 */
const NOT_CHAT_FLAGS: Record<string, string> = {
  // Woven knowledge sync (scanned PDFs), not the chat or forms path; its own tests set it.
  WOVEN_PDF_OCR_ENABLED: "knowledge sync, not chat",
};

const source = readFileSync(join(__dirname, "chat-quality-flags.ts"), "utf8");
const getters = [...new Set([...source.matchAll(/envFlag\("([A-Z0-9_]+)"\)/g)].map((m) => m[1]))];

describe("CHAT_QUALITY_FLAG_NAMES lists every chat-quality getter", () => {
  it("finds the getters (the scan itself works)", () => {
    expect(getters.length).toBeGreaterThan(100);
  });

  it("every envFlag getter is in CHAT_QUALITY_FLAG_NAMES or a commented exemption", () => {
    const listed = new Set<string>(CHAT_QUALITY_FLAG_NAMES);
    const missing = getters.filter((name) => !listed.has(name) && !(name in NOT_CHAT_FLAGS));
    expect(missing, "add these to CHAT_QUALITY_FLAG_NAMES (or NOT_CHAT_FLAGS with a reason)").toEqual([]);
  });

  it("every exemption is still a getter, and is not also listed", () => {
    const listed = new Set<string>(CHAT_QUALITY_FLAG_NAMES);
    for (const name of Object.keys(NOT_CHAT_FLAGS)) {
      expect(getters).toContain(name);
      expect(listed.has(name)).toBe(false);
    }
  });

  it("the list has no duplicates", () => {
    expect(CHAT_QUALITY_FLAG_NAMES.length).toBe(new Set(CHAT_QUALITY_FLAG_NAMES).size);
  });
});
