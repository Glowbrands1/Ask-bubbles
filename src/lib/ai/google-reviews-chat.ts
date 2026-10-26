import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import {
  GOAL_STATUS_LABEL,
  goalProgress,
  goalStatus,
  goalSummary,
  paceTargetFor,
  type GoalContext,
  type GoalRow,
} from "@/lib/google-reviews/goals";

/**
 * Google review figures for a chat turn, from the Google Reviews page's own
 * goal counts. Behind GOOGLE_REVIEWS_IN_CHAT_ENABLED.
 *
 * Ported from the sibling app (QA T11, 25 Oct 2026): the chat answered "I don't
 * have review counts" while /reviews showed the month to date against the
 * goal. This module decides whether a question is about Google reviews,
 * which stores it names, and writes the block. The read and the permission
 * check are in `google-reviews-chat-read.ts`.
 *
 * THE SAME STORES THE PAGE SHOWS. /reviews lists every store to anybody with
 * View reports, so the block does too, never more. The caller's own stores
 * are marked so the answer can lead with them.
 *
 * Client-safe: no database client and no `server-only` import.
 */

const GOOGLE_REVIEW_PATTERNS: readonly RegExp[] = [
  /\bgoogle\b[\s\S]{0,40}\b(?:reviews?|ratings?|stars?)\b/i,
  /\b(?:reviews?|ratings?)\b[\s\S]{0,20}\bgoogle\b/i,
  /\b(?:how many|number of|count of)\b[\s\S]{0,40}\breviews\b/i,
  /\breviews?\b[\s\S]{0,60}\b(?:this month|month to date|mtd|this week|goal|target|on track|on pace|behind pace)\b/i,
  /\b(?:on track|on pace|behind pace|goal|target)\b[\s\S]{0,40}\breviews?\b/i,
  /\b(?:review (?:goal|count|target)s?|star ratings?)\b/i,
];

/** A review of a person or a document, not a Google review. */
const OTHER_REVIEW = /\b(?:policy|performance|annual|employee|coaching|90[- ]day|manager|peer)\s+reviews?\b/i;

export function isGoogleReviewQuestion(question: string): boolean {
  if (!GOOGLE_REVIEW_PATTERNS.some((pattern) => pattern.test(question))) return false;
  if (OTHER_REVIEW.test(question) && !/\bgoogle\b/i.test(question)) return false;
  return true;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Store codes of the Google stores a question names, by city ("Lee's
 * Summit") or store number ("store 219"). Empty when it names none.
 */
export function storeCodesNamedIn(question: string): string[] {
  /* "lees summit" is how a manager types Lee's Summit. */
  const normalized = question.replace(/['’‘]/g, "");
  return APPROVED_GOOGLE_STORES.filter((store) => {
    const byCity = new RegExp(`\\b${escapeRegExp(store.city.replace(/'/g, ""))}\\b`, "i");
    const byNumber = new RegExp(`\\bstore\\s*#?\\s*${escapeRegExp(store.code)}\\b`, "i");
    return byCity.test(normalized) || byNumber.test(normalized);
  }).map((store) => store.code);
}

const HEADING = "GOOGLE REVIEWS — MONTH TO DATE";

/** How old the last sync may be before the answer has to say the figures may be out of date. */
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

const PAGE = "Google Reviews in the sidebar";

const RULES = [
  "- These are the figures the Google Reviews page shows. Answer from them: give the count, the goal and whether the store is on track, and say which period and which store each figure is for.",
  "- On track means Goal met or On pace above. Behind pace means not on track yet. Partial month means counting started this month, so there is no pace verdict.",
  "- Never state a Google review figure that is not written here, never estimate one, and never send the manager to another tracker for a figure written here.",
  `- The manager can see the same figures on ${PAGE}.`,
].join("\n");

export function reviewsNotPermittedBlock(): string {
  return `${HEADING}\n\nThis account's role does not include View reports. No review figures were read. Do not state any Google review count, rating, goal or store figure. Say plainly that Google review figures are not available for their role.`;
}

export function reviewsUnavailableBlock(reason: string): string {
  return `${HEADING}\n\n${reason} No figure was estimated. Say so plainly, do not give a Google review count, and point the manager to ${PAGE}.`;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const INSTANT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/** "Data as of" and, past two days, the instruction to say the figures may be out of date. */
export function freshnessLines(lastSyncAt: string | null, now: Date): string[] {
  const at = lastSyncAt ? new Date(lastSyncAt) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return [`Data as of: no completed sync is recorded. Say the figures may not be current, and point the manager to ${PAGE}.`];
  }
  const shown = INSTANT.format(at);
  const lines = [`Data as of: the last Google review sync, ${shown} (Central time).`];
  if (now.getTime() - at.getTime() > STALE_AFTER_MS) {
    lines.push(
      `The last sync is more than 2 days old. Say so first: these figures are as of ${shown} and may be out of date, and the latest are on ${PAGE}.`,
    );
  }
  return lines;
}

/**
 * The block. `rows` are the page's rows, already narrowed to any store the
 * question names; `ownStoreCodes` are the caller's stores, marked.
 */
export function formatGoogleReviewsBlock(input: {
  readonly context: GoalContext;
  readonly rows: readonly GoalRow[];
  readonly ownStoreCodes: ReadonlySet<string>;
  readonly lastSyncAt: string | null;
  readonly now: Date;
}): string {
  const { context } = input;
  const start = SHORT_DATE.format(day(context.monthStart));
  const end = SHORT_DATE.format(day(context.today));
  const lines: string[] = [
    HEADING,
    "",
    `Period: ${MONTH_YEAR.format(day(context.monthStart))} month to date, ${start === end ? start : `${start} – ${end}`} (Central time).`,
    ...freshnessLines(input.lastSyncAt, input.now),
    "A qualifying review is 3, 4 or 5 stars. Each store's monthly goal is written on its line.",
  ];

  for (const row of input.rows) {
    const own = input.ownStoreCodes.has(row.storeCode) ? ", this manager's store" : "";
    const name = `${row.displayName} (store ${row.storeCode}${own})`;
    const status = goalStatus(row, context);
    if (status === "not_counting") {
      lines.push(`- ${name}: not counting yet. No baseline is set, so the page shows no month-to-date figure for it.`);
      continue;
    }
    const progress = goalProgress(row.qualifyingMonthToDate, row.monthlyTarget);
    const still = progress.remaining > 0 ? `${progress.remaining} still needed` : "goal reached";
    const pace = paceTargetFor(row.monthlyTarget, context.daysElapsed, context.daysInMonth);
    lines.push(
      `- ${name}: ${row.qualifyingMonthToDate} qualifying reviews month to date of the ${row.monthlyTarget} goal, ${still}. Status: ${GOAL_STATUS_LABEL[status]} (on pace today means at least ${pace}). ${row.qualifyingThisWeek} this week.`,
    );
  }

  if (input.rows.length > 1) {
    const summary = goalSummary(input.rows);
    lines.push(
      `Total for the ${summary.counting} counting stores above: ${summary.qualifyingMonthToDate} qualifying reviews month to date against a combined goal of ${summary.combinedTarget}. ${summary.atGoal} at goal.`,
    );
  }

  return [...lines, "", RULES].join("\n");
}
