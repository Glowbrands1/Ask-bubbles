import { expect, test, type Page } from "@playwright/test";

/**
 * The real failure, reproduced in a browser: Supabase's default recovery email
 * lands on the SITE ROOT with the token in the URL fragment
 * (`https://<site>/#access_token=…&type=recovery`), because the redirect URL was
 * not on its allowlist. The app must carry the person to "Create a new
 * password" with no manual step.
 *
 * Supabase itself is mocked at the network edge (`*.supabase.co/auth/v1/*`); the
 * build under test is configured with a placeholder project URL (see the
 * `e2e:build` script). Everything else is the real app.
 */

const SUPABASE = "https://recovery-e2e.supabase.co";
const SECRET_TOKEN = "AT-e2e-secret-token-do-not-leak";

/** A syntactically valid, unexpired JWT: supabase-js decodes it before trusting it. */
function jwt(expiresInSeconds = 3600): string {
  const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "employee@example.com",
    exp,
  })}.${SECRET_TOKEN}`;
}

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "employee@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

const recoveryFragment = () =>
  `#access_token=${jwt()}&expires_in=3600&refresh_token=rt-e2e&token_type=bearer&type=recovery`;

interface Seen {
  passwordUpdates: Array<{ password?: string }>;
  tokenInAnyRequestUrl: boolean;
}

async function mockSupabase(page: Page): Promise<Seen> {
  const seen: Seen = { passwordUpdates: [], tokenInAnyRequestUrl: false };

  page.on("request", (request) => {
    if (request.url().includes(SECRET_TOKEN)) seen.tokenInAnyRequestUrl = true;
  });

  await page.route(`${SUPABASE}/auth/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname.endsWith("/user") && request.method() === "GET") return json(200, USER);
    if (url.pathname.endsWith("/user") && request.method() === "PUT") {
      seen.passwordUpdates.push(request.postDataJSON() as { password?: string });
      return json(200, USER);
    }
    if (url.pathname.endsWith("/logout")) return route.fulfill({ status: 204 });
    return json(404, { message: "unmocked" });
  });

  await page.route("**/api/auth/accept-invitation", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, landing: "/login" }) }),
  );

  return seen;
}

test.describe("recovery link that lands on the site root", () => {
  test("goes straight to Create a new password, with the token scrubbed from the URL", async ({ page }) => {
    const seen = await mockSupabase(page);

    await page.goto(`/${recoveryFragment()}`);

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();
    await expect(page.locator("#new-password")).toBeVisible();
    await expect(page.locator("#confirm-password")).toBeVisible();

    // The token is gone from the address bar and from history.
    expect(page.url()).not.toContain("access_token");
    expect(page.url()).not.toContain(SECRET_TOKEN);
    expect(await page.evaluate(() => window.location.hash)).toBe("");

    // …and was never sent to any request URL (fragments stay in the browser).
    expect(seen.tokenInAnyRequestUrl).toBe(false);
  });

  test("a full reset: forgot link → new password → saved through Supabase → success", async ({ page }) => {
    const seen = await mockSupabase(page);

    await page.goto(`/${recoveryFragment()}`);
    await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();

    const newPassword = "A-long-new-passphrase-2026";
    await page.locator("#new-password").fill(newPassword);
    await page.locator("#confirm-password").fill(newPassword);
    await page.getByRole("button", { name: "Set password and continue" }).first().click();

    await expect.poll(() => seen.passwordUpdates.length).toBe(1);
    expect(seen.passwordUpdates[0].password).toBe(newPassword);
  });

  test("the sign-in screen no longer swallows the link", async ({ page }) => {
    await mockSupabase(page);

    await page.goto(`/login${recoveryFragment()}`);

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByRole("heading", { name: "Create a new password" })).toBeVisible();
  });

  test("an invitation link is NOT hijacked", async ({ page }) => {
    await mockSupabase(page);

    await page.goto(`/${recoveryFragment().replace("type=recovery", "type=invite")}`);

    await expect(page).not.toHaveURL(/reset-password/);
  });
});

test.describe("links that cannot work", () => {
  for (const [label, hash] of [
    ["expired, used, or opened first by an email scanner", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"],
    ["rejected with a different error", "#error=access_denied&error_code=bad_jwt&error_description=nope"],
  ] as const) {
    test(`${label}: friendly message and a Request a new link button`, async ({ page }) => {
      await mockSupabase(page);

      await page.goto(`/${hash}`);

      await expect(page).toHaveURL(/\/reset-password$/);
      await expect(page.getByText("This reset link is no longer valid")).toBeVisible();
      await expect(page.getByText(/error_code|otp_expired|access_denied/)).toHaveCount(0);

      await page.getByRole("link", { name: "Request a new link" }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      await expect(page.getByLabel("Work email")).toBeVisible();
    });
  }

  test("the exact 2026-10-14 production failure: a scanner spent the one-time token, then the person's own click came back as #error=otp_expired on the site root", async ({ page }) => {
    await mockSupabase(page);

    // Supabase redirected to the bare Site URL with this fragment (auth log: "403: Email link is invalid or has expired").
    await page.goto(
      "/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByText("This reset link is no longer valid")).toBeVisible();
    await expect(page.getByText(/already opened/i)).toBeVisible();
    await expect(page.getByText(/security tool/i)).toBeVisible();
    // Nothing technical leaks to the screen, and the way forward is one click.
    await expect(page.getByText(/otp_expired|access_denied|One-time token/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });

  test("an unusable token (Supabase refuses the session) shows the same friendly screen", async ({ page }) => {
    await page.route(`${SUPABASE}/auth/v1/**`, (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ code: 401, msg: "invalid JWT" }) }),
    );

    await page.goto(`/${recoveryFragment()}`);

    await expect(page.getByText("This reset link is no longer valid")).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});
