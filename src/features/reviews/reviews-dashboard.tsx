import { ReportBand } from "@/features/reports/report-frame";
import { Notice } from "@/components/ui/feedback";
import {
  SectionRule,
  ProvenanceChip,
  ProvenanceChips,
} from "@/components/ui/marquee";
import { Info } from "lucide-react";
import { NotConnected } from "./data-area";

import { DataArea } from "./data-area";
import type { ReviewsData } from "./load";
import {
  Figure,
  GoalTable,
  Leaderboard,
  LiveFilters,
  PeriodSegments,
  RankSegments,
  rangeLabel,
  RatingsPanel,
  ReviewsList,
  TrendPanel,
  goalStartDay,
  goalView,
  partialMonthText,
  totals,
} from "./reviews-data";
import { rating as fmtRating } from "@/features/admin/google-reviews/format";
import type { ReviewsIntegrationStatus } from "./integration-status";
import {
  DisabledChips,
  DisabledPill,
  DisabledSearch,
  DisabledSegments,
  FilterBar,
  Footnote,
  GoalTile,
  LegendItem,
  MeasureTile,
  Panel,
  RankingHead,
  TableShell,
  WindowTag,
} from "./reviews-parts";
import { ReviewsTabNav } from "./reviews-tab-nav";
import type { ReviewsTab } from "./reviews-tabs";

/**
 * ============================================================================
 * GOOGLE REVIEWS — THE GOAL DASHBOARD, WITH NOTHING CONNECTED
 * ============================================================================
 *
 * The sister app's Google Reviews goal-dashboard layout, UI only: header band,
 * three views, the goal tiles, the salon goal-progress table, the district table, the
 * leaderboard and the review lists.
 *
 * IT CARRIES NO REVIEW DATA OF ANY KIND — no counts, names, districts, ranks,
 * bars or charts. Every data area is a `DataArea`, which says "Not connected
 * yet" until `ReviewsIntegrationStatus` is "connected". See
 * `integration-status.ts` for how real data plugs in later.
 */
export function ReviewsDashboard({
  tab,
  status,
  data = null,
}: {
  tab: ReviewsTab;
  status: ReviewsIntegrationStatus;
  /** Imported Google reviews. Null: nothing imported yet, every data area says so. */
  data?: ReviewsData | null;
}) {
  return (
    <div
      className="min-w-0"
      data-testid="reviews-dashboard"
      data-integration-status={data ? "connected" : status}
    >
      <ReportBand
        title="Google Reviews"
        description="Qualifying reviews and the monthly goal across every salon you cover"
        provenance={
          <ProvenanceChips>
            <ProvenanceChip emphasis>
              {data
                ? `Google Reviews: ${data.stores.reduce((a, s) => a + s.reviewCount, 0)} reviews imported`
                : "Google Reviews: not connected yet"}
            </ProvenanceChip>
          </ProvenanceChips>
        }
      />

      <ReviewsTabNav current={tab} />

      <FilterBar>
        {data ? (
          <LiveFilters tab={tab} data={data} />
        ) : (
          <>
            <DisabledPill label="Location" value="All locations" />
            {tab !== "leaderboard" ? (
              <DisabledPill label="Rating" value="All ratings" />
            ) : null}
            {tab === "reviews" ? (
              <>
                <DisabledPill label="Response" value="All" />
                <DisabledSearch label="Name, comment or location" />
              </>
            ) : null}
            <DisabledPill label="" value="More filters" />
          </>
        )}
      </FilterBar>

      <div className="flex min-w-0 flex-col gap-5 px-5 py-5 pb-7 sm:px-6">
        {tab === "overview" ? (
          <OverviewView status={status} data={data} />
        ) : null}
        {tab === "reviews" ? <RecordsView status={status} data={data} /> : null}
        {tab === "leaderboard" ? (
          <LeaderboardView status={status} data={data} />
        ) : null}
      </div>
    </div>
  );
}

const SECTION_NOTE = "-mt-2 text-[11.5px] text-muted-foreground";

function OverviewView({
  status,
  data,
}: {
  status: ReviewsIntegrationStatus;
  data: ReviewsData | null;
}) {
  const live: ReviewsIntegrationStatus = data ? "connected" : status;
  const g = goalView(data);
  const goal: ReviewsIntegrationStatus = data
    ? g
      ? "connected"
      : "not_configured"
    : status;
  const t = data ? totals(data.stores) : null;
  const sm = g?.summary ?? null;
  const pm = partialMonthText(g);
  return (
    <>
      <SectionRule label="Monthly review goal" className="mt-1" />
      <p className={SECTION_NOTE}>
        Every salon&rsquo;s monthly target and progress toward it. Weekly
        figures cover the current week (Monday–Sunday, Central); monthly figures
        cover the month to date. Counts use Google&rsquo;s original review
        dates.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GoalTile
          status={goal}
          tag={
            <WindowTag window="week">
              This week
              {g
                ? ` · ${rangeLabel(g.context.weekStart, g.context.weekEnd)}`
                : ""}
            </WindowTag>
          }
          label="Qualifying reviews"
          detail={
            sm
              ? `3–5★ reviews counted this week; ${sm.qualifyingLastWeek} last week (${rangeLabel(g!.context.prevWeekStart, g!.context.prevWeekEnd)})`
              : "3–5★ reviews counted this week, compared with last week"
          }
        >
          {sm ? <Figure>{sm.qualifyingThisWeek}</Figure> : null}
        </GoalTile>
        <GoalTile
          status={goal}
          tag={
            <WindowTag window="month">
              Month to date
              {g
                ? ` · ${rangeLabel(g.context.monthStart, g.context.monthEnd)}`
                : ""}
            </WindowTag>
          }
          label="Qualifying reviews"
          detail={
            sm
              ? `Of a combined monthly target of ${sm.combinedTarget} across ${sm.counting} salons counting${pm ? " — partial month, see note below" : ""}`
              : "Against the combined monthly target of every salon counting"
          }
        >
          {sm ? <Figure>{sm.qualifyingMonthToDate}</Figure> : null}
        </GoalTile>
        <GoalTile
          status={goal}
          accent
          tag={
            <WindowTag window="month">
              Month to date
              {g
                ? ` · ${rangeLabel(g.context.monthStart, g.context.monthEnd)}`
                : ""}
            </WindowTag>
          }
          label="Salons at goal"
          detail="Salons that have reached their monthly target"
        >
          {sm ? (
            <Figure>
              {sm.atGoal} of {sm.counting}
            </Figure>
          ) : null}
        </GoalTile>
        <GoalTile
          status={goal}
          tag={
            <WindowTag window="month">
              Month to date
              {g
                ? ` · ${rangeLabel(g.context.monthStart, g.context.monthEnd)}`
                : ""}
            </WindowTag>
          }
          label="Reviews still needed"
          detail="To bring every salon to its target. One salon's overage doesn't cover another's shortfall."
        >
          {sm ? <Figure>{sm.stillNeeded}</Figure> : null}
        </GoalTile>
      </div>

      <Panel
        title="Salon goal progress"
        controls={
          <>
            <DisabledSearch label="Search salons" />
            <DisabledPill label="District" value="All districts" />
          </>
        }
      >
        {g ? (
          <GoalTable rows={g.rows} context={g.context} />
        ) : (
          <TableShell
            status={goal}
            label="Salon goal progress"
            columns={[
              { label: "Salon" },
              { label: "Store code", align: "right" },
              { label: "Qualifying · this week", align: "right" },
              { label: "Qualifying · month to date", align: "right" },
              { label: "Monthly target", align: "right" },
              { label: "Progress toward target" },
              { label: "Status" },
            ]}
          />
        )}
        <Footnote>
          Qualifying means a 3-, 4- or 5-star Google review counted after the
          salon&rsquo;s baseline. 1–2 star reviews and imported history never
          count.
          {pm ? ` ${pm}` : ""}
        </Footnote>
      </Panel>

      <Panel title="District goal progress">
        <NotConnected message="Districts not configured yet" />
      </Panel>

      <Panel
        title="Google Reviews over time"
        controls={
          <div className="ml-auto">
            {data ? (
              <PeriodSegments data={data} />
            ) : (
              <DisabledSegments
                label="Chart period"
                options={["Weekly", "Monthly"]}
              />
            )}
          </div>
        }
      >
        <DataArea status={live}>
          {data ? (
            <TrendPanel
              trend={data.trend}
              period={data.period}
              countingStart={goalStartDay(g)}
            />
          ) : null}
        </DataArea>
      </Panel>

      <SectionRule label="Everything Ask Bubbles holds" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MeasureTile
          status={live}
          label="All imported reviews"
          detail="Every Google review Ask Bubbles holds, counted and historical alike."
        >
          {t ? <Figure>{t.reviews}</Figure> : null}
        </MeasureTile>
        <MeasureTile
          status={data ? "connected" : status}
          label="Historical — not yet counted"
          detail="Imported at or before a salon's baseline (or with no baseline yet). Stored and searchable, in no goal total."
        >
          {data?.goals ? (
            <Figure>
              {goalView(data)?.summary.historical ??
                data.goals.rows.reduce((a, r) => a + r.historical, 0)}
            </Figure>
          ) : null}
        </MeasureTile>
        <MeasureTile
          status={live}
          label="Average rating"
          detail="Across every review held, counted and historical alike"
        >
          {t ? <Figure>{fmtRating(t.average)}</Figure> : null}
        </MeasureTile>
      </div>

      <Panel title="Reviews by rating">
        <DataArea status={live}>
          {data ? (
            <RatingsPanel stores={data.stores} store={data.query.store} />
          ) : null}
        </DataArea>
      </Panel>
    </>
  );
}

function LeaderboardView({
  status,
  data,
}: {
  status: ReviewsIntegrationStatus;
  data: ReviewsData | null;
}) {
  const g = goalView(data);
  const pm = partialMonthText(g);
  const goal: ReviewsIntegrationStatus = data
    ? g
      ? "connected"
      : "not_configured"
    : status;
  return (
    <>
      <SectionRule label="Salon leaderboard" className="mt-1" />
      <p className={SECTION_NOTE}>
        Ranked by qualifying reviews this month against each salon&rsquo;s goal;
        salons on the same count share a rank.
      </p>

      <Panel>
        <div className="px-4 py-4">
          <p className="eyebrow">Month to date</p>
          <DataArea status={goal} size="value" className="mt-2">
            {g ? (
              <p className="display-figure text-[26px] leading-tight text-foreground">
                {g.summary.qualifyingMonthToDate} of {g.summary.combinedTarget}
              </p>
            ) : null}
          </DataArea>
          <span
            aria-hidden
            className="mt-2.5 block h-2 rounded-[4px] bg-surface-muted"
          >
            {g ? (
              <span
                className="block h-2 rounded-[4px] bg-measure-data"
                style={{
                  width: `${Math.min(100, g.summary.combinedTarget > 0 ? (g.summary.qualifyingMonthToDate / g.summary.combinedTarget) * 100 : 0)}%`,
                }}
              />
            ) : null}
          </span>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-hairline px-4 py-3 text-[11.5px] text-muted-foreground">
          <LegendItem swatch="bg-measure-data">
            Month to date vs target
          </LegendItem>
          <LegendItem swatch="bg-status-outperforming">Goal met</LegendItem>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-0 border-l-2 border-dashed border-measure-goal"
            />
            Pace mark
          </li>
        </ul>
      </Panel>

      <Panel
        controls={
          <>
            {data && g ? (
              <RankSegments data={data} />
            ) : (
              <DisabledSegments
                label="Rank by"
                options={["Rank by month to date", "Rank by this week"]}
              />
            )}
            <DisabledPill label="District" value="All districts" />
            <DisabledSearch label="Find a salon, store code or district" />
            <div className="basis-full">
              <DisabledChips
                label="Filter by status"
                options={[
                  "All",
                  "Goal met",
                  "On pace",
                  "Behind pace",
                  "Not counting",
                ]}
              />
            </div>
          </>
        }
      >
        <RankingHead />
        <DataArea status={goal}>
          {g ? (
            <Leaderboard
              rows={g.rows}
              context={g.context}
              metric={data?.rank ?? "month"}
            />
          ) : null}
        </DataArea>
        <Footnote>
          Salons on the same count share a rank. Progress can pass the target:
          the bar stops at full width and the overage is shown separately. A
          salon without a review baseline isn&rsquo;t ranked.
          {pm ? ` ${pm}` : ""}
        </Footnote>
      </Panel>
    </>
  );
}

function RecordsView({
  status,
  data,
}: {
  status: ReviewsIntegrationStatus;
  data: ReviewsData | null;
}) {
  return (
    <>
      <SectionRule label="Google reviews" className="mt-1" />
      <p className={SECTION_NOTE}>
        The actual review records behind every number on this page.
      </p>

      <Panel title="Reviews">
        <DataArea status={data ? "connected" : status}>
          {data ? <ReviewsList data={data} /> : null}
        </DataArea>
      </Panel>

      {data ? null : (
        <Notice
          tone="neutral"
          icon={<Info />}
          title="Where this data comes from"
        >
          <p>
            Reviews will appear here once Google Reviews is connected for Buff
            City Soap. Until then no review records are held or shown.
          </p>
        </Notice>
      )}
    </>
  );
}
