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
  GoalTile,
  MeasureTile,
  Panel,
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
 * four views, the goal tiles, the salon goal-progress table, the district table, the
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

      <div className="flex min-w-0 flex-col gap-5 px-5 py-5 pb-7 sm:px-6">
        {tab === "overview" ? <OverviewView status={status} /> : null}
        {tab === "leaderboard" ? <LeaderboardView status={status} /> : null}
        {tab === "reviews" ? <RecordsView status={status} /> : null}
        {tab === "needs" ? <NeedsResponseView status={status} /> : null}
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

      <Panel title="Google Reviews over time">
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
        Salons ranked by qualifying reviews this month against their goal;
        salons on the same count share a rank.
      </p>

      <Panel title="Goal progress this month">
        <DataArea status={status} />
      </Panel>

      <Panel
        title="Ranking"
        controls={
          <>
            <DisabledSegments
              label="Rank by"
              options={["Rank by month to date", "Rank by this week"]}
            />
            <DisabledPill label="District" value="All districts" />
            <DisabledSearch label="Search salons" />
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
        <DataArea status={status} />
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

      <Panel
        title="Filters"
        controls={
          <>
            <DisabledPill label="Location" value="All locations" />
            <DisabledPill label="Rating" value="All ratings" />
            <DisabledPill label="Status" value="All" />
            <DisabledSearch label="Search reviews" />
          </>
        }
      >
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

function NeedsResponseView({ status }: { status: ReviewsIntegrationStatus }) {
  return (
    <>
      <SectionRule label="Needs a response" className="mt-1" />
      <p className={SECTION_NOTE}>
        Reviews waiting for a reply, unanswered first, then the lowest rating,
        then the longest waiting.
      </p>

      <Panel
        title="Response queue"
        controls={
          <>
            <DisabledPill label="Location" value="All locations" />
            <DisabledPill label="Rating" value="All ratings" />
          </>
        }
      >
        <DataArea status={status} />
      </Panel>
    </>
  );
}
