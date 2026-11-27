/**
 * VOICE INPUT LIMITS (VOICE_INPUT_ENABLED; the owner, 27 Nov 2026).
 *
 * Plain numbers, one place. Every count is shared by the four AI chat boxes (main chat, the Overview ask band, a
 * report's ask bar and the L10 assistant): one person's minute, day and audio-seconds caps cover all of them together,
 * because the usage table counts by person, store and company, never by box.
 *
 * DAYS START AT MANILA MIDNIGHT (Asia/Manila, UTC+8, no daylight saving), not UTC: 16:00 UTC is the start of a new day.
 */

/** Longest clip the browser records; it stops itself here. */
export const MAX_SECONDS = 60;
/** Shortest clip worth sending. */
export const MIN_SECONDS = 0.5;
/** Smallest upload taken as audio. */
export const MIN_BYTES = 1024;
/** Largest upload read; the stream is cut here whatever Content-Length says. */
export const MAX_BYTES = 3 * 1024 * 1024;

export const PER_USER_PER_MINUTE = 10;
export const PER_USER_PER_DAY = 120;
export const PER_USER_AUDIO_SECONDS_PER_DAY = 1800;
export const PER_STORE_AUDIO_SECONDS_PER_DAY = 5400;
export const COMPANY_AUDIO_SECONDS_PER_DAY = 10800;

/** The route's own deadline (`maxDuration`). */
export const ROUTE_MAX_SECONDS = 45;
/** One provider call's timeout. */
export const PROVIDER_TIMEOUT_MS = 28000;
/** A retry is tried only with at least this much of the route's time left. */
export const RETRY_MIN_REMAINING_MS = 8000;
/** ...and only when the provider asks us to wait no longer than this. */
export const RETRY_MAX_WAIT_MS = 2000;

/** Budget buffer: AssemblyAI Sync's list price is $0.30 an hour, keyterms included. */
export const USD_PER_HOUR = 0.35;

/** Manila is UTC+8 all year. */
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The instant the Manila day containing `now` began (Manila midnight), as a Date. */
export function manilaDayStart(now: Date = new Date()): Date {
  const shifted = now.getTime() + MANILA_OFFSET_MS;
  const midnight = shifted - (((shifted % 86_400_000) + 86_400_000) % 86_400_000);
  return new Date(midnight - MANILA_OFFSET_MS);
}

/** The clip length the browser reported, clamped to what one clip can be: what a pending row counts. */
export function clampClipSeconds(reported: number): number {
  if (!Number.isFinite(reported)) return MAX_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, reported));
}
