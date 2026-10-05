"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageShell } from "@/components/ui/layout";
import { AlarmBar, BareList, BareRow, CountTiles, SectionRule } from "@/components/ui/marquee";
import { ACTIVE_BRAND } from "@/lib/brand";
import type { AttentionSummary } from "@/lib/forms/follow-up";
import { relativeBusinessDay } from "@/lib/forms/follow-up";
import { useSession } from "@/lib/session/session-context";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import { formatNumber, pluralize } from "@/lib/utils/format";

import { AskBand } from "./ask-band";
import { OverviewStrip } from "./overview-strip";

/**
 * ============================================================================
 * HOME
 * ============================================================================
 *
 * The ask band across the top, then what needs a person today (follow-ups,
 * counted on the server from persisted form instances and scoped to the
 * viewer's assignment), then reference links.
 *
 * NOTHING HERE IS INVENTED. There is no performance block, because no Buff City
 * Soap report is connected; when one is, its summary belongs here as a server
 * component handed in like the follow-ups are.
 */
export interface OverviewFollowUp {
  id: string;
  employeeName: string;
  templateName: string;
  locationName: string | null;
  followUpDate: string;
  overdue: boolean;
}

export interface OverviewFollowUps {
  attention: AttentionSummary;
  items: OverviewFollowUp[];
  today: string;
  failure: string | null;
  excluded: number;
  scopeLabel: string | null;
}

export function OverviewScreen({ followUps: followUpData }: { followUps: OverviewFollowUps }) {
  const { can } = useSession();
  const { documents } = useAppStore();
  const { attention, items: followUps, today: businessDay } = followUpData;
  const laterCount = Math.max(0, followUps.length - attention.needsAttention);
  const [askActive, setAskActive] = useState(false);
  const plural = ACTIVE_BRAND.vocabulary.locationNounPlural;

  const alarmDetail = [
    attention.overdue > 0 ? `${attention.overdue} overdue` : null,
    attention.dueThisWeek > 0 ? `${attention.dueThisWeek} due this week` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const latestDocuments = useMemo(
    () =>
      [...documents]
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 4),
    [documents],
  );

  const showForms = can("view_form_monitoring");

  return (
    <>
      <AskBand onActiveChange={setAskActive} />

      {askActive ? (
        <OverviewStrip
          figures={null}
          alert={
            showForms && attention.needsAttention > 0
              ? `${attention.needsAttention} ${pluralize(attention.needsAttention, "follow-up")} ${attention.needsAttention === 1 ? "needs" : "need"} attention`
              : undefined
          }
          onExpand={() => setAskActive(false)}
        />
      ) : null}

      <PageShell className={cn(askActive && "hidden")}>
        {showForms ? (
          <>
            <SectionRule label="Follow-ups" className="mb-4" />

            {attention.needsAttention > 0 ? (
              <AlarmBar
                className="mb-5"
                title={`${attention.needsAttention} ${pluralize(attention.needsAttention, "follow-up")} ${attention.needsAttention === 1 ? "needs" : "need"} attention`}
                detail={alarmDetail}
                action={{ label: "Open the forms register", href: "/forms/monitoring" }}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.45fr_1fr]">
              <Card>
                <CardHeader className="flex items-start justify-between gap-3">
                  <div>
                    <span className="flex items-center gap-2.5">
                      <CardTitle>Follow-ups</CardTitle>
                      {!followUpData.failure && followUps.length > 0 ? (
                        <span className="rounded-[4px] bg-brand-accent px-2 py-[3px] text-[8.5px] font-black tracking-[0.08em] text-brand-accent-foreground uppercase">
                          {formatNumber(followUps.length)} open
                        </span>
                      ) : null}
                    </span>
                    <p
                      className={cn(
                        "mt-1 text-[13px]",
                        attention.needsAttention > 0
                          ? "font-medium text-followup-attention-soft-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {followUpData.failure
                        ? "Follow-ups could not be read"
                        : attention.needsAttention > 0
                          ? "Soonest first"
                          : "Nothing needs attention today"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-[var(--radius-sm)]",
                      attention.needsAttention > 0
                        ? "bg-followup-attention-soft text-followup-attention-soft-foreground"
                        : "bg-surface-muted text-muted-foreground",
                    )}
                  >
                    <FileClock className="size-4" aria-hidden />
                  </span>
                </CardHeader>
                <CardContent className="pt-0">
                  {followUps.length === 0 ? (
                    <p className="rounded-[var(--radius-sm)] border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
                      {followUpData.failure
                        ? "The forms record could not be reached."
                        : "No follow-ups are being tracked."}
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {followUps.slice(0, 3).map((entry) => (
                        <li key={entry.id}>
                          <Link
                            href={`/forms/monitoring?followup=${entry.overdue ? "overdue" : "open"}`}
                            className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2.5 transition-colors hover:bg-surface-muted"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-foreground">
                                {entry.employeeName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.templateName}
                                {entry.locationName ? ` · ${entry.locationName}` : ""}
                              </span>
                            </span>
                            <Badge tone={entry.overdue ? "followupStrong" : "neutral"} size="sm">
                              {relativeBusinessDay(entry.followUpDate, businessDay)}
                            </Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button asChild variant="ghost" size="sm" className="mt-3 w-full">
                    <Link href="/forms/monitoring">
                      View all follow-ups
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Forms awaiting follow-up</CardTitle>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {followUpData.scopeLabel
                      ? `Across ${followUpData.scopeLabel}`
                      : `Across every ${ACTIVE_BRAND.vocabulary.locationNoun} you cover`}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  <CountTiles
                    tiles={[
                      {
                        label: "Overdue",
                        value: formatNumber(attention.overdue),
                        tone: attention.overdue > 0 ? "overdue" : "open",
                      },
                      {
                        label: "Due this week",
                        value: formatNumber(attention.dueThisWeek),
                        tone: attention.dueThisWeek > 0 ? "soon" : "open",
                      },
                      { label: "Due later", value: formatNumber(laterCount), tone: "open" },
                    ]}
                  />
                  {followUpData.excluded > 0 ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {formatNumber(followUpData.excluded)}{" "}
                      {followUpData.excluded === 1 ? "record is" : "records are"} filed against a{" "}
                      {ACTIVE_BRAND.vocabulary.locationNoun} that is not on the roster, or excluded by this
                      deployment&rsquo;s configuration, so not counted here. They are still in the forms
                      register.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        <SectionRule label="Reference" className={cn(showForms ? "mt-9" : "", "mb-4")} />
        <div className="grid grid-cols-1 gap-x-6 gap-y-7 lg:grid-cols-2">
          <BareList
            label="Latest knowledge updates"
            action={can("manage_knowledge") ? { label: "Open knowledge base", href: "/knowledge" } : undefined}
          >
            {latestDocuments.length === 0 ? (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                No documents have been added yet. Answers become grounded in company knowledge as
                documents are uploaded.
              </p>
            ) : (
              latestDocuments.map((document) => (
                <BareRow
                  key={document.id}
                  href={`/knowledge/document/${encodeURIComponent(document.id)}`}
                  meta={formatDate(document.uploadedAt)}
                >
                  {document.title}
                </BareRow>
              ))
            )}
          </BareList>

          <BareList label="Get started">
            <BareRow href="/chat">Ask {ACTIVE_BRAND.assistantName} a question</BareRow>
            <BareRow href="/history">Pick up an earlier conversation</BareRow>
            {can("view_reports") ? (
              <BareRow href="/reports">Open reports for your {plural}</BareRow>
            ) : null}
          </BareList>
        </div>
      </PageShell>
    </>
  );
}
