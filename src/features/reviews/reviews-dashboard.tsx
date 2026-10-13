import { ReportBand } from "@/features/reports/report-frame";
import { Notice } from "@/components/ui/feedback";
import {
  SectionRule,
  ProvenanceChip,
  ProvenanceChips,
} from "@/components/ui/marquee";
import { Info } from "lucide-react";

import { DataArea } from "./data-area";
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
}: {
  tab: ReviewsTab;
  status: ReviewsIntegrationStatus;
}) {
  return (
    <div
      className="min-w-0"
      data-testid="reviews-dashboard"
      data-integration-status={status}
    >
      <ReportBand
        title="Google Reviews"
        description="Qualifying reviews and the monthly goal across every salon you cover"
        provenance={
          <ProvenanceChips>
            <ProvenanceChip emphasis>
              Google Reviews: not connected yet
            </ProvenanceChip>
          </ProvenanceChips>
        }
      />

      <ReviewsTabNav current={tab} />

      <FilterBar>
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
      </FilterBar>

      <div className="flex min-w-0 flex-col gap-5 px-5 py-5 pb-7 sm:px-6">
        {tab === "overview" ? <OverviewView status={status} /> : null}
        {tab === "reviews" ? <RecordsView status={status} /> : null}
        {tab === "leaderboard" ? <LeaderboardView status={status} /> : null}
      </div>
    </div>
  );
}

const SECTION_NOTE = "-mt-2 text-[11.5px] text-muted-foreground";

function OverviewView({ status }: { status: ReviewsIntegrationStatus }) {
  return (
    <>
      <SectionRule label="Monthly review goal" className="mt-1" />
      <p className={SECTION_NOTE}>
        Every salon&rsquo;s monthly target and progress toward it will appear
        here. Weekly figures cover the current reporting week; monthly figures
        cover the month to date.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GoalTile
          status={status}
          tag={<WindowTag window="week">This week</WindowTag>}
          label="Qualifying reviews"
          detail="3–5★ reviews counted this week, compared with last week"
        />
        <GoalTile
          status={status}
          tag={<WindowTag window="month">Month to date</WindowTag>}
          label="Qualifying reviews"
          detail="Against the combined monthly target of every salon counting"
        />
        <GoalTile
          status={status}
          accent
          tag={<WindowTag window="month">Month to date</WindowTag>}
          label="Salons at goal"
          detail="Salons that have reached their monthly target"
        />
        <GoalTile
          status={status}
          tag={<WindowTag window="month">Month to date</WindowTag>}
          label="Reviews still needed"
          detail="To bring every salon to its target. One salon's overage doesn't cover another's shortfall."
        />
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
        <TableShell
          status={status}
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
        <Footnote>
          Qualifying means a 3-, 4- or 5-star Google review counted after the
          salon&rsquo;s baseline. 1–2 star reviews and imported history never
          count.
        </Footnote>
      </Panel>

      <Panel title="District goal progress">
        <TableShell
          status={status}
          label="District goal progress"
          columns={[
            { label: "District" },
            { label: "Salons", align: "right" },
            { label: "Qualifying · this week", align: "right" },
            { label: "Qualifying · month to date", align: "right" },
            { label: "Progress toward target" },
          ]}
        />
      </Panel>

      <Panel
        title="Google Reviews over time"
        controls={
          <div className="ml-auto">
            <DisabledSegments
              label="Chart period"
              options={["Weekly", "Monthly"]}
            />
          </div>
        }
      >
        <DataArea status={status} />
      </Panel>

      <SectionRule label="Everything Ask Bubbles holds" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MeasureTile
          status={status}
          label="All imported reviews"
          detail="Every Google review Ask Bubbles holds, counted and historical alike."
        />
        <MeasureTile
          status={status}
          label="Historical — not yet counted"
          detail="Imported before a salon had a baseline. Stored and searchable, in no weekly total."
        />
        <MeasureTile
          status={status}
          label="Average rating"
          detail="Across every review held, counted and historical alike"
        />
      </div>

      <Panel title="Reviews by rating">
        <DataArea status={status} />
      </Panel>
    </>
  );
}

function LeaderboardView({ status }: { status: ReviewsIntegrationStatus }) {
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
          <DataArea status={status} size="value" className="mt-2" />
          <span
            aria-hidden
            className="mt-2.5 block h-2 rounded-[4px] bg-surface-muted"
          />
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
            <DisabledSegments
              label="Rank by"
              options={["Rank by month to date", "Rank by this week"]}
            />
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
        <DataArea status={status} />
        <Footnote>
          Salons on the same count share a rank. Progress can pass the target:
          the bar stops at full width and the overage is shown separately. A
          salon without a review baseline isn&rsquo;t ranked.
        </Footnote>
      </Panel>
    </>
  );
}

function RecordsView({ status }: { status: ReviewsIntegrationStatus }) {
  return (
    <>
      <SectionRule label="Google reviews" className="mt-1" />
      <p className={SECTION_NOTE}>
        The actual review records behind every number on this page.
      </p>

      <Panel title="Reviews">
        <DataArea status={status} />
      </Panel>

      <Notice tone="neutral" icon={<Info />} title="Where this data comes from">
        <p>
          Reviews will appear here once Google Reviews is connected for Buff
          City Soap. Until then no review records are held or shown.
        </p>
      </Notice>
    </>
  );
}
