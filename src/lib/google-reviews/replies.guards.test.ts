import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { COMPANY_LOCATION_ENTRIES } from "@/config/company/locations";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import { ROLES } from "@/lib/permissions";

import { readGoogleReviewsConfig } from "./config";
import { canReplyForStore } from "./reply-access";

/**
 * STRUCTURAL GUARDS for the reply feature: properties that must stay true however the code is edited.
 */

const DIR = join(process.cwd(), "src/lib/google-reviews");
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && !/\.test\.ts$/.test(f) && f !== "test-support.ts")
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), "utf8") }));
const verbs = (text: string) => [...text.matchAll(/method:\s*"([A-Z]+)"|\b(?:call)\("(GET|PUT|POST|DELETE|PATCH)"/g)].map((m) => m[1] ?? m[2]);

describe("the only write to Google is one reply", () => {
  it("the sync's client is GET-only and never imports the reply code", () => {
    for (const file of ["client.ts", "sync.ts", "matching.ts", "normalize.ts"]) {
      const text = sources.find((s) => s.file === file)!.text;
      expect(text, file).not.toMatch(/reply-client|from "\.\/replies"|GoogleReplyClient/);
    }
    expect(verbs(sources.find((s) => s.file === "client.ts")!.text)).toEqual(["GET"]);
  });

  it("the reply client uses GET and PUT only — no delete, no post, no patch — and its write is never retried", () => {
    const text = sources.find((s) => s.file === "reply-client.ts")!.text;
    expect(new Set(verbs(text))).toEqual(new Set(["GET", "PUT"]));
    expect(text).not.toMatch(/\bDELETE\b|\bPATCH\b/);
    expect(text).not.toMatch(/setTimeout\(\s*resolve|sleep|attempt\s*</); // no backoff or retry loop around the write
  });

  it("no other module in the integration sends anything to Google except the OAuth token calls", () => {
    for (const { file, text } of sources) {
      if (["client.ts", "reply-client.ts", "oauth.ts"].includes(file)) continue;
      expect(verbs(text), file).toEqual([]);
    }
    expect(new Set(verbs(sources.find((s) => s.file === "oauth.ts")!.text))).toEqual(new Set(["POST"]));
  });

  it("nothing in the reply path writes text for a person: no AI module is imported", () => {
    for (const file of ["replies.ts", "reply-client.ts", "reply-store.ts", "reply-access.ts", "reply-view.ts"]) {
      expect(sources.find((s) => s.file === file)!.text, file).not.toMatch(/@\/lib\/ai|@anthropic|openai|generateText|embedding/i);
    }
  });
});

describe("configuration", () => {
  it("publishing is OFF unless GOOGLE_REVIEWS_REPLIES_ENABLED is exactly true, and is independent of the other switches", () => {
    expect(readGoogleReviewsConfig({}).repliesEnabled).toBe(false);
    for (const v of ["1", "yes", "on", "TRUE ", "false", ""]) {
      expect(readGoogleReviewsConfig({ GOOGLE_REVIEWS_REPLIES_ENABLED: v }).repliesEnabled, v).toBe(v.trim().toLowerCase() === "true");
    }
    const all = readGoogleReviewsConfig({ GOOGLE_REVIEWS_SYNC_ENABLED: "true", GOOGLE_REVIEWS_WRITES_ENABLED: "true", GOOGLE_REVIEWS_SCHEDULE_ENABLED: "true" });
    expect(all.repliesEnabled).toBe(false);
  });
});

describe("permissions", () => {
  it("only location managers and above, and the admin roles, hold reply_to_reviews; frontline and assistant managers never do", () => {
    const holders = ROLES.filter((role) => hasPermission(DEFAULT_PERMISSION_MATRIX, role, "reply_to_reviews"));
    expect(holders).toEqual(["location_manager", "district_manager", "regional_manager", "admin", "owner", "developer"]);
  });

  it("every approved Google store resolves to a roster location, so a scoped manager can be matched to it", () => {
    const codes = new Set(COMPANY_LOCATION_ENTRIES.map((l) => l.code));
    for (const store of APPROVED_GOOGLE_STORES) expect(codes.has(store.code), store.code).toBe(true);
  });

  it("a district or region assignment covers exactly its own salons; a store outside the seven is covered by nobody", () => {
    const admin = { label: "a", role: "admin" as const, scope: { level: "global" as const, primaryAreaId: null, alsoCoversAreaIds: [] }, verified: true };
    expect(canReplyForStore(admin, "140")).toBe(false); // a Sun Tan City store number
    expect(canReplyForStore(admin, "66")).toBe(true);
    expect(canReplyForStore(admin, null)).toBe(false);
    expect(canReplyForStore(null, "66")).toBe(false);
  });
});
