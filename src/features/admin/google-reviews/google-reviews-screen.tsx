import Link from "next/link";
import { AlertTriangle, CheckCircle2, MessageSquareReply, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/feedback";
import { PageHeader, PageShell, ScrollTable, SectionHeader } from "@/components/ui/layout";
import type { ReviewPage, ReviewQuery, RunRow, StoreSummary } from "@/lib/google-reviews/views";

import { GoogleReviewsActions, StoreLinkAction } from "./actions";
import { MATCH_HELP, MATCH_LABEL, MATCH_TONE, OAUTH_ERROR_TEXT, REASON_TEXT, SYNC_ERROR_TEXT, blockerText } from "./copy";
import { rating, reviewDate, stamp } from "./format";
import type { GoogleReviewsPageProps } from "./load";

/**
 * THE GOOGLE REVIEWS SCREEN — administrators only (the page guards it).
 *
 * Read-only toward Google: it shows Buff City Soap's seven approved stores and
 * their reviews; it cannot reply to, edit or delete a review. Every figure is
 * measured from the database; nothing on the screen is sample data.
 */

export function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={`size-3.5 ${n <= value ? "fill-status-attention text-status-attention" : "text-border-strong"}`} />
      ))}
    </span>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function href(query: ReviewQuery, patch: Partial<ReviewQuery>): string {
  const next = { ...query, ...patch };
  const p = new URLSearchParams();
  if (next.store) p.set("store", next.store);
  if (next.rating) p.set("rating", String(next.rating));
  if (next.reply) p.set("reply", next.reply);
  if (next.from) p.set("from", next.from);
  if (next.to) p.set("to", next.to);
  if (next.removed) p.set("removed", "1");
  if (next.page > 1) p.set("page", String(next.page));
  const qs = p.toString();
  return `/admin/integrations/google-reviews${qs ? `?${qs}` : ""}`;
}

const field = "h-10 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-foreground";

function StoresTable({ stores }: { stores: StoreSummary[] }) {
  return (
    <>
      {/* Phones: one card per store. */}
      <ul className="flex flex-col gap-3 md:hidden" aria-label="Stores">
        {stores.map((s) => (
          <li key={s.storeCode} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{s.displayName}</p>
                <p className="text-[12px] text-muted-foreground">Store {s.storeCode} · {s.address}</p>
              </div>
              <Badge tone={MATCH_TONE[s.matchStatus]}>{MATCH_LABEL[s.matchStatus]}</Badge>
            </div>
            <p className="mt-2 text-[13px] text-foreground">
              {s.reviewCount} reviews · {rating(s.averageRating)} average · {s.unansweredCount} unanswered
            </p>
            {MATCH_HELP[s.matchStatus] ? <p className="mt-1 text-[12px] text-muted-foreground">{MATCH_HELP[s.matchStatus]}</p> : null}
            <div className="mt-2">
              <StoreLinkAction storeCode={s.storeCode} candidate={s.candidate ? { account: s.candidate.account, location: s.candidate.location } : null} linked={s.matchStatus === "confirmed" || s.matchStatus === "matched"} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <ScrollTable>
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">Buff City Soap stores approved for Google Reviews</caption>
            <thead className="border-b border-border bg-surface-muted text-[12px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5">Store</th>
                <th scope="col" className="px-4 py-2.5">Google profile</th>
                <th scope="col" className="px-4 py-2.5 text-right">Reviews</th>
                <th scope="col" className="px-4 py-2.5 text-right">Average</th>
                <th scope="col" className="px-4 py-2.5 text-right">Unanswered</th>
                <th scope="col" className="px-4 py-2.5">Last sync</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeCode} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{s.displayName}</p>
                    <p className="text-[12px] text-muted-foreground">Store {s.storeCode} · {s.address}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={MATCH_TONE[s.matchStatus]}>{MATCH_LABEL[s.matchStatus]}</Badge>
                    {MATCH_HELP[s.matchStatus] ? <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">{MATCH_HELP[s.matchStatus]}</p> : null}
                    {s.reason ? <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">{REASON_TEXT[s.reason] ?? ""}</p> : null}
                    {s.candidate ? <p className="mt-1 max-w-xs text-[12px] text-foreground">Google lists: {[s.candidate.title, s.candidate.street, s.candidate.city].filter(Boolean).join(", ")}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.reviewCount}
                    {s.apiTotalReviewCount !== null ? (
                      <p className={s.apiTotalReviewCount === s.reviewCount ? "text-[11px] text-muted-foreground" : "text-[11px] font-bold text-status-attention"}>
                        Google reports {s.apiTotalReviewCount}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{rating(s.averageRating)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.unansweredCount}</td>
                  <td className="px-4 py-3">
                    {s.lastSyncAt ? (
                      <>
                        <p>{stamp(s.lastSyncAt)}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {s.lastSyncStatus === "complete" ? "Complete" : s.lastSyncStatus === "incomplete" ? "Incomplete" : "Failed"}
                          {s.lastSyncError ? ` — ${SYNC_ERROR_TEXT[s.lastSyncError] ?? "see run history"}` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StoreLinkAction storeCode={s.storeCode} candidate={s.candidate ? { account: s.candidate.account, location: s.candidate.location } : null} linked={s.matchStatus === "confirmed" || s.matchStatus === "matched"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      </div>
    </>
  );
}

function ReviewFilters({ query, stores }: { query: ReviewQuery; stores: StoreSummary[] }) {
  return (
    <form method="get" className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter reviews">
      <label className="text-[12px] font-semibold text-muted-foreground">
        Store
        <select name="store" defaultValue={query.store ?? ""} className={field}>
          <option value="">All seven stores</option>
          {stores.map((s) => (
            <option key={s.storeCode} value={s.storeCode}>{s.displayName} ({s.storeCode})</option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-muted-foreground">
        Rating
        <select name="rating" defaultValue={query.rating ? String(query.rating) : ""} className={field}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>{n} star{n === 1 ? "" : "s"}</option>
          ))}
        </select>
      </label>
      <label className="text-[12px] font-semibold text-muted-foreground">
        Reply
        <select name="reply" defaultValue={query.reply ?? ""} className={field}>
          <option value="">Answered or not</option>
          <option value="unanswered">Unanswered</option>
          <option value="answered">Answered</option>
        </select>
      </label>
      <label className="text-[12px] font-semibold text-muted-foreground">
        From
        <input type="date" name="from" defaultValue={query.from ?? ""} className={field} />
      </label>
      <label className="text-[12px] font-semibold text-muted-foreground">
        To
        <input type="date" name="to" defaultValue={query.to ?? ""} className={field} />
      </label>
      <div className="flex items-end gap-2">
        <Button type="submit">Apply</Button>
        <Button asChild variant="ghost">
          <Link href="/admin/integrations/google-reviews">Reset</Link>
        </Button>
      </div>
    </form>
  );
}

function ReviewList({ page, query }: { page: ReviewPage; query: ReviewQuery }) {
  if (page.rows.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareReply />}
        title={page.total === 0 && !hasFilter(query) ? "No reviews saved yet" : "No reviews match these filters"}
        description={page.total === 0 && !hasFilter(query) ? "Reviews appear here after the first sync that is allowed to save." : "Try a different store, rating or date range."}
      />
    );
  }
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <>
      <ul className="flex flex-col gap-3" aria-label="Reviews">
        {page.rows.map((r) => (
          <li key={r.id + r.storeCode} className="rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-soft">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Stars value={r.starRating} />
              <span className="text-[13px] font-semibold text-foreground">{r.reviewerName ?? "Anonymous reviewer"}</span>
              <span className="text-[13px] text-muted-foreground">{r.storeName}</span>
              <span className="text-[12px] text-muted-foreground">Store {r.storeCode} · {reviewDate(r.createdAt)}</span>
              <Badge tone={r.hasReply ? "ready" : "attention"}>{r.hasReply ? "Answered" : "Unanswered"}</Badge>
              {r.removedAt ? <Badge tone="neutral">No longer returned by Google</Badge> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[14px] text-foreground">{r.comment ?? <span className="text-muted-foreground">Rating only — no written comment.</span>}</p>
            {r.replyComment ? (
              <div className="mt-3 rounded-[var(--radius-sm)] bg-surface-muted p-3">
                <p className="text-[12px] font-semibold text-muted-foreground">Reply {r.replyUpdatedAt ? `· ${reviewDate(r.replyUpdatedAt)}` : ""}</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-foreground">{r.replyComment}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <nav className="mt-4 flex items-center justify-between text-[13px]" aria-label="Pagination">
        <span className="text-muted-foreground">
          Page {page.page} of {pages} · {page.total} review{page.total === 1 ? "" : "s"}
        </span>
        <span className="flex gap-2">
          {page.page > 1 ? (
            <Button asChild variant="ghost" size="sm"><Link href={href(query, { page: page.page - 1 })}>Previous</Link></Button>
          ) : null}
          {page.page < pages ? (
            <Button asChild variant="ghost" size="sm"><Link href={href(query, { page: page.page + 1 })}>Next</Link></Button>
          ) : null}
        </span>
      </nav>
    </>
  );
}

const hasFilter = (q: ReviewQuery) => Boolean(q.store || q.rating || q.reply || q.from || q.to || q.removed);

const RUN_TONE: Record<RunRow["status"], "ready" | "attention" | "failed" | "neutral" | "processing"> = {
  succeeded: "ready",
  partial: "attention",
  failed: "failed",
  refused: "neutral",
  running: "processing",
};

function RunHistory({ runs }: { runs: RunRow[] }) {
  if (runs.length === 0) return <EmptyState compact title="No sync has run yet" description="Each check or sync is recorded here." />;
  return (
    <ScrollTable>
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Recent Google Reviews sync runs</caption>
        <thead className="border-b border-border bg-surface-muted text-[12px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5">Started</th>
            <th scope="col" className="px-4 py-2.5">Kind</th>
            <th scope="col" className="px-4 py-2.5">Result</th>
            <th scope="col" className="px-4 py-2.5 text-right">Stores</th>
            <th scope="col" className="px-4 py-2.5 text-right">Read</th>
            <th scope="col" className="px-4 py-2.5 text-right">New / changed / removed</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">{stamp(r.startedAt)}</td>
              <td className="px-4 py-2.5">{r.mode === "dry_run" ? "Check (nothing saved)" : "Sync and save"}{r.requestedBy.startsWith("cron:") ? " · scheduled" : ""}</td>
              <td className="px-4 py-2.5">
                <Badge tone={RUN_TONE[r.status]}>{r.status}</Badge>
                {r.errorCode ? <span className="ml-2 text-[12px] text-muted-foreground">{r.errorCode.replaceAll("_", " ")}</span> : null}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.locationsComplete}/{r.locationsAttempted}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.reviewsFetched}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.reviewsInserted} / {r.reviewsUpdated} / {r.reviewsMarkedRemoved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

export function GoogleReviewsScreen({ state, flash }: GoogleReviewsPageProps) {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Integrations"
        title="Google Reviews"
        description="Reviews for Buff City Soap's seven approved Business Profiles. Read-only: Ask Bubbles never replies to, edits or deletes a review."
      />

      {flash?.kind === "connected" ? (
        <Notice tone="accent" icon={<CheckCircle2 />} className="mb-4" title="Google account connected">
          Run a check to confirm which Business Profiles it can see.
        </Notice>
      ) : null}
      {flash?.kind === "error" ? (
        <Notice tone="attention" icon={<AlertTriangle />} className="mb-4" title="Google sign-in did not finish">
          {OAUTH_ERROR_TEXT[flash.code] ?? "Nothing was connected. You can try again."}
        </Notice>
      ) : null}

      {state.state === "demo" ? (
        <EmptyState title="Not available in the demo" description="This screen reads real Google data, so it shows nothing in demo mode." />
      ) : state.state === "unconfigured" ? (
        <EmptyState title="The database is not configured" description="Connect Supabase for this deployment before using Google Reviews." />
      ) : state.state === "missing" ? (
        <EmptyState icon={<AlertTriangle />} title="The Google Reviews tables are not installed" description="Apply the Google Reviews database migration (20261013001000), then reload this page." />
      ) : state.state === "unavailable" ? (
        <EmptyState icon={<AlertTriangle />} title="Google Reviews could not be loaded" description="The database did not answer. Nothing has been changed. Reload to try again." action={<Button asChild variant="ghost"><Link href="/admin/integrations/google-reviews">Reload</Link></Button>} />
      ) : (
        <Ready state={state} />
      )}
    </PageShell>
  );
}

function Ready({ state }: { state: Extract<GoogleReviewsPageProps["state"], { state: "ready" }> }) {
  const { status, stores, totals, reviews, query } = state;
  const blocker = status.blocker ? blockerText(status.blocker) : null;
  return (
    <div className="flex flex-col gap-8">
      {blocker ? (
        <Notice tone="attention" icon={<AlertTriangle />} title={blocker.title}>
          {blocker.body}
        </Notice>
      ) : null}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Reviews" value={String(totals.reviews)} hint="Across the seven stores" />
        <Card label="Average rating" value={rating(totals.average)} hint={totals.average === null ? "No reviews yet" : "Out of 5"} />
        <Card label="Unanswered" value={String(totals.unanswered)} hint="Reviews with no reply" />
        <Card label="Stores linked" value={`${totals.storesLinked} of ${totals.storesTotal}`} hint="To a Google profile" />
      </section>

      <section aria-label="Connection">
        <SectionHeader title="Connection" description={status.connection.state === "active" ? `Connected ${stamp(status.connection.connectedAt)}.` : "Not connected."} />
        <GoogleReviewsActions connected={status.connection.state === "active"} canConnect={status.credentialsReady} writesEnabled={status.writesEnabled} enabled={status.enabled} />
        {status.redirectUri ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            Google Cloud OAuth redirect URI to register: <code className="break-all">{status.redirectUri}</code>
          </p>
        ) : null}
        <p className="mt-1 text-[12px] text-muted-foreground">
          Automatic refresh: {status.scheduleEnabled && status.enabled && status.writesEnabled ? "on (every 6 hours)" : "off"}.
        </p>
      </section>

      <section aria-label="Stores">
        <SectionHeader title="Stores" description="Only these seven Buff City Soap stores are ever linked. Any other brand's profiles in the same Google account are ignored." />
        <StoresTable stores={stores} />
      </section>

      <section aria-label="Reviews">
        <SectionHeader title="Reviews" />
        <ReviewFilters query={query} stores={stores} />
        <ReviewList page={reviews} query={query} />
      </section>

      <section aria-label="Sync history">
        <SectionHeader title="Sync history" />
        <RunHistory runs={status.runs} />
      </section>
    </div>
  );
}
