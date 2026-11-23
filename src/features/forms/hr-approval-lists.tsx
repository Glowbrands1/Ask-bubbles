import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatBusinessTime } from "@/lib/business-date";

/**
 * HR APPROVAL ON THE FORMS REGISTER (FORMS_HR_APPROVAL_ENABLED). Server-rendered
 * from rows the page read for this reader only:
 *
 *   HrApprovalTabs  "All forms" and "Pending HR approval (N)", shown to HR only
 *   HrQueueList     HR's tab, as the sibling app's (#1288): "Needs your decision
 *                   (N)" (waiting forms oldest first, overdue marked, then the
 *                   ones the manager replied to after HR sent them back:
 *                   "Manager replied to changes", owner 23 Nov 2026), exactly
 *                   the rows N counts; then "Waiting on the manager" (sent back
 *                   with no reply, and rejected)
 *   MyFormsWithHr   the manager's own forms that HR has not approved yet
 */

export interface HrQueueListRow {
  id: string;
  line: string;
  createdByName: string;
  state: "pending" | "changes_requested" | "rejected" | "approved";
  requestedAt: string | null;
  waiting: string;
  overdue: boolean;
  /** Sent back, and the manager replied since: needs HR's decision (`needsHrDecision` on the server). */
  managerReplied?: boolean;
}

type HrStageWord = "pending" | "manager_replied" | "changes_requested" | "rejected" | "approved";

/** Whether this row needs HR's decision now: what the tab's number and "Needs your decision (N)" count. */
function needsDecision(row: HrQueueListRow): boolean {
  return row.state === "pending" || row.managerReplied === true;
}

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

/**
 * The Forms Register's views. The owner (23 Nov 2026): "its so small pending approval, make it red button and animated
 * shaking if theres a pending". "Pending HR approval (N)" is a real button; with N > 0 it is red and shakes briefly every
 * few seconds (`hr-pending-shake`, off under prefers-reduced-motion); with N = 0 it is the normal style. Shown to HR only,
 * as before. "Sunny approvals ↗" (owner, 23 Nov 2026) opens the sibling app's Pending HR approval view: a plain link for
 * people who already get the app switcher, no data from the other app and no count.
 */
export function HrApprovalTabs({
  active,
  pending,
  overdue,
  showPending = true,
  sunnyHref = null,
}: {
  active: "all" | "hr";
  pending: number;
  overdue: number;
  /** HR approvers only (the page passes false for anybody else). */
  showPending?: boolean;
  /** The sibling app's Pending HR approval view, for app-switcher users only; null hides the tab. */
  sunnyHref?: string | null;
}) {
  const tab = (selected: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium ${
      selected ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"
    }`;
  const waiting = pending > 0;
  const pendingClass = waiting
    ? `hr-pending-shake inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-status-failed bg-status-failed px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 ${
        active === "hr" ? "ring-2 ring-status-failed ring-offset-2" : ""
      }`
    : tab(active === "hr");
  return (
    <nav aria-label="Forms Register views" className="mb-4 flex flex-wrap items-center gap-2">
      <Link href="/forms/monitoring" className={tab(active === "all")} aria-current={active === "all" ? "page" : undefined}>
        All forms
      </Link>
      {showPending ? (
        <Link
          href="/forms/monitoring?view=hr"
          className={pendingClass}
          aria-current={active === "hr" ? "page" : undefined}
          data-testid="hr-pending-tab"
          data-waiting={waiting ? "true" : "false"}
        >
          Pending HR approval ({pending})
          {overdue > 0 ? <span className={waiting ? "font-semibold" : "font-semibold text-status-attention"}>· {overdue} overdue</span> : null}
        </Link>
      ) : null}
      {sunnyHref ? (
        <a href={sunnyHref} target="_blank" rel="noopener noreferrer" className={tab(false)} data-testid="sunny-approvals-tab">
          Sunny approvals ↗
        </a>
      ) : null}
    </nav>
  );
}

export function HrQueueList({ rows }: { rows: HrQueueListRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No forms are waiting for your approval.</p>;
  }
  const decide = rows.filter(needsDecision);
  const onManager = rows.filter((row) => !needsDecision(row));
  return (
    <div className="space-y-4">
      <section aria-label="Needs your decision" data-testid="hr-queue-decide">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Needs your decision ({decide.length})</h2>
        {decide.length === 0 ? (
          <p className="text-sm text-muted-foreground">No forms are waiting for your approval.</p>
        ) : (
          <QueueRows rows={decide} testId="hr-queue" />
        )}
      </section>
      {onManager.length > 0 ? (
        <section aria-label="Waiting on the manager" data-testid="hr-queue-on-manager">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Waiting on the manager ({onManager.length})</h2>
          <QueueRows rows={onManager} testId="hr-queue-sent-back" />
        </section>
      ) : null}
    </div>
  );
}

function QueueRows({ rows, testId }: { rows: HrQueueListRow[]; testId: string }) {
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border" data-testid={testId}>
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
              <Badge tone={needsDecision(row) ? "accent" : "outline"} size="sm">
                {STAGE_WORDS[row.managerReplied ? "manager_replied" : row.state]}
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
