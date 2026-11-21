import { loadFormDeletionsChatBlock } from "@/lib/ai/form-deletions-chat-read";
import { isGoogleReviewQuestion } from "@/lib/ai/google-reviews-chat";
import { loadGoogleReviewsChatBlock } from "@/lib/ai/google-reviews-chat-read";

import { appConfig, type AppConfig } from "./app-config";
import { untrusted as envelope, type ToolActor, type ToolEffects, type ToolResult } from "./tools";

/*
 * ============================================================================
 * THE AGENT LOOP'S APP DATA TOOLS: read_reviews AND read_form_deletions (the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * The loop reads this app's figures through the same reads this app's chat already uses, so it answers from exactly
 * what the chat (and the page) shows:
 *
 * - read_reviews: the Google Reviews block (`loadGoogleReviewsChatBlock`): every store, as the Google Reviews page shows
 *   every store, with the manager's own stores marked (Pau's decision 5, 21 Nov 2026), narrowed to a store named; this
 *   week and last, the newest reviews, and L3 / L6 / YTD / month by month when a period is asked. Gated on View reports,
 *   the page's own gate (decision 6).
 * - read_form_deletions: the form deletion record (`loadFormDeletionsChatBlock`): administrators only (Manage users).
 *
 * No read_stats: this app has no reports reader for the loop yet (Pau's decision 1). Everything returned is data, never
 * instructions, in the loop's untrusted envelope with the page it came from.
 */

export const REVIEWS_SOURCE = "Google Reviews page";
export const FORM_DELETIONS_SOURCE = "Form deletion record";

export interface DataToolContext {
  readonly actor: Pick<ToolActor, "role" | "scope">;
  readonly question: string;
  readonly scopeId: string;
  readonly today: string;
  readonly now?: Date;
}

/** The reads behind the tools: the chat's own blocks (replaceable in tests). */
export interface DataToolDeps {
  readonly loadReviewsBlock: typeof loadGoogleReviewsChatBlock;
  readonly loadDeletionsBlock: typeof loadFormDeletionsChatBlock;
}

export const DEFAULT_DATA_TOOL_DEPS: DataToolDeps = {
  loadReviewsBlock: (...args) => loadGoogleReviewsChatBlock(...args),
  loadDeletionsBlock: (...args) => loadFormDeletionsChatBlock(...args),
};

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function untrusted(body: string, source: string): { untrusted_text: string; source: string } {
  return { ...envelope(body), source };
}

/**
 * The words the chat's block reads (a store named, a period asked, that this is about Google reviews): the manager's own
 * question, with the tool's store and period added so the block reads them even when the question only implies them.
 */
function reviewsQuestion(question: string, store: string | null, period: string | null): string {
  const asked = [question, store, period].filter(Boolean).join(" ");
  return isGoogleReviewQuestion(asked) ? asked : `Google reviews ${asked}`;
}

/** read_reviews({salon?, period?}): the Google Reviews page's figures, every store, the manager's own marked. */
export async function readReviews(context: DataToolContext, input: { salon?: unknown; period?: unknown }, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  const block = await deps.loadReviewsBlock({
    question: reviewsQuestion(context.question, text(input.salon), text(input.period)),
    role: context.actor.role,
    scope: context.actor.scope,
    ...(context.now ? { now: context.now } : {}),
  });
  if (!block) return { reason_code: "read_failed", error: "The Google review figures could not be read just now. Say so; never estimate a figure." };
  return {
    figures: untrusted(block.text, REVIEWS_SOURCE),
    has_figures: block.figures,
    note: "Give only these figures, with the period and the " + appConfig().locationWord + " each is for. The manager's own " + appConfig().locationWordPlural + " are marked; every " + appConfig().locationWord + " is shown, as the Google Reviews page shows them.",
  };
}

/** read_form_deletions({employee_name?}): who deleted a form, when and how. Administrators only. */
export async function readFormDeletions(context: DataToolContext, input: { employee_name?: unknown }, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  const employee = text(input.employee_name);
  const question = employee ? `who deleted ${employee}'s form?` : "who deleted the form?";
  const block = await deps.loadDeletionsBlock({ question, role: context.actor.role });
  if (!block) return { reason_code: "read_failed", error: "The form deletion record could not be read just now. Say so." };
  return { record: untrusted(block, FORM_DELETIONS_SOURCE) };
}

/* ---------------------------------------------------------------- registration --- */

/** The data tools' specs, in the loop's tool-list shape (`run.ts`), with the app config's words. */
export function dataToolSpecs(config: AppConfig) {
  const place = config.locationWord;
  const places = config.locationWordPlural;
  return [
    {
      name: "read_reviews",
      description:
        "The Google Reviews page's figures for every " + place + ", with the manager's own " + places + " marked: qualifying reviews month to date against the monthly goal, this week and last, the average star, and the newest reviews; with L3 (last 3 full months), L6 (last 6 full months), YTD and each month when the manager asks for a period. Narrowed to a " + place + " the manager names.",
      input_schema: {
        type: "object",
        properties: {
          salon: { type: "string", description: "A " + place + " the manager named, if any." },
          period: { type: "string", description: "The period the manager asked about, in their words, if any: e.g. L3, L6, YTD, last 3 months, month by month." },
        },
        required: [],
      },
    },
    {
      name: "read_form_deletions",
      description:
        "Administrators only: who deleted a form, when and how (" + config.formsPageName + ", chat, or outside the app), from the permanent deletion record, newest first. Pass employee_name for one employee's forms (\"who deleted <name>'s form?\"). A manager is refused.",
      input_schema: {
        type: "object",
        properties: {
          employee_name: { type: "string", description: "The employee whose deleted forms the admin asked about, as typed, if any." },
        },
        required: [],
      },
    },
  ] as const;
}

/** Test seam: the reads the replay pack's handlers use, over the real ones (unset: the real reads). */
let depsForTests: Partial<DataToolDeps> | null = null;
export function __setDataToolDepsForTests(deps: Partial<DataToolDeps> | null): void {
  depsForTests = deps;
}

/** The data tools' handlers, keyed as the loop dispatches them (`run.ts`). */
export function dataToolHandlers(
  context: DataToolContext,
  _effects?: Pick<ToolEffects, "sources">,
  deps: DataToolDeps = depsForTests ? { ...DEFAULT_DATA_TOOL_DEPS, ...depsForTests } : DEFAULT_DATA_TOOL_DEPS,
): Record<string, (args: Record<string, unknown>) => Promise<ToolResult>> {
  return {
    read_reviews: (args) => readReviews(context, args, deps),
    read_form_deletions: (args) => readFormDeletions(context, args, deps),
  };
}
