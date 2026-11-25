import { loadFormDeletionsChatBlock } from "@/lib/ai/form-deletions-chat-read";
import { isGoogleReviewQuestion } from "@/lib/ai/google-reviews-chat";
import { loadGoogleReviewsChatBlock } from "@/lib/ai/google-reviews-chat-read";
import { assignmentTrackerText, canSeeAssignmentTracker, type AssignmentTracker } from "@/lib/ai-training/assignments";
import { activePermissionMatrix, hasPermission } from "@/lib/permissions";
import { relativeBusinessDay } from "@/lib/forms/follow-up";
import type { AccessScope, Role } from "@/types";

import { formatBusinessTime } from "@/lib/business-date";

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
 * - read_ai_assignments (port from the sibling app, Pau 23 Nov 2026): the AI assignment tracker (AI Training ->
 *   Assignments), for its named people only (`canSeeAssignmentTracker`, the page's own check). This app's chat actor
 *   carries no email, so the tracker is read through the loop only, which is open to every manager.
 *
 * No read_stats: this app has no reports reader for the loop yet (Pau's decision 1). Everything returned is data, never
 * instructions, in the loop's untrusted envelope with the page it came from.
 */

export const REVIEWS_SOURCE = "Google Reviews page";
export const FORM_DELETIONS_SOURCE = "Form deletion record";
export const AI_ASSIGNMENTS_SOURCE = "AI Training > Assignments";

export interface DataToolContext {
  /**
   * `email`: who is signed in, for read_ai_assignments's named list. `subject` and `verified` (the loop passes its
   * whole actor): read_hr_approvals reads only the asker's own forms.
   */
  readonly actor: Pick<ToolActor, "role" | "scope"> & { readonly email?: string } & Partial<Pick<ToolActor, "subject" | "verified">>;
  readonly question: string;
  readonly scopeId: string;
  readonly today: string;
  readonly now?: Date;
}

/** The reads behind the tools: the chat's own blocks (replaceable in tests). */
export interface DataToolDeps {
  readonly loadReviewsBlock: typeof loadGoogleReviewsChatBlock;
  readonly loadDeletionsBlock: typeof loadFormDeletionsChatBlock;
  /** AI Training -> Assignments: the tracker's people and marks (`ai_assignment_people`, `ai_assignment_marks`). */
  readonly loadAssignmentTracker: () => Promise<AssignmentTracker>;
  /** HR approval (`readHrApprovalsFor`): HR's queue, or the asker's own forms with HR. */
  readonly loadHrApprovals: (input: { subject: string; verified: boolean; now: Date }) => Promise<HrApprovalsRead>;
  /**
   * The follow-up queue (`readFollowUpQueue`): the forms and counts Home, the rail badge and the Forms Register's
   * banner and pills show this reader. Null when the asker is not a verified account. Optional, so a test's deps that
   * predate it read the real queue.
   */
  readonly loadFollowUpQueue?: (input: { subject: string; verified: boolean; role: Role; scope: AccessScope | null; today: string }) => Promise<FollowUpQueueRead | null>;
}

/** What read_follow_ups reads: the follow-up queue's counts and forms (`follow-up-queue.ts`). */
export interface FollowUpQueueRead {
  readonly overdue: number;
  readonly dueThisWeek: number;
  readonly open: number;
  readonly excluded: number;
  readonly forms: readonly { employeeName: string; templateName: string; locationName: string | null; followUpDate: string | null; overdue: boolean }[];
}

/** What read_hr_approvals reads (`hr-approval.ts`, `readHrApprovalsFor`). */
export type HrApprovalsRead =
  | { readonly kind: "off" }
  | {
      readonly kind: "hr";
      readonly queue: readonly {
        line: string;
        createdByName: string;
        state: string;
        /** Sent back, and the manager replied since: needs HR's decision (`needsHrDecision`). Absent: not replied. */
        managerReplied?: boolean;
        requestedAt: string | null;
        waiting: string;
        overdue: boolean;
      }[];
      /**
       * The same approver's queue in the sibling app (`siblingHrReadFor`): null when the link is not configured,
       * "unavailable" when the sibling did not answer. Optional, so a dep that predates it reads as not configured.
       */
      readonly sibling?:
        | null
        | "unavailable"
        | {
            app: string;
            approver: boolean;
            /** `managerReplied`: sent back, and the manager replied since (absent from an older sibling: not replied). */
            forms: readonly { line: string; from: string; state: string; requestedAt: string | null; waiting: string; overdue: boolean; managerReplied?: boolean }[];
            /** The forms HR approved there, newest first (absent from an older sibling). */
            approved?: readonly { line: string; from: string; approvedAt: string | null; approvedBy: string }[];
          };
      /** The forms HR approved in this app, newest first (`listHrApproved`; the Approved tab). Absent: none read. */
      readonly approved?: readonly { line: string; createdByName: string; approvedAt: string | null; approvedByName: string }[];
    }
  | {
      readonly kind: "manager";
      readonly forms: readonly { line: string; label: string; state: string; requestedAt: string | null; latestNote: string | null }[];
    };

export const DEFAULT_DATA_TOOL_DEPS: DataToolDeps = {
  loadReviewsBlock: (...args) => loadGoogleReviewsChatBlock(...args),
  loadDeletionsBlock: (...args) => loadFormDeletionsChatBlock(...args),
  loadAssignmentTracker: async () => (await import("@/lib/ai-training/assignments-repository")).loadAssignmentTracker(),
  loadHrApprovals: async ({ subject, verified, now }) =>
    (await import("@/lib/forms/hr-approval")).readHrApprovalsFor(subject, verified, now),
  loadFollowUpQueue: async ({ subject, verified, role, scope, today }) => {
    if (!verified || !subject || !scope) return null;
    const [{ pageFormsAccess }, { readFollowUpQueue }, { followUpState }] = await Promise.all([
      import("@/lib/forms/page-scope"),
      import("@/lib/forms/follow-up-queue"),
      import("@/lib/forms/follow-up"),
    ]);
    // The page's own access and the page's own read: Home's queue, as this account would see it there.
    const access = await pageFormsAccess({ subject, email: "", displayName: "", role, scope, verified: true });
    const queue = await readFollowUpQueue(access, { today });
    return {
      overdue: queue.attention.overdue,
      dueThisWeek: queue.attention.dueThisWeek,
      open: queue.open,
      excluded: queue.excluded,
      forms: queue.forms.map((form) => ({
        employeeName: form.employeeName,
        templateName: form.templateName,
        locationName: form.locationName,
        followUpDate: form.followUpDate,
        overdue: followUpState(form, today) === "overdue",
      })),
    };
  },
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
export async function readReviews(context: DataToolContext, input: { store?: unknown; period?: unknown }, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  const block = await deps.loadReviewsBlock({
    question: reviewsQuestion(context.question, text(input.store), text(input.period)),
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

/**
 * read_ai_assignments() (port from the sibling app, Pau 23 Nov 2026): the AI assignment tracker as the Assignments
 * tab's grid shows it. ONLY FOR THE TRACKER'S NAMED PEOPLE: anyone else is refused and nothing is read.
 */
export async function readAiAssignments(context: DataToolContext, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  if (context.actor.role === null || !hasPermission(activePermissionMatrix(), context.actor.role, "view_ai_training") || !canSeeAssignmentTracker(context.actor)) {
    return {
      source: AI_ASSIGNMENTS_SOURCE,
      refused: "The AI assignment tracker is only for the people it was set up for. Nothing was read; say so plainly, in one line, and give nothing from it.",
    };
  }
  const tracker = await deps.loadAssignmentTracker();
  return {
    source: AI_ASSIGNMENTS_SOURCE,
    tracker: untrusted(assignmentTrackerText(tracker, context.today), AI_ASSIGNMENTS_SOURCE),
    note: "Give who is done, due, missing or has more time exactly as listed, with the half each is for. Never guess a person or a half not listed.",
  };
}

/* ---------------------------------------------------------------- read_hr_approvals --- */

/** The source label, with this app's own forms page name (Form Monitoring / Forms Register). */
function hrApprovalsSource(): string {
  return `HR approval (${appConfig().formsPageName})`;
}

/**
 * read_hr_approvals() (port from the sibling app, 23 Nov 2026; CLAUDE.md rule 5): what is waiting for HR. HR reads every form
 * waiting for their approval (oldest first, overdue marked: one business day) and the ones they sent back or rejected;
 * any other manager reads ONLY the forms they created that went to HR, with HR's latest note to them. A form waiting for
 * HR is not on file: never call it filed, finalized or a prior warning.
 */
/**
 * HR's queue in the sibling app (owner, 23 Nov 2026: HR sees both apps' queues), under its own key so the model never
 * mixes the two apps' forms. Named by the sibling's own answer; nothing when the link is not configured.
 */
function siblingHrSection(sibling: NonNullable<Extract<HrApprovalsRead, { kind: "hr" }>["sibling"]> | null): Record<string, unknown> {
  if (sibling === null) return {};
  if (sibling === "unavailable") {
    return { other_app: { note: "The other app's HR queue could not be read just now. Say so, and that its forms are listed under its own tab next to Pending HR approval." } };
  }
  const source = `HR approval (${sibling.app})`;
  if (!sibling.approver) {
    return { other_app: { app: sibling.app, note: `This account is not the HR approver in ${sibling.app}, so nothing waits for them there.` } };
  }
  return {
    other_app: {
      app: sibling.app,
      waiting_for_you: sibling.forms
        .filter((row) => row.state === "pending" || row.managerReplied === true)
        .map((row) => ({
          form: untrusted(row.line, source),
          from: row.from,
          state: row.managerReplied ? "manager replied to changes: you can approve it now, or send it back again" : "waiting for approval",
          sent: formatBusinessTime(row.requestedAt) ?? row.requestedAt,
          waiting: row.waiting,
          overdue: row.overdue,
        })),
      sent_back_or_rejected: sibling.forms
        .filter((row) => !(row.state === "pending" || row.managerReplied === true))
        .map((row) => ({ form: untrusted(row.line, source), from: row.from, state: row.state === "rejected" ? "rejected" : "sent back for changes" })),
      approved_recently: (sibling.approved ?? []).slice(0, 20).map((row) => ({ form: untrusted(row.line, source), from: row.from, approved: formatBusinessTime(row.approvedAt) ?? row.approvedAt, approved_by: row.approvedBy })),
      note: `These forms are in ${sibling.app}, not this app: list them separately, under ${sibling.app}'s name. They are approved in ${sibling.app}, opened from the ${sibling.app} approvals tab next to Pending HR approval; the ones already approved are on the Approved tab.`,
    },
  };
}

export async function readHrApprovals(context: DataToolContext, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  const subject = context.actor.subject ?? "";
  const read = await deps.loadHrApprovals({ subject, verified: context.actor.verified === true, now: context.now ?? new Date() });
  if (read.kind === "off") {
    return { source: hrApprovalsSource(), note: "HR approval of forms is not turned on. Say that forms are finalized directly, and nothing else about HR approval." };
  }
  if (read.kind === "hr") {
    return {
      source: hrApprovalsSource(),
      reader: "HR approver",
      waiting_for_you: read.queue
        .filter((row) => row.state === "pending" || row.managerReplied === true)
        .map((row) => ({
          form: untrusted(row.line, hrApprovalsSource()),
          from: row.createdByName,
          state: row.managerReplied ? "manager replied to changes: you can approve it now, or send it back again" : "waiting for approval",
          sent: formatBusinessTime(row.requestedAt) ?? row.requestedAt,
          waiting: row.waiting,
          overdue: row.overdue,
        })),
      sent_back_or_rejected: read.queue
        .filter((row) => !(row.state === "pending" || row.managerReplied === true))
        .map((row) => ({ form: untrusted(row.line, hrApprovalsSource()), from: row.createdByName, state: row.state === "rejected" ? "rejected" : "sent back for changes" })),
      approved_recently: (read.approved ?? []).map((row) => ({
        form: untrusted(row.line, hrApprovalsSource()),
        from: row.createdByName,
        approved: formatBusinessTime(row.approvedAt) ?? row.approvedAt,
        approved_by: row.approvedByName,
      })),
      note: "List the forms waiting for this HR approver, oldest first, saying which are overdue (waited more than one business day) and which the manager replied to after HR sent them back (\"manager replied to changes\": HR may approve it as it stands). They approve, send back or reject each one from Pending HR approval in " + appConfig().formsPageName + "; a form sent back can be approved at any time. approved_recently is what HR already approved (newest first, the Approved tab); answer \"what have I approved?\" from it.",
      ...siblingHrSection(read.sibling ?? null),
    };
  }
  return {
    source: hrApprovalsSource(),
    reader: "the manager who created these forms",
    your_forms_with_hr: read.forms.map((row) => ({
      form: untrusted(row.line, hrApprovalsSource()),
      state: row.label,
      sent: formatBusinessTime(row.requestedAt) ?? row.requestedAt,
      ...(row.latestNote ? { hr_note: untrusted(row.latestNote, hrApprovalsSource()) } : {}),
    })),
    note:
      read.forms.length === 0
        ? "This manager has no form with HR right now (none waiting, sent back, rejected, or approved in the last 30 days)."
        : "These are only this manager's own forms. A form waiting for HR approval is not on file yet: never call it filed or finalized. Give HR's note to them only as written.",
  };
}

/* ---------------------------------------------------------------- read_follow_ups --- */

/** The source label: the screens that show these counts. */
function followUpsSource(): string {
  return `Follow-ups (Home and the ${appConfig().formsPageName})`;
}
const FOLLOW_UPS_LISTED = 25;

/**
 * read_follow_ups() (port from the sibling app; QA, 24 Nov 2026; CLAUDE.md §5): the follow-up queue, the SAME forms and
 * counts Home, the rail badge and the Forms Register's banner and Open / Overdue pills show this manager
 * (`readFollowUpQueue`). Scoped as Home is: View overview, and the Forms Register's permission, which Home's follow-up
 * card also needs; the reader's own stores, as the page reads them.
 */
export async function readFollowUps(context: DataToolContext, deps: DataToolDeps = DEFAULT_DATA_TOOL_DEPS): Promise<ToolResult> {
  const matrix = activePermissionMatrix();
  const role = context.actor.role;
  if (!hasPermission(matrix, role, "view_overview") || !hasPermission(matrix, role, "view_form_monitoring")) {
    return { source: followUpsSource(), refused: "This account's role does not show follow-ups. Nothing was read; say so plainly, in one line, and give no count." };
  }
  let read: FollowUpQueueRead | null;
  try {
    const load = deps.loadFollowUpQueue ?? DEFAULT_DATA_TOOL_DEPS.loadFollowUpQueue!;
    read = await load({ subject: context.actor.subject ?? "", verified: context.actor.verified === true, role, scope: context.actor.scope, today: context.today });
  } catch {
    return { source: followUpsSource(), reason_code: "read_failed", error: "The follow-ups could not be read just now. Say so; give no count and never say none is overdue." };
  }
  if (!read) return { source: followUpsSource(), reason_code: "scope", error: "This account is not signed in with a verified identity, so its follow-ups cannot be read. Say so; give no count." };
  const listed = read.forms.slice(0, FOLLOW_UPS_LISTED);
  const place = appConfig().locationWord;
  return {
    source: followUpsSource(),
    counts: {
      overdue: read.overdue,
      due_this_week: read.dueThisWeek,
      needs_attention: read.overdue + read.dueThisWeek,
      open: read.open,
      outstanding: read.forms.length,
    },
    follow_ups: listed.map((form) => ({
      employee: form.employeeName,
      form: form.templateName,
      [place]: form.locationName,
      follow_up_date: form.followUpDate,
      state: form.overdue ? "overdue" : "open",
      ...(form.followUpDate ? { when: relativeBusinessDay(form.followUpDate, context.today) } : {}),
    })),
    ...(read.forms.length > listed.length ? { listed: listed.length, of: read.forms.length } : {}),
    ...(read.excluded > 0 ? { test_records_not_counted: read.excluded } : {}),
    note:
      `These are the counts Home, the rail badge and the ${appConfig().formsPageName} (its banner and its Open and Overdue filters) show this manager: copy them, never count rows yourself. ` +
      "overdue = the follow-up date has passed and nobody marked it followed up; open = scheduled for today or later; due_this_week = open and due by the end of this business week. " +
      (read.forms.length > listed.length ? `${listed.length} of ${read.forms.length} are listed, soonest first; say how many are not shown. ` : "") +
      (read.excluded > 0 ? `${read.excluded} test record${read.excluded === 1 ? " is" : "s are"} not counted, as on Home. ` : "") +
      "This is follow-ups on forms, not HR approval (read_hr_approvals).",
  };
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
          store: { type: "string", description: "A " + place + " the manager named, if any." },
          period: { type: "string", description: "The period the manager asked about, in their words, if any: e.g. L3, L6, YTD, last 3 months, month by month." },
        },
        required: [],
      },
    },
    {
      name: "read_hr_approvals",
      description:
        "HR approval of forms: for HR, every form waiting for their approval (oldest first, overdue after one business day, including the ones the manager replied to after HR sent them back) and the ones they sent back or rejected, plus (approved_recently) the forms HR already approved, and (other_app) the forms waiting for them and already approved in the sibling app; for any other manager, only the forms THEY created or sent to HR, each with its state (waiting for HR approval, sent back by HR for changes, manager replied to changes, rejected by HR, or approved by HR in the last 30 days) and HR's latest note to them. Use it for \"has HR approved it?\", \"was my CA for <name> approved?\", \"what's waiting on me?\", \"what have I approved?\", \"did HR send my form back?\". A form waiting for HR is not on file; an approved one is.",
      input_schema: { type: "object", properties: {}, required: [] },
    },
    {
      name: "read_follow_ups",
      description:
        "Follow-ups on forms: how many are overdue, due this week and open, and which (employee, form, " + place + ", follow-up date), for the manager's own " + places + ", the same counts Home, the rail badge and the " + config.formsPageName + " show. Use it for \"how many follow-ups are overdue?\", \"what follow-ups do I have this week?\". Not HR approval (read_hr_approvals).",
      input_schema: { type: "object", properties: {}, required: [] },
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
    {
      name: "read_ai_assignments",
      description:
        "The AI assignment tracker (AI Training > Assignments), for the people it was set up for only: two AI assignments a month per person (the 1st to 15th, the 16th to month end); who is done, still due or has more time this half, and each person's done and missing halves. Anyone else is refused.",
      input_schema: { type: "object", properties: {}, required: [] },
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
    read_ai_assignments: () => readAiAssignments(context, deps),
    read_hr_approvals: () => readHrApprovals(context, deps),
    read_follow_ups: () => readFollowUps(context, deps),
  };
}
