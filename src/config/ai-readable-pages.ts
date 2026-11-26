import type { Permission } from "@/types";

/**
 * ============================================================================
 * THE PAGES THIS APP'S AI CAN READ (port of the sibling app's board f039; CLAUDE.md §5)
 * ============================================================================
 *
 * Pau, 20 Nov 2026: "how can we program this AI to read new things added to the app? i need to always say it?" — no:
 * every page under `src/app/(app)` has an entry here, and `ai-readable-pages.test.ts` fails when one has none. An entry
 * names the tool that reads the page's figures for the AI (the agent loop's tools), or says plainly why the AI cannot
 * read it yet (`notReadable`). A new page can't merge until it declares one or the other.
 *
 * What an entry declares:
 *   - route and title, as the app shows them;
 *   - access: the gate the page itself calls (`requirePagePermission` / `requireAdminConsolePage` with its permission,
 *     or `requireAuthenticatedPage`); the test reads the page's source and checks it is the same, and that the reader
 *     tool checks the same permission (`READER_PERMISSION`), so the AI never reads more than the page shows;
 *   - reader: the tool and its args, the figures and periods in a manager's words, and a replay case that asks for it.
 *     The tool's description and the rules book's Business data line are written from these entries, so the model
 *     knows what to ask for (`readablePagesLine`, `pagesToolLine`);
 *   - or notReadable: why not, honestly. Each one is its own item to build a reader for.
 *
 * Scope: pages under `src/app/(app)`, plus an API route that returns report figures with no page behind it
 * (`kind: "api"`). Other admin-only API routes don't count.
 *
 * This is Ask Bubbles' list, written from its own pages. The sibling app keeps its own.
 */

/** The loop tools that read a page's figures. */
export type PageReaderTool = "read_reviews" | "find_past_forms" | "read_hr_approvals" | "read_follow_ups";

export interface PageReader {
  readonly tool: PageReaderTool;
  /** The args that read this page, as the tool takes them. */
  readonly args: Readonly<Record<string, string>>;
  /** The figures, as the page labels them and a manager asks for them. */
  readonly figures: readonly string[];
  /** The periods the reader returns, in a manager's words. */
  readonly periods: readonly string[];
  /** A replay case that asks for this page's figures in a manager's words (`src/app/api/chat/replay-pack/`). */
  readonly replayCase: string;
}

/** The gate the page (or route) calls first. */
export type PageAccess =
  | { readonly permission: Permission; readonly adminConsole?: true }
  | { readonly signedIn: true; readonly note: string }
  | { readonly signedRequest: string };

interface PageBase {
  readonly kind: "page" | "api";
  /** The URL, with its dynamic segments as the folder names spell them (`/reports/[reportId]`). */
  readonly route: string;
  readonly title: string;
  readonly access: PageAccess;
}

export type AiReadablePage =
  | (PageBase & { readonly reader: PageReader; readonly notReadable?: never })
  | (PageBase & { readonly reader?: never; readonly notReadable: string });

const REVIEWS_READER: PageReader = {
  tool: "read_reviews",
  args: {},
  figures: ["qualifying reviews this week and last week", "the newest reviews", "each store's figures, the manager's own marked"],
  periods: ["this week", "last week", "L3", "L6", "YTD", "each month"],
  replayCase: "nov21-agent-loop-read-reviews-this-week",
};

const NO_LOOP_READER = "no tool of the chat or the agent loop reads it.";
const ADMIN = "An admin console page: ";
const MEETINGS = "Meeting docs: the chat and the agent loop have no reader (the meeting page's own assistant reads them there).";
const TRAINING = "AI training lessons and their management: " + NO_LOOP_READER;
const NO_STATS = "This app's loop has no reports reader (no read_stats): " + NO_LOOP_READER;

export const AI_READABLE_PAGES: readonly AiReadablePage[] = [
  { kind: "page", route: "/", title: "Home", access: { permission: "view_overview" },
    reader: { tool: "read_follow_ups", args: {}, figures: ["follow-ups overdue, due this week and open", "each follow-up's employee, form, store and date"], periods: ["today", "this business week"], replayCase: "nov24-follow-ups-overdue-same-count-as-home" } },
  { kind: "page", route: "/chat", title: "Chat", access: { permission: "ask_questions" }, notReadable: "The chat itself: nothing on it to read." },
  { kind: "page", route: "/history", title: "History", access: { permission: "ask_questions" },
    notReadable: "The manager's own past conversations: the chat already holds the open conversation; " + NO_LOOP_READER },

  { kind: "page", route: "/reviews", title: "Google Reviews", access: { permission: "view_reports" }, reader: REVIEWS_READER },
  { kind: "page", route: "/reports", title: "Reports", access: { permission: "view_reports" }, notReadable: "The list of reports: " + NO_STATS },
  { kind: "page", route: "/reports/[reportId]", title: "One report", access: { permission: "view_reports" }, notReadable: "One report's figures: " + NO_STATS },

  { kind: "page", route: "/forms/monitoring", title: "Forms Register", access: { permission: "view_form_monitoring" },
    reader: { tool: "find_past_forms", args: {}, figures: ["the forms on file per person, form and date", "their counts", "each form's status"], periods: ["a date", "a date range", "this month"], replayCase: "nov21-agent-loop-first-name-possessive-opens-forms-on-file" } },
  { kind: "page", route: "/forms/monitoring/[id]", title: "One form on file", access: { permission: "view_form_monitoring" },
    reader: { tool: "find_past_forms", args: {}, figures: ["one form on file: its fields and status (then read_form)"], periods: ["the form's date"], replayCase: "nov21-agent-loop-first-name-possessive-opens-forms-on-file" } },
  { kind: "page", route: "/forms/hr-approval/[id]", title: "HR approval of one form", access: { permission: "view_form_monitoring" },
    reader: { tool: "read_hr_approvals", args: {}, figures: ["whether HR approved, sent back or rejected the form", "HR's latest note", "for HR, the forms waiting and overdue"], periods: ["now"], replayCase: "nov23-hr-approval-manager-asks-has-hr-approved-it" } },
  { kind: "page", route: "/forms/templates", title: "Form templates", access: { permission: "manage_form_templates" },
    notReadable: "The template list (versions, required permission): " + NO_LOOP_READER + " propose_form uses the active templates but does not read this page." },
  { kind: "page", route: "/forms/templates/[key]", title: "Form template editor", access: { permission: "manage_form_templates" },
    notReadable: "One template's fields and versions: " + NO_LOOP_READER },

  { kind: "page", route: "/knowledge", title: "Knowledge Base", access: { permission: "view_knowledge", adminConsole: true },
    notReadable: "The document list and its sync status: " + NO_LOOP_READER + " search_knowledge searches the documents' text, under the chat's permission, not this page's." },
  { kind: "page", route: "/knowledge/document/[id]", title: "Knowledge document", access: { permission: "view_knowledge" },
    notReadable: "The document page (its details and status): " + NO_LOOP_READER + " search_knowledge searches the document's text, under the chat's permission, not this page's." },

  { kind: "page", route: "/meetings", title: "Meetings", access: { signedIn: true, note: "redirects to the first meeting" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]", title: "Meeting", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]/history", title: "Meeting history", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]/history/[version]", title: "Meeting version", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]/past", title: "Past meetings", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]/recaps", title: "Meeting recaps", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },
  { kind: "page", route: "/meetings/[key]/report", title: "Meeting report", access: { signedIn: true, note: "then the meeting's own open check" }, notReadable: MEETINGS },

  { kind: "page", route: "/ai-training", title: "AI training", access: { permission: "view_ai_training" }, notReadable: TRAINING },
  { kind: "page", route: "/ai-training/[track]/[slug]", title: "AI training lesson", access: { permission: "view_ai_training" }, notReadable: TRAINING },
  { kind: "page", route: "/ai-training/manage", title: "Manage AI training", access: { permission: "view_ai_training" }, notReadable: TRAINING },
  { kind: "page", route: "/ai-training/manage/lessons/[id]", title: "Edit AI training lesson", access: { permission: "view_ai_training" }, notReadable: TRAINING },

  { kind: "page", route: "/admin/ai-usage", title: "AI usage", access: { permission: "view_ai_usage" }, notReadable: ADMIN + "AI usage and spend figures; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/analytics", title: "Analytics", access: { permission: "view_analytics" }, notReadable: ADMIN + "chat analytics figures; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/analytics/[view]", title: "Analytics view", access: { permission: "view_analytics" }, notReadable: ADMIN + "chat analytics figures; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/integrations", title: "Integrations", access: { permission: "manage_integrations" }, notReadable: ADMIN + "integration settings and status; no figures." },
  { kind: "page", route: "/admin/integrations/google-reviews", title: "Google Reviews integration", access: { permission: "manage_integrations" }, notReadable: ADMIN + "the Google Reviews sync settings and status; no figures." },
  { kind: "page", route: "/admin/integrations/woven", title: "Woven Employee Sync", access: { permission: "manage_integrations" }, notReadable: ADMIN + "the Woven sync settings and status; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/integrations/woven/[view]", title: "Woven Employee Sync view", access: { permission: "manage_integrations" }, notReadable: ADMIN + "the Woven sync's views; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/integrations/woven/[view]/[id]", title: "Woven employee", access: { permission: "manage_integrations" }, notReadable: ADMIN + "one employee's Woven record; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/integrations/woven-knowledge", title: "Woven Knowledge Sync", access: { permission: "manage_integrations" }, notReadable: ADMIN + "the Woven knowledge sync's status; " + NO_LOOP_READER },
  { kind: "page", route: "/admin/users", title: "User Management", access: { permission: "manage_users" }, notReadable: ADMIN + "user accounts and roles; " + NO_LOOP_READER },

  /* An API route with report figures and no page: the Leadership Hub's assistant reads the Google Reviews page's figures. */
  { kind: "api", route: "/api/partner/hub-reviews", title: "Google Reviews for the Leadership Hub", access: { signedRequest: "verifyHubReviewsRequest" }, reader: REVIEWS_READER },
];

/** The pages (not API routes) a tool reads, once each by title. */
function pagesReadBy(pages: readonly AiReadablePage[], tool?: PageReaderTool): AiReadablePage[] {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (page.kind !== "page" || !page.reader || (tool && page.reader.tool !== tool) || seen.has(page.title)) return false;
    seen.add(page.title);
    return true;
  });
}

/** One line for a tool's description: the pages it reads, their figures and periods (empty when it reads none). */
export function pagesToolLine(pages: readonly AiReadablePage[] | undefined, tool: PageReaderTool): string {
  const read = pagesReadBy(pages ?? [], tool).filter((page) => !page.route.includes("["));
  if (read.length === 0) return "";
  return " Pages it reads: " + read.map((page) => `${page.title} (${page.reader!.figures.join(", ")}; periods: ${page.reader!.periods.join(", ")})`).join("; ") + ".";
}

/** The rules book's Business data line: every page the AI can read, and the tool that reads it (null when none). */
export function readablePagesLine(pages: readonly AiReadablePage[] | undefined): string | null {
  const read = pagesReadBy(pages ?? []).filter((page) => !page.route.includes("["));
  if (read.length === 0) return null;
  return "The app pages you can read, each only through its tool: " + read.map((page) => `${page.title} (${page.reader!.tool})`).join(", ") + ".";
}
