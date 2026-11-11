import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/ui/layout";
import { StatColumn, StatPanel } from "@/components/ui/marquee";
import { DemoContentNotice } from "@/components/demo-content-notice";
import { ACTIVE_BRAND } from "@/lib/brand";

/**
 * ============================================================================
 * AI USAGE — INVENTED FIGURES, FOR DEMO BUILDS ONLY
 * ============================================================================
 *
 * Live has no usage source, so it shows an honest not-connected state (see
 * `ai-usage-screen.tsx`). A demo build shows what the screen is for, under the
 * same "seeded content" notice every demo screen carries. No figure here is
 * read from anywhere.
 */

const MONTHLY_BUDGET = 1000;
const WEEKS = [
  { label: "Oct 12", spend: 118.4, requests: 4_030 },
  { label: "Oct 19", spend: 127.95, requests: 4_350 },
  { label: "Oct 26", spend: 134.1, requests: 4_560 },
  { label: "Nov 2", spend: 146.83, requests: 4_990 },
  { label: "Nov 9", spend: 41.12, requests: 1_397 },
];
const MONTH_TO_DATE = { spend: 214.62, requests: 7_284, priorSpend: 188.4, priorRequests: 6_422 };
const BY_FEATURE = [
  { label: `${ACTIVE_BRAND.assistantName} answers (policy, coaching, store questions)`, share: 0.58, requests: 5_102 },
  { label: "Form drafting (Corrective Action, Coaching, EPPs)", share: 0.24, requests: 1_163 },
  { label: "Report reading and analysis", share: 0.11, requests: 584 },
  { label: "Knowledge base indexing", share: 0.05, requests: 361 },
  { label: "Form template extraction", share: 0.02, requests: 74 },
];

const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD" });

function change(current: number, previous: number): string {
  const percent = ((current - previous) / previous) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(0)}% vs same point last month`;
}

export function AIUsageDemoScreen() {
  const remaining = MONTHLY_BUDGET - MONTH_TO_DATE.spend;
  const peak = Math.max(...WEEKS.map((week) => week.spend));
  return (
    <PageShell className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="AI Usage"
        description="What the assistant costs to run, and how much credit is left."
      />
      <DemoContentNotice screen="AI Usage" contents="spend, request and credit figure" />

      <StatPanel>
        <StatColumn
          label="Spend this month"
          value={money(MONTH_TO_DATE.spend)}
          delta={change(MONTH_TO_DATE.spend, MONTH_TO_DATE.priorSpend)}
          period="November, month to date"
        />
        <StatColumn
          label="Requests"
          value={MONTH_TO_DATE.requests.toLocaleString("en-US")}
          delta={change(MONTH_TO_DATE.requests, MONTH_TO_DATE.priorRequests)}
          period="November, month to date"
        />
        <StatColumn
          label="Credit remaining"
          value={money(remaining)}
          period={`of a ${money(MONTHLY_BUDGET)} monthly budget`}
        />
        <StatColumn
          label="Average per request"
          value={`${((MONTH_TO_DATE.spend / MONTH_TO_DATE.requests) * 100).toFixed(1)}¢`}
          period="November, month to date"
        />
      </StatPanel>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly spend</CardTitle>
            <CardDescription>The last five weeks. The current week is in progress.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {WEEKS.map((week) => (
                <li key={week.label} className="grid grid-cols-[4.5rem_1fr_7rem] items-center gap-3 text-[13px]">
                  <span className="text-muted-foreground">{week.label}</span>
                  <span className="h-3 rounded-sm bg-muted" aria-hidden>
                    <span
                      className="block h-3 rounded-sm bg-brand-accent"
                      style={{ width: `${(week.spend / peak) * 100}%` }}
                    />
                  </span>
                  <span className="text-right tabular-nums text-foreground">
                    {money(week.spend)} · {week.requests.toLocaleString("en-US")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where it goes</CardTitle>
            <CardDescription>Share of this month&apos;s spend, by what the assistant was doing.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {BY_FEATURE.map((row) => (
                <li key={row.label} className="space-y-1 text-[13px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-foreground">{row.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {money(MONTH_TO_DATE.spend * row.share)}
                    </span>
                  </div>
                  <div className="h-2 rounded-sm bg-muted" aria-hidden>
                    <div className="h-2 rounded-sm bg-primary" style={{ width: `${row.share * 100}%` }} />
                  </div>
                  <p className="text-[11.5px] text-subtle-foreground">
                    {row.requests.toLocaleString("en-US")} requests
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
