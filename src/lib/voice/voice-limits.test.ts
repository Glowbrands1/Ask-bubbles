import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMigratedTestDatabase, type KnowledgeTestDatabase } from "@/test/pglite-knowledge-db";

import {
  COMPANY_AUDIO_SECONDS_PER_DAY,
  PER_STORE_AUDIO_SECONDS_PER_DAY,
  PER_USER_AUDIO_SECONDS_PER_DAY,
  PER_USER_PER_DAY,
  PER_USER_PER_MINUTE,
  clampClipSeconds,
  manilaDayStart,
} from "./voice-limits";
import { claimVoiceUsage, finishedAudioSeconds, finishVoiceUsage, spendAudioSeconds, type RpcClient, type VoiceSurface } from "./voice-usage";

/**
 * THE CAPS, ON THE REAL MIGRATION (PGlite). Every claim goes through `voice_usage_claim` exactly as the route calls it.
 * Invented ids only.
 */

let t: KnowledgeTestDatabase;
let db: PGlite;
let rpc: RpcClient;

beforeAll(async () => {
  t = await createMigratedTestDatabase(["20260829000100_extensions", "20261127002000_voice_usage"]);
  db = t.db;
  rpc = {
    async rpc(fn, args) {
      const params: unknown[] = [];
      const named = Object.entries(args).map(([name, value]) => {
        if (value === null || value === undefined) return `${name} => null`;
        params.push(value);
        return `${name} => $${params.length}`;
      });
      try {
        const result = await db.query<{ result: unknown }>(`select public.${fn}(${named.join(", ")}) as result`, params);
        return { data: result.rows[0]?.result ?? null, error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
      }
    },
  };
}, 60_000);

afterAll(async () => {
  await t?.close?.();
});

beforeEach(async () => {
  await db.exec("delete from public.voice_usage");
});

const NOON_MANILA = new Date("2026-11-27T04:00:00Z"); // 12:00 in Manila

function claim(input: { userId?: string; storeId?: string | null; surface?: VoiceSurface; clipSeconds?: number; now?: Date } = {}) {
  return claimVoiceUsage(rpc, {
    userId: input.userId ?? "user-ada",
    storeId: input.storeId === undefined ? "loc-0001" : input.storeId,
    surface: input.surface ?? "chat",
    clipSeconds: input.clipSeconds ?? 10,
    now: input.now ?? NOON_MANILA,
  });
}

/** Rows written directly, to stand for a day's earlier use. */
async function seed(rows: number, input: { userId?: string; storeId?: string | null; seconds: number; at: Date; status?: string; audioSeconds?: number | null }) {
  for (let i = 0; i < rows; i += 1) {
    const status = input.status ?? "succeeded";
    const audio = input.audioSeconds !== undefined ? input.audioSeconds : status === "pending" ? null : input.seconds;
    await db.query(
      `insert into public.voice_usage (created_at, user_id, store_id, surface, status, reported_seconds, audio_seconds) values ($1, $2, $3, 'chat', $4, $5, $6)`,
      [input.at.toISOString(), input.userId ?? "user-ada", input.storeId === undefined ? "loc-0001" : input.storeId, status, input.seconds, audio],
    );
  }
}

const minutesBefore = (date: Date, minutes: number) => new Date(date.getTime() - minutes * 60_000);

describe("the voice caps (voice_usage_claim)", () => {
  it("a claim under every cap writes one pending row and returns its id", async () => {
    const outcome = await claim();
    expect(outcome.kind).toBe("claimed");
    const rows = (await db.query<{ status: string; reported_seconds: string; surface: string }>("select status, reported_seconds, surface from public.voice_usage")).rows;
    expect(rows).toEqual([{ status: "pending", reported_seconds: "10.00", surface: "chat" }]);
  });

  it("per minute: the 11th clip within 60 seconds is refused with a wait", async () => {
    for (let i = 0; i < PER_USER_PER_MINUTE; i += 1) expect((await claim({ clipSeconds: 1 })).kind).toBe("claimed");
    const refused = await claim({ clipSeconds: 1 });
    expect(refused).toMatchObject({ kind: "user_minute" });
    expect(refused.kind === "user_minute" && refused.retryAfterSeconds).toBeGreaterThan(0);
    // A minute later it passes again.
    expect((await claim({ clipSeconds: 1, now: new Date(NOON_MANILA.getTime() + 61_000) })).kind).toBe("claimed");
  });

  it("per day: the 121st clip of the day is refused", async () => {
    await seed(PER_USER_PER_DAY, { seconds: 1, at: minutesBefore(NOON_MANILA, 30) });
    expect((await claim({ clipSeconds: 1 })).kind).toBe("user_day");
  });

  it("audio minutes: a clip that would pass 30 minutes of the person's day is refused", async () => {
    await seed(30, { seconds: 59.5, at: minutesBefore(NOON_MANILA, 30) }); // 1785 s
    expect(PER_USER_AUDIO_SECONDS_PER_DAY).toBe(1800);
    expect((await claim({ clipSeconds: 20 })).kind).toBe("user_day");
    expect((await claim({ clipSeconds: 10 })).kind).toBe("claimed");
  });

  it("a pending row counts as the clip length the browser reported, clamped, and is never released", async () => {
    await seed(29, { seconds: 60, at: minutesBefore(NOON_MANILA, 30), status: "pending" }); // 1740 s pending (a crash)
    expect((await claim({ clipSeconds: 999 })).kind).toBe("claimed"); // counted as 60 s: 1800
    expect((await claim({ clipSeconds: 0.5 })).kind).toBe("user_day");
    expect(clampClipSeconds(999)).toBe(60);
    expect(clampClipSeconds(0)).toBe(0.5);
  });

  it("a succeeded clip counts its real audio length; a finished row is not finished again", async () => {
    const first = await claim({ clipSeconds: 60 });
    if (first.kind !== "claimed") throw new Error("expected a claim");
    await finishVoiceUsage(rpc, { id: first.id, succeeded: true, audioSeconds: 4 });
    const row = (await db.query<{ status: string; audio_seconds: string }>("select status, audio_seconds from public.voice_usage")).rows[0];
    expect(row).toEqual({ status: "succeeded", audio_seconds: "4.00" });
    await finishVoiceUsage(rpc, { id: first.id, succeeded: false, audioSeconds: null }); // already finished: unchanged
    expect((await db.query<{ status: string }>("select status from public.voice_usage")).rows[0].status).toBe("succeeded");
  });

  /* QA on the pull request, 27 Nov 2026: a failed request is still a call to the provider. */
  it("failed requests count toward the per-minute cap", async () => {
    for (let i = 0; i < PER_USER_PER_MINUTE; i += 1) {
      const claimed = await claim({ clipSeconds: 1 });
      if (claimed.kind !== "claimed") throw new Error("expected a claim");
      await finishVoiceUsage(rpc, { id: claimed.id, succeeded: false, audioSeconds: finishedAudioSeconds({ status: 400, errorClass: "bad_audio", audioSeconds: null }) });
    }
    expect((await claim({ clipSeconds: 1 })).kind).toBe("user_minute");
  });

  it("failed requests count toward the per-day cap, even rejected ones that count 0 seconds", async () => {
    await seed(PER_USER_PER_DAY, { seconds: 0.5, at: minutesBefore(NOON_MANILA, 30), status: "failed", audioSeconds: 0 });
    expect((await claim({ clipSeconds: 1 })).kind).toBe("user_day");
  });

  it("a failure with no answer (status 0, a timeout) keeps its reported seconds against the audio caps", async () => {
    await seed(29, { seconds: 60, at: minutesBefore(NOON_MANILA, 30) }); // 1740 s
    const pending = await claim({ clipSeconds: 50 }); // 1790 s
    if (pending.kind !== "claimed") throw new Error("expected a claim");
    const kept = finishedAudioSeconds({ status: 0, errorClass: "timeout", audioSeconds: null });
    expect(kept).toBeNull();
    await finishVoiceUsage(rpc, { id: pending.id, succeeded: false, audioSeconds: kept });
    expect((await db.query<{ audio_seconds: string | null }>("select audio_seconds from public.voice_usage where id = $1", [pending.id])).rows[0].audio_seconds).toBeNull();
    expect((await claim({ clipSeconds: 20 })).kind).toBe("user_day"); // 1790 + 20 > 1800
    for (const status of [429, 500, 503, 504]) expect(finishedAudioSeconds({ status, errorClass: "x", audioSeconds: null })).toBeNull();
    expect(finishedAudioSeconds({ status: 200, errorClass: "invalid_response", audioSeconds: null })).toBeNull();
  });

  it("a clear rejection (415) frees its seconds", async () => {
    await seed(29, { seconds: 60, at: minutesBefore(NOON_MANILA, 30) }); // 1740 s
    const rejected = await claim({ clipSeconds: 50 }); // 1790 s while pending
    if (rejected.kind !== "claimed") throw new Error("expected a claim");
    expect((await claim({ clipSeconds: 20 })).kind).toBe("user_day");
    const freed = finishedAudioSeconds({ status: 415, errorClass: "unsupported_media_type", audioSeconds: null });
    expect(freed).toBe(0);
    await finishVoiceUsage(rpc, { id: rejected.id, succeeded: false, audioSeconds: freed });
    expect((await claim({ clipSeconds: 20 })).kind).toBe("claimed"); // 1740 + 0 + 20 <= 1800
    for (const status of [400, 401, 413]) expect(finishedAudioSeconds({ status, errorClass: "x", audioSeconds: null })).toBe(0);
  });

  it("the spend meter is charged by the same rule", () => {
    expect(spendAudioSeconds({ status: 200, errorClass: null, audioSeconds: 4.2 }, 10)).toBe(4.2);
    expect(spendAudioSeconds({ status: 0, errorClass: "timeout", audioSeconds: null }, 12)).toBe(12);
    expect(spendAudioSeconds({ status: 503, errorClass: "service_unavailable", audioSeconds: null }, 999)).toBe(60);
    expect(spendAudioSeconds({ status: 415, errorClass: "unsupported_media_type", audioSeconds: null }, 12)).toBe(0);
  });

  it("store: the store's 90 minutes cover every person there", async () => {
    await seed(90, { userId: "user-bea", seconds: 59.9, at: minutesBefore(NOON_MANILA, 30) }); // 5391 s at loc-0001
    expect(PER_STORE_AUDIO_SECONDS_PER_DAY).toBe(5400);
    expect((await claim({ userId: "user-cy", clipSeconds: 10 })).kind).toBe("store_day");
    expect((await claim({ userId: "user-cy", storeId: "loc-0002", clipSeconds: 10 })).kind).toBe("claimed");
    expect((await claim({ userId: "user-cy", storeId: null, clipSeconds: 5 })).kind).toBe("claimed");
  });

  it("company: three hours a day across every store and person", async () => {
    for (let store = 0; store < 4; store += 1) {
      await seed(45, { userId: `user-${store}`, storeId: `loc-90${store}`, seconds: 60, at: minutesBefore(NOON_MANILA, 30) });
    }
    expect(COMPANY_AUDIO_SECONDS_PER_DAY).toBe(10800);
    expect((await claim({ userId: "user-dee", storeId: "loc-0009", clipSeconds: 1 })).kind).toBe("company_day");
  });

  it("the caps are shared by the four boxes", async () => {
    const surfaces: VoiceSurface[] = ["chat", "overview", "report", "l10"];
    for (let i = 0; i < PER_USER_PER_MINUTE; i += 1) {
      expect((await claim({ clipSeconds: 1, surface: surfaces[i % 4] })).kind).toBe("claimed");
    }
    for (const surface of surfaces) expect((await claim({ clipSeconds: 1, surface })).kind).toBe("user_minute");
  });

  it("the day starts at Manila midnight: 15:59:59 UTC is the old day, 16:00:00 UTC the new one", async () => {
    expect(manilaDayStart(new Date("2026-11-27T15:59:59Z")).toISOString()).toBe("2026-11-26T16:00:00.000Z");
    expect(manilaDayStart(new Date("2026-11-27T16:00:00Z")).toISOString()).toBe("2026-11-27T16:00:00.000Z");

    // A full day of the person's audio, the last clip at 15:59:59 UTC (23:59:59 in Manila).
    await seed(30, { seconds: 59, at: new Date("2026-11-27T15:00:00Z") });
    await seed(1, { seconds: 29, at: new Date("2026-11-27T15:59:59Z") }); // 1799 s in all
    expect((await claim({ clipSeconds: 5, now: new Date("2026-11-27T15:59:59.500Z") })).kind).toBe("user_day");
    // One second later it is a new Manila day.
    expect((await claim({ clipSeconds: 5, now: new Date("2026-11-27T16:00:00Z") })).kind).toBe("claimed");
  });

  it("two overlapping requests: the second is refused", async () => {
    await seed(30, { seconds: 59.5, at: minutesBefore(NOON_MANILA, 30) }); // 1785 s: room for one 10 s clip
    const [a, b] = await Promise.all([claim({ clipSeconds: 10 }), claim({ clipSeconds: 10 })]);
    expect([a.kind, b.kind].sort()).toEqual(["claimed", "user_day"]);
  });

  it("fails closed: a database error is `unavailable`, never a pass", async () => {
    const broken: RpcClient = { rpc: async () => ({ data: null, error: { message: "connection refused" } }) };
    expect(await claimVoiceUsage(broken, { userId: "user-ada", storeId: null, surface: "chat", clipSeconds: 5 })).toEqual({ kind: "unavailable" });
    const throwing: RpcClient = {
      rpc: () => {
        throw new Error("down");
      },
    };
    expect(await claimVoiceUsage(throwing, { userId: "user-ada", storeId: null, surface: "chat", clipSeconds: 5 })).toEqual({ kind: "unavailable" });
    const odd: RpcClient = { rpc: async () => ({ data: { ok: "maybe" }, error: null }) };
    expect(await claimVoiceUsage(odd, { userId: "user-ada", storeId: null, surface: "chat", clipSeconds: 5 })).toEqual({ kind: "unavailable" });
  });

  it("a signed-in browser cannot write or read anyone's counters", async () => {
    const grants = (
      await db.query<{ grantee: string; privilege_type: string }>(
        `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'voice_usage' and grantee in ('anon', 'authenticated')`,
      )
    ).rows;
    expect(grants).toEqual([]);
    const rls = (await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`select relrowsecurity, relforcerowsecurity from pg_class where relname = 'voice_usage'`)).rows[0];
    expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const exec = (
      await db.query<{ can: boolean }>(`select has_function_privilege('authenticated', 'public.voice_usage_claim(text, text, text, numeric, integer, integer, numeric, numeric, numeric, timestamptz)', 'execute') as can`)
    ).rows[0];
    expect(exec.can).toBe(false);
    await expect(db.exec("set role authenticated; insert into public.voice_usage (user_id, surface, reported_seconds) values ('user-bea', 'chat', 1);")).rejects.toThrow();
    await db.exec("reset role");
  });
});
