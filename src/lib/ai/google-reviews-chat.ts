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
 * Client-safe: no database client and no `server-only` import.
 */

const GOOGLE_REVIEW_PATTERNS: readonly RegExp[] = [
  /\bgoogle\b[\s\S]{0,40}\b(?:reviews?|ratings?|stars?)\b/i,
  /\b(?:reviews?|ratings?)\b[\s\S]{0,20}\bgoogle\b/i,
  /\b(?:how many|number of|count of)\b[\s\S]{0,40}\breviews\b/i,
  /\breviews?\b[\s\S]{0,60}\b(?:this month|month to date|mtd|this week|goal|target|on track|on pace|behind pace)\b/i,
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
  const normalized = question.replace(/[’‘]/g, "'");
  return APPROVED_GOOGLE_STORES.filter((store) => {
    const byCity = new RegExp(`\\b${escapeRegExp(store.city)}\\b`, "i");
    const byNumber = new RegExp(`\\bstore\\s*#?\\s*${escapeRegExp(store.code)}\\b`, "i");
    return byCity.test(normalized) || byNumber.test(normalized);
  }).map((store) => store.code);
}

const HEADING = "GOOGLE REVIEWS — MONTH TO DATE";

const RULES = [
  "- These are the figures the Google Reviews page shows. Answer from them: give the count, the goal and whether the store is on track, and say which period and which store each figure is for.",
  "- On track means Goal met or On pace above. Behind pace means not on track yet. Partial month means counting started this month, so there is no pace verdict.",
  "- Never state a Google review figure that is not written here, never estimate one, and never send the manager to another tracker for a figure written here.",
].join("\n");

export function reviewsNotPermittedBlock(): string {
  return `${HEADING}\n\nThis account's role does not include View reports. No review figures were read. Do not state any Google review count, rating, goal or store figure. Say plainly that Google review figures are not available for their role.`;
}

export function reviewsUnavailableBlock(reason: string): string {
  return `${HEADING}\n\n${reason} No figure was estimated. Say so plainly; do not give a Google review count.`;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function day(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

/**
 * The block for the stores this account may see. `outOfScopeStoreCodes` are
 * stores the question named that the account may not see; they are named
 * without a figure.
 */
export function formatGoogleReviewsBlock(input: {
  /** Null only when nothing is read: every store the question named is out of scope. */
  readonly context: GoalContext | null;
  readonly rows: readonly GoalRow[];
  readonly outOfScopeStoreCodes: readonly string[];
}): string {
  const { context } = input;
  const lines: string[] = [HEADING, ""];
  if (context) {
    const start = SHORT_DATE.format(day(context.monthStart));
    const end = SHORT_DATE.format(day(context.today));
    lines.push(
      `Period: ${MONTH_YEAR.format(day(context.monthStart))} month to date, ${start === end ? start : `${start} – ${end}`} (Central time).`,
      "A qualifying review is 3, 4 or 5 stars. Each store's monthly goal is written on its line.",
    );
  }

  for (const code of input.outOfScopeStoreCodes) {
    const store = APPROVED_GOOGLE_STORES.find((entry) => entry.code === code);
    lines.push(`- ${store?.displayName ?? `Store ${code}`}: not one of the stores this account may see. No figure is given for it.`);
  }

  if (input.rows.length === 0 || !context) {
    if (input.outOfScopeStoreCodes.length === 0) {
      lines.push("No store with a Google listing is assigned to this account.");
    }
    return [...lines, "", RULES].join("\n");
  }

  for (const row of input.rows) {
    const name = `${row.displayName} (store ${row.storeCode})`;
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
