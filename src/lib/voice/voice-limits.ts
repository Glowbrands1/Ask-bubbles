/**
 * VOICE INPUT LIMITS (VOICE_INPUT_ENABLED; the owner, 27 Nov 2026).
 *
 * Plain numbers, one place. Every count is shared by the four AI chat boxes (main chat, the Overview ask band, a
 * report's ask bar and the L10 assistant): one person's minute, day and audio-seconds caps cover all of them together,
 * because the usage table counts by person, store and company, never by box.
 *
 * DAYS RUN MIDNIGHT TO MIDNIGHT US CENTRAL (America/Chicago, the business's time zone), with daylight saving: a day is
 * 23 hours in March and 25 in November. The owner, 27 Nov 2026, asked whether the voice day should reset at Manila or
 * Central midnight: "central".
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

/** The voice caps' day: the business's time zone. `voice_usage_claim` uses the same zone name (the tests check). */
export const VOICE_DAY_TIME_ZONE = "America/Chicago";

const ZONE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: VOICE_DAY_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The zone's wall clock at `at`, as if it were UTC, minus `at`: the zone's offset then, in ms (negative in Central). */
function zoneOffsetMs(at: number): number {
  const parts = Object.fromEntries(ZONE_PARTS.formatToParts(new Date(at)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return wall - Math.floor(at / 1000) * 1000;
}

/**
 * The instant the Central day containing `now` began (Central midnight): the same day start `voice_usage_claim`
 * computes with `date_trunc('day', now at time zone 'America/Chicago') at time zone 'America/Chicago'`. The zone maths
 * is Intl's, never a fixed offset, so it is right on both sides of a daylight-saving change.
 */
export function voiceDayStart(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now.getTime()));
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Midnight's own offset (it can differ from `now`'s on a change day); twice, as the first guess may be an hour out.
  let start = midnightAsUtc - zoneOffsetMs(midnightAsUtc);
  start = midnightAsUtc - zoneOffsetMs(start);
  return new Date(start);
}

/** The instant the next Central day begins: 23, 24 or 25 hours after this one began. */
export function nextVoiceDayStart(now: Date = new Date()): Date {
  return voiceDayStart(new Date(voiceDayStart(now).getTime() + 36 * 60 * 60 * 1000));
}

/** The clip length the browser reported, clamped to what one clip can be: what a pending row counts. */
export function clampClipSeconds(reported: number): number {
  if (!Number.isFinite(reported)) return MAX_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, reported));
}
