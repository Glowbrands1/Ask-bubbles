import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REVIEWS_UPDATE_NOTE } from "@/lib/google-reviews/update-note";

/*
 * Each test starts with GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED unset, so the suite reads the same whether
 * or not the environment running it turns the flag on; the flag-on cases set it
 * themselves. The environment's own value is restored after the file.
 */
const ENV_FLAGS = ["GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED"];
const ENV_SAVED = Object.fromEntries(ENV_FLAGS.map((name) => [name, process.env[name]]));
beforeEach(() => {
  for (const name of ENV_FLAGS) delete process.env[name];
});
afterAll(() => {
  for (const name of ENV_FLAGS) {
    const value = ENV_SAVED[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/**
 * Pau, 26 Oct 2026: "API update in progress, syncing 2K reviews in batches"
 * as one fixed note on the Google Reviews page, behind
 * GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED. Off, the page renders exactly as
 * before: the markup with the flag off is the markup with the flag on minus
 * the note.
 */

vi.mock("@/lib/auth/page", () => ({ requirePagePermission: async () => undefined }));
vi.mock("@/components/permission-gate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/reviews/load", () => ({ loadReviewsData: async () => null }));
vi.mock("@/features/reviews/integration-status", () => ({ resolveReviewsIntegrationStatus: () => "connected" }));
vi.mock("@/features/reviews/reviews-dashboard", () => ({
  ReviewsDashboard: ({ tab, status }: { tab: string; status: string }) => <div data-dashboard={`${tab}:${status}`} />,
}));

async function render(): Promise<string> {
  const { default: ReviewsPage } = await import("./page");
  return renderToStaticMarkup(await ReviewsPage({ searchParams: Promise.resolve({}) }));
}

afterEach(() => {
  delete process.env.GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED;
});

describe("the Google Reviews page's update note", () => {
  it("off (the default): no note", async () => {
    const off = await render();
    expect(off).not.toContain("API update in progress");
    expect(off).toContain("data-dashboard=");
  });

  it("on: the note at the top, and nothing else changes", async () => {
    const off = await render();
    process.env.GOOGLE_REVIEWS_UPDATE_NOTE_ENABLED = "true";
    const on = await render();
    expect(on).toContain(REVIEWS_UPDATE_NOTE.replace("isn't", "isn&#x27;t"));
    expect(on.endsWith(off)).toBe(true);
    expect(on.slice(0, on.length - off.length)).toContain("API update in progress");
  });
});
