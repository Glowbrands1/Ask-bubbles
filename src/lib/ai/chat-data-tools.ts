import "server-only";

import { passwordResetHelp } from "./app-help";
import { formatBreakdown, planReportBreakdown, type BreakdownRow } from "./report-breakdown";
import { reportBreakdownEnabled } from "@/lib/config/chat-quality-flags";
import { readStoreSummaries } from "@/lib/google-reviews/views";
import { hasPermission, DEFAULT_PERMISSION_MATRIX } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * Read-only store data for one chat turn.
 *
 * Off, this returns empty and reads nothing. Review counts come from the
 * stored Google review summaries. Sales and comp figures are not invented:
 * this app's chat report loaders do not supply a breakdown, so that read
 * says so.
 */

export interface ChatDataAddition {
  readonly help: string | null;
  readonly data: string | null;
}

const EMPTY: ChatDataAddition = { help: null, data: null };

const WANTS_DATA = /\b(?:reviews?|sales totals|comp report|breakdown|by store|by salon)\b/i;

export async function loadChatDataBlock(input: {
  readonly enabled: boolean;
  readonly question: string;
  readonly role: Role | null;
  readonly breakdown: boolean;
}): Promise<ChatDataAddition> {
  if (!input.enabled) return EMPTY;
  const help = passwordResetHelp(input.question);
  const allowed = input.role !== null && hasPermission(DEFAULT_PERMISSION_MATRIX, input.role, "view_reports");
  if (!allowed || !WANTS_DATA.test(input.question)) return { help, data: null };

  const plan = input.breakdown || reportBreakdownEnabled() ? planReportBreakdown(input.question) : null;
  if (plan && (plan.kind === "unavailable" || plan.unavailable)) {
    return { help, data: formatBreakdown(plan, [], null) };
  }

  if (/\breviews?\b/i.test(input.question)) {
    try {
      const stores = await readStoreSummaries();
      const rows: BreakdownRow[] = stores.slice(0, 40).map((store) => ({
        label: store.displayName || store.storeCode,
        when: store.storeCode,
        value: `${store.reviewCount} reviews, average ${store.averageRating ?? "unknown"}, ${store.unansweredCount} unanswered`,
      }));
      const planForRows = plan && plan.kind === "reviews" ? plan : planReportBreakdown("reviews by store");
      return { help, data: formatBreakdown(planForRows.kind === "none" ? { ...planForRows, kind: "reviews", report: "Google Reviews", note: "Stored review summaries." } : planForRows, rows, null) };
    } catch {
      return { help, data: "Google Reviews\n\nThe review summaries could not be read. No count was invented." };
    }
  }

  return {
    help,
    data: "REPORT DATA\n\nNo Sales Totals or Comp Report breakdown is loaded for chat. No figure was invented.",
  };
}
