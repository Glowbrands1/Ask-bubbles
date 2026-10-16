/**
 * THE AUTOMATIC SYNC'S SCHEDULE, as plain data — no server imports, so the admin
 * screen can use the same functions the tests do.
 *
 * Vercel cron expressions are evaluated in UTC. This understands exactly the
 * daily shape `M H * * *` that `vercel.json` uses for the Woven employee sync,
 * and reports `null` for anything else rather than guessing at it.
 */

export interface DailySchedule {
  minute: number;
  hour: number;
}

export function parseDailyCron(expression: string): DailySchedule | null {
  const match = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(expression.trim());
  if (!match) return null;
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  return minute <= 59 && hour <= 23 ? { minute, hour } : null;
}

/** The next time the daily schedule fires strictly after `now`. */
export function nextDailyRun(schedule: DailySchedule, now: Date): Date {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), schedule.hour, schedule.minute));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Once a day at 11:17 UTC". */
export function describeDaily(schedule: DailySchedule): string {
  return `Once a day at ${pad(schedule.hour)}:${pad(schedule.minute)} UTC`;
}

/** The same moment as a Central-time clock reading, e.g. "6:17 AM CDT". */
export function centralClock(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at);
}

/** A full Central-time date and time, e.g. "Oct 14, 6:17 AM CDT". */
export function centralDateTime(at: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at);
}
