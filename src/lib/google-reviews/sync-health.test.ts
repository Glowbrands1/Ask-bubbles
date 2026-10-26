import { afterEach, describe, expect, it, vi } from "vitest";

import { lastSavedAt, RECONNECT_PATH, syncNotice } from "./sync-health";

/**
 * QA, 25 Oct 2026, production Ask Bubbles: the newest review was 20 Oct, the
 * stores were last seen 21 Oct 06:24 UTC, and every sync since has failed
 * "not_connected" (the latest 25 Oct 18:23 UTC). Nothing on /reviews said so.
 */

const state = vi.hoisted(() => ({ reads: 0 }));

vi.mock("./views", () => ({
  readStoreSummaries: async () => {
    state.reads += 1;
    return [{ lastSyncAt: "2026-10-21T06:24:00.000Z", lastSyncStatus: "complete" }];
  },
  readConnectionState: async () => ({ state: "expired", endedAt: "2026-10-21T12:00:00.000Z", errorCode: "invalid_grant" }),
}));

const OUTAGE = {
  stores: [
    { lastSyncAt: "2026-10-21T06:24:00.000Z", lastSyncStatus: "complete" as const },
    { lastSyncAt: "2026-10-21T06:20:00.000Z", lastSyncStatus: "incomplete" as const },
    { lastSyncAt: "2026-10-25T18:23:00.000Z", lastSyncStatus: "failed" as const },
  ],
  connection: { state: "expired" as const, endedAt: "2026-10-21T12:00:00.000Z", errorCode: "invalid_grant" },
  now: new Date("2026-10-25T18:23:00.000Z"),
};

afterEach(() => {
  delete process.env.GOOGLE_REVIEWS_STALE_BANNER_ENABLED;
  state.reads = 0;
});

describe("the not_connected outage from 21 Oct", () => {
  it("last saved is the newest completed store sync, never a failed one", () => {
    expect(lastSavedAt(OUTAGE.stores)).toBe("2026-10-21T06:24:00.000Z");
  });

  it("an administrator is told since when and sent to reconnect", () => {
    const notice = syncNotice({ ...OUTAGE, canManage: true });
    expect(notice?.title).toBe("Google reviews are not up to date");
    expect(notice?.body).toContain("Google reviews have not synced since Oct 21, 2026, 1:24 AM (Central time).");
    expect(notice?.body).toContain("The Google account connection is no longer active.");
    expect(notice?.body).toContain("Reconnect the Google account on the Google Reviews integration screen.");
    expect(notice?.href).toBe(RECONNECT_PATH);
  });

  it("anyone else is told the same, without a link they cannot open", () => {
    const notice = syncNotice({ ...OUTAGE, canManage: false });
    expect(notice?.body).toContain("An administrator needs to reconnect the Google account.");
    expect(notice?.href).toBeNull();
  });
});

describe("no notice while reviews are current", () => {
  it("an active connection that saved within two days says nothing", () => {
    expect(
      syncNotice({
        stores: [{ lastSyncAt: "2026-10-25T12:00:00.000Z", lastSyncStatus: "complete" }],
        connection: { state: "active", connectedAt: "2026-10-01T00:00:00.000Z", connectedBy: "admin", lastUsedAt: null },
        now: new Date("2026-10-25T18:23:00.000Z"),
        canManage: true,
      }),
    ).toBeNull();
  });

  it("an active connection that has saved nothing for more than two days is still called out", () => {
    const notice = syncNotice({
      stores: [{ lastSyncAt: "2026-10-22T12:00:00.000Z", lastSyncStatus: "complete" }],
      connection: { state: "active", connectedAt: "2026-10-01T00:00:00.000Z", connectedBy: "admin", lastUsedAt: null },
      now: new Date("2026-10-25T18:23:00.000Z"),
      canManage: false,
    });
    expect(notice?.body).toContain("have not synced since Oct 22, 2026");
    expect(notice?.body).not.toContain("connection is no longer active");
  });
});

describe("GOOGLE_REVIEWS_STALE_BANNER_ENABLED", () => {
  it("off (the default), nothing is read and there is no notice", async () => {
    const { loadSyncNotice } = await import("./sync-health-read");
    expect(await loadSyncNotice(true, OUTAGE.now)).toBeNull();
    expect(state.reads).toBe(0);
  });

  it("on, the outage produces the notice", async () => {
    process.env.GOOGLE_REVIEWS_STALE_BANNER_ENABLED = "true";
    const { loadSyncNotice } = await import("./sync-health-read");
    const notice = await loadSyncNotice(true, OUTAGE.now);
    expect(state.reads).toBe(1);
    expect(notice?.body).toContain("have not synced since Oct 21, 2026");
  });
});
