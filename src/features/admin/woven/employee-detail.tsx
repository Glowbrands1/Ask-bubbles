import Link from "next/link";
import { ArrowLeft, Database, UserX } from "lucide-react";

import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { PageShell, SectionHeader } from "@/components/ui/layout";
import type { EmployeeDetail } from "@/lib/employees/woven/view-types";
import {
  centralToday,
  changeLabel,
  employeeName,
  scheduledDeparture,
  terminationDatePassedWhileActive,
  wovenStatusName,
} from "@/lib/employees/woven/views";
import { ChangeTable } from "./change-feed";
import { Locations, MappingBadge, STATUS_TONE } from "./directory-table";
import { day, label, when } from "./format";
import type { WovenEmployeeProps } from "./load";
import { WovenHeader } from "./tabs";

/**
 * ONE EMPLOYEE — everything the directory holds about them, and what changed.
 *
 * Read-only. The same facts as their directory row, laid out to be read on a
 * phone, plus their own change history from the Change Feed (where a change
 * can still be marked reviewed — the one thing a person can do, and it changes
 * nobody's access).
 *
 * NAMES AND EMAILS APPEAR HERE: the page needs Manage integrations AND Manage
 * users, checked on the server before anything is read.
 */

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5">
      <dt className="text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">{term}</dt>
      <dd className="min-w-0 text-[13px] break-words text-foreground">{children}</dd>
    </div>
  );
}

const none = <span className="text-muted-foreground">—</span>;

export function EmployeeDetailView({
  detail,
  actionsDisabled,
  today = centralToday(),
}: {
  detail: EmployeeDetail;
  actionsDisabled: boolean;
  today?: string;
}) {
  const { row, changes, changesTruncated } = detail;
  const leaving = scheduledDeparture(row, today);
  const datePassed = terminationDatePassedWhileActive(row, today);
  const statusName = wovenStatusName(row);

  return (
    <article aria-labelledby="employee-name" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 id="employee-name" className="display text-[22px] tracking-[0.03em] text-foreground">
          {employeeName(row)}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[row.employmentStatus]} size="sm">
            <StatusDot />
            {row.employmentStatus}
          </Badge>
          <MappingBadge row={row} />
          {leaving ? (
            <Badge tone="processing" size="sm">
              Scheduled departure {day(row.terminationDate)}
            </Badge>
          ) : null}
          {row.hasAllLocationAccess ? (
            <Badge tone="outline" size="sm">
              all-location access
            </Badge>
          ) : null}
          <span className="font-mono text-[11.5px] text-muted-foreground">Woven ID {row.externalEmployeeId}</span>
        </div>
      </header>

      {leaving || datePassed ? (
        <Notice tone="neutral" title={leaving ? "A termination date is scheduled" : "Woven still says Active"}>
          {leaving
            ? `Woven states a termination date of ${day(row.terminationDate)} and still says Active.`
            : `Woven states a termination date of ${day(row.terminationDate)}, which has passed, and still says Active.`}{" "}
          Shown for information only: Ask Bubbles acts on Woven&rsquo;s Status, never on a date, and changes nobody&rsquo;s access.
        </Notice>
      ) : null}

      <section aria-label="Employment">
        <SectionHeader title="Employment" />
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field term="Work email">{row.emailAddress ?? <Badge tone="failed" size="sm">missing</Badge>}</Field>
          <Field term="Position">
            {row.positionName ?? none}
            {row.positionId ? <span className="block font-mono text-[11px] text-muted-foreground">{row.positionId}</span> : null}
          </Field>
          <Field term="Woven status">
            {row.employmentStatus}
            {statusName ? (
              <span className="block text-[11px] text-muted-foreground">
                Woven calls it {statusName}. Not treated as active: no account is created or changed from it.
              </span>
            ) : null}
          </Field>
          <Field term="Hire date">{day(row.hireDate)}</Field>
          <Field term="Termination date">{day(row.terminationDate)}</Field>
          <Field term="Last change">
            {row.lastChangeKind ? (
              <>
                {changeLabel(row.lastChangeKind, row.lastChangeClassification)}
                <span className="block text-[11px] text-muted-foreground">{when(row.lastChangeAt)}</span>
              </>
            ) : (
              none
            )}
          </Field>
          <Field term="Last seen in Woven">{when(row.lastSeenAt)}</Field>
          <Field term="Last synced">{when(row.lastSyncedAt)}</Field>
          <Field term="Missed syncs">
            {row.missingSyncCount > 0
              ? `${row.missingSyncCount} — not in Woven's reads, so this status is not currently observed`
              : "0"}
          </Field>
        </dl>
      </section>

      <section aria-label="Location assignments">
        <SectionHeader title="Location assignments" />
        <dl className="grid gap-2 sm:grid-cols-2">
          <Field term="Primary location">
            {row.primaryLocationCode ? `${row.primaryLocationCode} · ` : ""}
            {row.primaryLocationName ?? row.primaryLocationId ?? "—"}
            {row.primaryLocationMappingStatus ? (
              <span className="block text-[11px] text-muted-foreground">mapping: {row.primaryLocationMappingStatus}</span>
            ) : null}
          </Field>
          <Field term="Active locations">{row.activeLocationCount}</Field>
          <Field term="Additional locations">
            <Locations list={row.additionalLocations} />
          </Field>
          <Field term="Temporary or expiring access">
            <Locations list={row.temporaryOrExpiringLocations} expiring />
          </Field>
          <Field term="All-location access">
            {row.hasAllLocationAccess === null ? "Not stated by Woven" : row.hasAllLocationAccess ? "Yes" : "No"}
          </Field>
          <Field term="Multiple-location access">
            {row.hasMultipleLocationAccess === null ? "Not stated by Woven" : row.hasMultipleLocationAccess ? "Yes" : "No"}
          </Field>
        </dl>
      </section>

      <section aria-label="Data issues">
        <SectionHeader title="Data issues" />
        {row.dataIssues.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">None recorded on the last sync.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label="Issue codes">
            {row.dataIssues.map((code) => (
              <li key={code}>
                <Badge tone="attention" size="sm" title={code}>
                  {label(code)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Change history" className="flex flex-col gap-3">
        <SectionHeader title="Change history" />
        {changes.length === 0 ? (
          <EmptyState title="No changes recorded" description="Changes appear after the second successful sync; the first records everyone as an initial load." />
        ) : (
          <>
            <ChangeTable rows={changes} actionsDisabled={actionsDisabled} showEmployee={false} />
            <p className="text-[12px] text-muted-foreground">
              {changesTruncated
                ? `The ${changes.length} most recent changes. Older ones are in the Change Feed.`
                : `${changes.length} change${changes.length === 1 ? "" : "s"}, newest first.`}
            </p>
          </>
        )}
      </section>
    </article>
  );
}

export function WovenEmployeeScreen({ props }: { props: WovenEmployeeProps }) {
  const actionsDisabled = props.sampleLabel !== null || !props.liveMode;
  const { content } = props;

  return (
    <PageShell>
      <WovenHeader current="directory" sampleLabel={props.sampleLabel} />
      <Link
        href="/admin/integrations/woven/directory"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Employee Directory
      </Link>
      {content.state === "ready" ? (
        <EmployeeDetailView detail={content.detail} actionsDisabled={actionsDisabled} />
      ) : content.state === "not_found" ? (
        <EmptyState
          icon={<UserX />}
          title="No employee with that id"
          description="The link may be out of date. Every employee Woven has sent is in the Employee Directory."
        />
      ) : content.state === "missing" ? (
        <EmptyState
          icon={<Database />}
          title="The Woven directory has not been created yet"
          description="The migration is prepared and is applied only with approval. Until then there is nothing to show here."
        />
      ) : content.state === "unavailable" ? (
        <EmptyState
          icon={<Database />}
          title="The Woven directory could not be read"
          description={`The database did not answer${content.code ? ` (${content.code})` : ""}. This is not the same as the directory being missing.`}
        />
      ) : (
        <EmptyState icon={<Database />} title="Supabase is not configured for this deployment" description="The Woven directory lives in Supabase." />
      )}
    </PageShell>
  );
}
