import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RECOVERY_START_PATH, SET_PASSWORD_PATH } from "@/lib/auth/routes";

/**
 * The Supabase "Reset Password" email template lives in the dashboard, not in
 * this repo, so docs/supabase-reset-password-template.html is the copy that gets
 * pasted in. Pin it to the routes the app really serves.
 */
const template = readFileSync(
  join(process.cwd(), "docs/supabase-reset-password-template.html"),
  "utf8",
);

describe("docs/supabase-reset-password-template.html", () => {
  it("links to the app's recovery-start route with the token hash, not a one-click Supabase /verify link", () => {
    expect(template).toContain(
      `https://askbubbles.vercel.app${RECOVERY_START_PATH}?token_hash={{ .TokenHash }}&type=recovery`,
    );
    expect(template).not.toContain("{{ .ConfirmationURL }}");
  });

  it("names the production host explicitly (not {{ .SiteURL }}, whose trailing slash or value is outside our control) and never localhost", () => {
    expect(template).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(template).not.toContain("{{ .SiteURL }}");
    const hosts = [...template.matchAll(/https?:\/\/[^/"\s]+/g)].map((m) => m[0]);
    expect(new Set(hosts)).toEqual(new Set(["https://askbubbles.vercel.app"]));
  });

  it("points at a route that exists", () => {
    expect(RECOVERY_START_PATH).toBe("/auth/recovery-start");
    expect(SET_PASSWORD_PATH).toBe("/reset-password");
  });
});
