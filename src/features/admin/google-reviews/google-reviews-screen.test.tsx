// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { GoogleReviewsScreen } from "./google-reviews-screen";
import { parseFlash, type GoogleReviewsPageProps } from "./load";
import type { StoreSummary } from "@/lib/google-reviews/views";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const store = (over: Partial<StoreSummary> = {}): StoreSummary => ({
  storeCode: "219",
  displayName: "Buff City Soap Lee's Summit",
  address: "2050 NW Lowenstein Dr, Ste C, Lee's Summit, MO 64081",
  matchStatus: "unmatched",
  matchConfidence: "none",
  reviewCount: 0,
  averageRating: null,
  unansweredCount: 0,
  ratings: [0, 0, 0, 0, 0],
  latestReviewAt: null,
  oldestReviewAt: null,
  apiTotalReviewCount: null,
  apiTotalCheckedAt: null,
  lastSyncAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  candidate: null,
  reason: null,
  ...over,
});

const ready = (over: Partial<Extract<GoogleReviewsPageProps["state"], { state: "ready" }>> = {}): GoogleReviewsPageProps => ({
  flash: null,
  state: {
    state: "ready",
    status: {
      enabled: true,
      writesEnabled: true,
      scheduleEnabled: true,
      credentialsReady: true,
      missingCredentials: [],
      redirectUri: "https://example.test/api/admin/google-reviews/callback",
      connection: { state: "active", connectedAt: "2026-10-12T15:00:00Z", connectedBy: "admin", lastUsedAt: null },
      runs: [],
      blocker: null,
    },
    stores: [store()],
    totals: { reviews: 0, average: null, unanswered: 0, storesLinked: 0, storesTotal: 7 },
    reviews: { rows: [], total: 0, page: 1, pageSize: 20 },
    query: { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 },
    ...over,
  },
});

describe("Google Reviews screen states", () => {
  it("demo mode shows no data", () => {
    render(<GoogleReviewsScreen state={{ state: "demo" }} flash={null} />);
    expect(screen.getByText("Not available in the demo")).toBeTruthy();
  });

  it("names the missing migration", () => {
    render(<GoogleReviewsScreen state={{ state: "missing" }} flash={null} />);
    expect(screen.getByText(/20261013001000/)).toBeTruthy();
  });

  it("shows a failure state with a reload link", () => {
    render(<GoogleReviewsScreen state={{ state: "unavailable" }} flash={null} />);
    expect(screen.getByText("Google Reviews could not be loaded")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reload" })).toBeTruthy();
  });

  it("empty ready state: totals, no-reviews empty state, never-synced store", () => {
    render(<GoogleReviewsScreen {...ready()} />);
    expect(screen.getByText("No reviews saved yet")).toBeTruthy();
    expect(screen.getByText("0 of 7")).toBeTruthy();
    expect(screen.getAllByText("Not found in Google").length).toBeGreaterThan(0);
  });

  it("explains an API-approval blocker in words", () => {
    const props = ready();
    if (props.state.state === "ready") props.state.status.blocker = { code: "api_access_pending" };
    render(<GoogleReviewsScreen {...props} />);
    expect(screen.getByText(/Waiting for Google's approval/)).toBeTruthy();
  });

  it("lists reviews with stars, reply state and no reviewer identity", () => {
    const props = ready({
      totals: { reviews: 2, average: 4.5, unanswered: 1, storesLinked: 1, storesTotal: 7 },
      reviews: {
        total: 2,
        page: 1,
        pageSize: 20,
        rows: [
          { id: "r1", storeCode: "219", storeName: "Buff City Soap Lee's Summit", starRating: 5, comment: "Lovely", reviewerName: "Ann B.", createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-01T12:00:00Z", replyComment: "Thanks!", replyUpdatedAt: "2026-10-02T12:00:00Z", hasReply: true, removedAt: null },
          { id: "r2", storeCode: "219", storeName: "Buff City Soap Lee's Summit", starRating: 4, comment: null, reviewerName: null, createdAt: "2026-10-03T12:00:00Z", updatedAt: "2026-10-03T12:00:00Z", replyComment: null, replyUpdatedAt: null, hasReply: false, removedAt: null },
        ],
      },
    });
    render(<GoogleReviewsScreen {...props} />);
    const list = screen.getByRole("list", { name: "Reviews" });
    expect(within(list).getByText("Answered")).toBeTruthy();
    expect(within(list).getByText("Unanswered")).toBeTruthy();
    expect(within(list).getByRole("img", { name: "5 out of 5 stars" })).toBeTruthy();
    expect(within(list).getByText(/Rating only/)).toBeTruthy();
    expect(screen.getByText("4.5")).toBeTruthy();
  });

  it("filtered empty result says so", () => {
    const props = ready();
    if (props.state.state === "ready") props.state.query = { ...props.state.query, rating: 1 };
    render(<GoogleReviewsScreen {...props} />);
    expect(screen.getByText("No reviews match these filters")).toBeTruthy();
  });

  it("disables saving when the writes switch is off", () => {
    const props = ready();
    if (props.state.state === "ready") props.state.status.writesEnabled = false;
    render(<GoogleReviewsScreen {...props} />);
    expect((screen.getByRole("button", { name: /Sync and save/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saving needs a second, explicit confirmation and sends confirmSave once", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "succeeded", mode: "save", storesLinked: 7, storesTotal: 7, totals: { fetched: 3, inserted: 3, updated: 0, removed: 0 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleReviewsScreen {...ready()} />);
    fireEvent.click(screen.getByRole("button", { name: /Sync and save/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Confirm and save" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/admin/google-reviews/sync");
    expect(JSON.parse(String(init.body))).toEqual({ dryRun: false, confirmSave: true });
    await screen.findByText(/Saved\. 7 of 7 stores linked/);
  });

  it("a dry-run check never sends confirmSave", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "succeeded", mode: "dry_run", storesLinked: 0, storesTotal: 7 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<GoogleReviewsScreen {...ready()} />);
    fireEvent.click(screen.getByRole("button", { name: /Check Google/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ dryRun: true });
  });

  it("offers to confirm only a candidate, never a mismatch", () => {
    const props = ready({
      stores: [
        store({ storeCode: "219", matchStatus: "candidate", candidate: { account: "accounts/1", location: "locations/2", title: "Buff City Soap", street: "2050 NW Lowenstein Dr", city: "Lee's Summit", state: "MO" } }),
        store({ storeCode: "225", displayName: "Buff City Soap Sioux Falls", matchStatus: "mismatch", reason: "store_code_matches_but_address_differs" }),
      ],
    });
    render(<GoogleReviewsScreen {...props} />);
    expect(screen.getAllByRole("button", { name: "Confirm this profile" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Does not match").length).toBeGreaterThan(0);
  });

  it("shows OAuth flash messages in words and parses them from the URL", () => {
    expect(parseFlash({ connected: "1" })).toEqual({ kind: "connected" });
    expect(parseFlash({ error: "denied" })).toEqual({ kind: "error", code: "denied" });
    expect(parseFlash({ error: "<script>" })).toBeNull();
    render(<GoogleReviewsScreen {...ready()} flash={{ kind: "error", code: "missing_scope" }} />);
    expect(screen.getByText(/Business Profile permission was not approved/)).toBeTruthy();
  });
});
