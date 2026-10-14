import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sync = vi.hoisted(() => vi.fn(async () => ({ status: "succeeded", code: null })));
vi.mock("@/lib/google-reviews/sync", () => ({ runGoogleReviewsSync: sync }));

import { POST } from "./route";

const post = (token?: string) => POST(new Request(`https://x.test/api/google-reviews/notify${token ? `?token=${token}` : ""}`, { method: "POST", body: "{}" }));

afterEach(() => {
  vi.unstubAllEnvs();
  sync.mockClear();
});

describe("Google Pub/Sub push endpoint", () => {
  it("is closed without a configured token", async () => {
    expect((await post("x")).status).toBe(503);
  });

  it("rejects a wrong or missing token and starts no sync", async () => {
    vi.stubEnv("GOOGLE_PUBSUB_VERIFICATION_TOKEN", "secret-token");
    expect((await post("nope")).status).toBe(401);
    expect((await post()).status).toBe(401);
    expect(sync).not.toHaveBeenCalled();
  });

  it("acknowledges without syncing while the switches are off", async () => {
    vi.stubEnv("GOOGLE_PUBSUB_VERIFICATION_TOKEN", "secret-token");
    const res = await post("secret-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ignored" });
    expect(sync).not.toHaveBeenCalled();
  });

  it("runs the shared sync when enabled", async () => {
    vi.stubEnv("GOOGLE_PUBSUB_VERIFICATION_TOKEN", "secret-token");
    vi.stubEnv("GOOGLE_REVIEWS_SYNC_ENABLED", "true");
    vi.stubEnv("GOOGLE_REVIEWS_WRITES_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    const res = await post("secret-token");
    expect(await res.json()).toEqual({ status: "succeeded", code: null });
    expect(sync).toHaveBeenCalledOnce();
  });
});
