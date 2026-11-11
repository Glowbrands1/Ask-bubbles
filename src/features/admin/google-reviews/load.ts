import "server-only";

import { isDemoMode } from "@/lib/config/runtime";
import { supabaseReadiness } from "@/lib/config/server-env";
import { demoRuntime } from "@/lib/demo/runtime";
import { sampleReviewPage, sampleStatus, sampleStoreSummaries } from "@/lib/google-reviews/sample-views";
import { OAUTH_RESULTS } from "@/lib/google-reviews/route-helpers";
import { readGoogleReviewsStatus, type GoogleReviewsStatus } from "@/lib/google-reviews/status";
import {
  GoogleViewError,
  parseReviewQuery,
  readReviewPage,
  readStoreSummaries,
  summarize,
  type ReviewPage,
  type ReviewQuery,
  type StoreSummary,
} from "@/lib/google-reviews/views";

/**
 * Everything the Google Reviews screen shows, read on the server.
 *
 * EVERY STATE IS MEASURED: the credentials (by NAME), the connection and the
 * last run (from the database), the blocker (derived from those), the stores and
 * the reviews. A demo build shows nothing from Google or Supabase: it shows the
 * demo runtime's labelled sample, under a notice saying it is invented.
 */

export type Flash = { kind: "connected" } | { kind: "error"; code: string };

export type PageState =
  | { state: "demo" }
  | { state: "unconfigured" }
  | { state: "missing" }
  | { state: "unavailable" }
  | {
      state: "ready";
      status: GoogleReviewsStatus;
      stores: StoreSummary[];
      totals: ReturnType<typeof summarize>;
      reviews: ReviewPage;
      query: ReviewQuery;
    };

export interface GoogleReviewsPageProps {
  state: PageState;
  flash: Flash | null;
  /** A demo build: the ready state is built from the labelled sample, and the screen says so. */
  demo?: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFlash(params: Params): Flash | null {
  if (first(params.connected) === "1") return { kind: "connected" };
  const error = first(params.error);
  return error && (OAUTH_RESULTS as readonly string[]).includes(error) && error !== "connected" ? { kind: "error", code: error } : null;
}

export async function loadGoogleReviewsPage(params: Params): Promise<GoogleReviewsPageProps> {
  const flash = parseFlash(params);
  if (isDemoMode()) {
    /*
     * The labelled sample (invented reviews for the seven approved profiles),
     * shaped exactly as the live reads return it, so the real screen renders.
     * A build without one keeps the old "not available in the demo" state.
     */
    const sample = await demoRuntime.loadGoogleReviewsSample();
    if (!sample) return { state: { state: "demo" }, flash };
    const query = parseReviewQuery(params);
    const stores = sampleStoreSummaries(sample);
    return {
      state: { state: "ready", status: sampleStatus(sample), stores, totals: summarize(stores), reviews: sampleReviewPage(sample, query), query },
      flash,
      demo: true,
    };
  }
  if (!supabaseReadiness().ready) return { state: { state: "unconfigured" }, flash };

  try {
    const query = parseReviewQuery(params);
    const [status, stores, reviews] = await Promise.all([readGoogleReviewsStatus(), readStoreSummaries(), readReviewPage(query)]);
    return { state: { state: "ready", status, stores, totals: summarize(stores), reviews, query }, flash };
  } catch (error) {
    if (error instanceof GoogleViewError) return { state: { state: error.reason === "missing" ? "missing" : "unavailable" }, flash };
    throw error;
  }
}
