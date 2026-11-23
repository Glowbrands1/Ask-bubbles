import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatBusinessTime } from "@/lib/business-date";

/**
 * HR APPROVAL ON THE FORMS REGISTER (FORMS_HR_APPROVAL_ENABLED). Server-rendered
 * from rows the page read for this reader only:
 *
 *   HrApprovalTabs  "All forms" and "Pending HR approval (N)", shown to HR only
 *   HrQueueList     HR's tab: waiting forms oldest first (overdue marked), then
 *                   the ones the manager replied to after HR sent them back
 *                   ("Manager replied to changes", owner 23 Nov 2026), then the
 *                   ones they sent back or rejected
 *   MyFormsWithHr   the manager's own forms that HR has not approved yet
 */

export interface HrQueueListRow {
  id: string;
  line: string;
  createdByName: string;
  state: "pending" | "changes_requested" | "rejected" | "approved";
  /** Whose turn it is (`hrStage`): `manager_replied` once the manager answered HR's send-back. */
  stage: HrStageWord;
  requestedAt: string | null;
  waiting: string;
  overdue: boolean;
}

type HrStageWord = "pending" | "manager_replied" | "changes_requested" | "rejected" | "approved";

export interface MyHrFormListRow {
  id: string;
  line: string;
  label: string;
  state: "pending" | "changes_requested" | "rejected" | "approved";
  stage?: HrStageWord;
}

const STAGE_WORDS: Record<HrStageWord, string> = {
  pending: "Waiting for you",
  manager_replied: "Manager replied to changes",
  changes_requested: "Sent back for changes",
  rejected: "Rejected",
  approved: "Approved",
};

/** HR's turn: pending, or the manager replied to HR's changes. */
const hrTurn = (stage: HrStageWord | undefined) => stage === "pending" || stage === "manager_replied";

function hrHref(id: string): string {
  return `/forms/hr-approval/${id}`;
}

export function HrApprovalTabs({ active, pending, overdue }: { active: "all" | "hr"; pending: number; overdue: number }) {
  const tab = (selected: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
      selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
    }`;
  return (
    <nav aria-label="Forms Register views" className="mb-4 flex flex-wrap gap-2">
      <Link href="/forms/monitoring" className={tab(active === "all")} aria-current={active === "all" ? "page" : undefined}>
        All forms
      </Link>
      <Link href="/forms/monitoring?view=hr" className={tab(active === "hr")} aria-current={active === "hr" ? "page" : undefined}>
        Pending HR approval ({pending})
        {overdue > 0 ? <span className="font-semibold text-status-attention">· {overdue} overdue</span> : null}
      </Link>
    </nav>
  );
}

export function HrQueueList({ rows }: { rows: HrQueueListRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No forms are waiting for your approval.</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border" data-testid="hr-queue">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={hrHref(row.id)} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-muted">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{row.line}</p>
              <p className="text-xs text-subtle-foreground">
                From {row.createdByName}
                {formatBusinessTime(row.requestedAt) ? ` · sent ${formatBusinessTime(row.requestedAt)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <Badge tone={hrTurn(row.stage) ? "accent" : "outline"} size="sm">
                {STAGE_WORDS[row.stage]}
              </Badge>
              {row.state === "pending" ? <span className="text-xs text-subtle-foreground">{row.waiting}</span> : null}
              {row.overdue ? (
                <Badge tone="attention" size="sm">
                  Overdue
                </Badge>
              ) : null}
            </div>
            <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MyFormsWithHr({ rows }: { rows: MyHrFormListRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Your forms with HR" className="mb-4" data-testid="my-forms-with-hr">
      <h2 className="mb-2 text-sm font-semibold text-foreground">Your forms with HR</h2>
      <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={hrHref(row.id)} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-muted">
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">{row.line}</p>
              <Badge tone={hrTurn(row.stage ?? row.state) ? "accent" : "outline"} size="sm">
                {row.label}
              </Badge>
              <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** HR's Overview card: how many forms wait for them and how many are overdue, linking to their tab. */
export function HrOverviewCard({ pending, overdue }: { pending: number; overdue: number }) {
  return (
    <Link
      href="/forms/monitoring?view=hr"
      data-testid="hr-overview-card"
      className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 hover:bg-surface-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          {pending === 0
            ? "No forms are waiting for your approval"
            : `${pending} form${pending === 1 ? " is" : "s are"} waiting for your approval`}
        </p>
        <p className="text-xs text-subtle-foreground">Pending HR approval, in the Forms Register</p>
      </div>
      {overdue > 0 ? (
        <Badge tone="attention" size="sm">
          {overdue} overdue
        </Badge>
      ) : null}
      <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
    </Link>
  );
}
