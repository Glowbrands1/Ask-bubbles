import { ReportBand } from "@/features/reports/report-frame";
import { Notice } from "@/components/ui/feedback";
import {
  SectionRule,
  ProvenanceChip,
  ProvenanceChips,
} from "@/components/ui/marquee";
import {
  CalendarDays,
  CalendarRange,
  Info,
  ListChecks,
  Target,
} from "lucide-react";
import { NotConnected } from "./data-area";

import { DataArea } from "./data-area";
import type { ReviewsData } from "./load";
import {
  Figure,
  GoalSearch,
  GoalTable,
  Leaderboard,
  LiveFilters,
  monthName,
  matchesGoalFilter,
  PeriodSegments,
  RankSegments,
  rangeLabel,
  RatingsPanel,
  ReviewsList,
  StatusChips,
  TONE_STYLE,
  TrendPanel,
  goalStartSpan,
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
          icon={<CalendarDays />}
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
          icon={<CalendarRange />}
          bar={
            sm
              ? sm.combinedTarget > 0
                ? (sm.qualifyingMonthToDate / sm.combinedTarget) * 100
                : 0
              : null
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
          icon={<Target />}
          bar={
            sm ? (sm.counting > 0 ? (sm.atGoal / sm.counting) * 100 : 0) : null
          }
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
          tone="pace"
          icon={<ListChecks />}
          label="Reviews still needed"
          detail="To bring every salon to its target. One salon's overage doesn't cover another's shortfall."
        >
          {sm ? <Figure>{sm.stillNeeded}</Figure> : null}
        </GoalTile>
      </div>

      <Panel
        title="Salon goal progress"
        controls={
          data && g ? (
            <div className="ml-auto">
              <GoalSearch
                data={data}
                tab="overview"
                placeholder="Find a salon or store code"
              />
            </div>
          ) : (
            <DisabledSearch label="Search salons" />
          )
        }
      >
        {g ? (
          <GoalTable
            rows={g.rows.filter((r) =>
              matchesGoalFilter(r, g.context, {
                q: data?.goalFilter?.q ?? "",
                status: null,
              }),
            )}
            context={g.context}
          />
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
              countingStart={goalStartSpan(g)}
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
  // The partial-month caveat describes the live month's baselines; a closed month carries its own note.
  const pm = g?.context.closed ? null : partialMonthText(g);
  const goal: ReviewsIntegrationStatus = data
    ? g
      ? "connected"
      : "not_configured"
    : status;
  const closed = g?.context.closed === true;
  const daysLeft = g
    ? g.context.daysInMonth - Number(g.context.today.slice(8, 10))
    : 0;
  const atGoalPercent =
    g && g.summary.counting > 0
      ? (g.summary.atGoal / g.summary.counting) * 100
      : 0;
  return (
    <>
      <SectionRule label="Salon leaderboard" className="mt-1" />
      <p className={SECTION_NOTE}>
        Ranked by qualifying reviews this month against each salon&rsquo;s goal;
        salons on the same count share a rank.
      </p>

      <Panel>
        <div className="px-5 py-4">
          <p className="eyebrow">
            {g
              ? closed
                ? `${monthName(g.context.monthStart.slice(0, 7))} · month closed`
                : `${monthLabel(g.context.monthStart)} · day ${g.context.daysElapsed + 1} of ${g.context.daysInMonth}`
              : "Month to date"}
          </p>
          <DataArea status={goal} size="value" className="mt-2">
            {g ? (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-foreground">
                <span className="display-figure text-[30px] leading-tight">
                  {g.summary.atGoal} of {g.summary.counting}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  salons {closed ? "reached" : "have reached"} their target ·{" "}
                  {closed
                    ? "final result"
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}{" "}
                  · {g.summary.qualifyingMonthToDate} of{" "}
                  {g.summary.combinedTarget} qualifying reviews
                </span>
              </p>
            ) : null}
          </DataArea>
          <span
            aria-hidden
            className="mt-3 block h-3 rounded-full bg-tone-met-soft"
          >
            {g ? (
              <span
                className="block h-3 rounded-full bg-tone-met transition-[width] duration-500"
                style={{ width: `${atGoalPercent}%` }}
              />
            ) : null}
          </span>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border-hairline bg-surface-muted/40 px-5 py-3 text-[11.5px] text-muted-foreground">
          <LegendItem swatch={TONE_STYLE.met.swatch}>Goal met</LegendItem>
          <LegendItem swatch={TONE_STYLE.pace.swatch}>On pace</LegendItem>
          <LegendItem swatch={TONE_STYLE.behind.swatch}>Behind pace</LegendItem>
          <LegendItem swatch={TONE_STYLE.idle.swatch}>
            No verdict (partial month / not tracking)
          </LegendItem>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-3 w-0 border-l-2 border-dashed border-measure-benchmark/70"
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
            {data && g ? (
              <GoalSearch
                data={data}
                tab="leaderboard"
                placeholder="Find a salon or store code"
              />
            ) : (
              <DisabledSearch label="Find a salon or store code" />
            )}
            <div className="basis-full">
              {data && g ? (
                <StatusChips data={data} rows={g.rows} context={g.context} />
              ) : (
                <DisabledChips
                  label="Filter by status"
                  options={[
                    "All",
                    "Goal met",
                    "On pace",
                    "Behind pace",
                    "No verdict",
                  ]}
                />
              )}
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
              filter={data?.goalFilter}
            />
          ) : null}
        </DataArea>
        <Footnote>
          Salons on the same count share a rank. Progress can pass the target:
          the bar stops at full width and the overage is shown separately. A
          salon without a review baseline isn&rsquo;t ranked and shows gray
          &ldquo;Not tracking&rdquo;, not zero.
          {closed
            ? " This month has ended, so each salon shows its final count with the same rules as the live month; weekly figures only exist for the current month. A month that closed before a salon's counting began shows gray “Not counted”."
            : ""}
          {pm ? ` ${pm}` : ""}
        </Footnote>
      </Panel>
    </>
  );
}

const MONTH_NAME = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});
function monthLabel(monthStart: string): string {
  return MONTH_NAME.format(new Date(`${monthStart}T00:00:00Z`));
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
