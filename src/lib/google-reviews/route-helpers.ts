import "server-only";

import type { AuthorizedContext } from "@/lib/auth/types";

/** Shared by the Google Reviews routes. */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** The audit label for an administrator, taken from the VERIFIED session — never from a body or a query. */
export function actorOf(context: AuthorizedContext): string {
  return `admin:${context.identity.email || context.identity.subject}`.slice(0, 120);
}

/** One cookie's value from a Cookie header, or undefined. */
export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

export const SCREEN_PATH = "/admin/integrations/google-reviews";

/**
 * Where the browser lands after the OAuth round trip. The result code comes from
 * a CLOSED list, so nothing from Google's query string is ever reflected.
 */
export const OAUTH_RESULTS = [
  "connected",
  "denied",
  "state_mismatch",
  "attempt_expired",
  "attempt_invalid",
  "invalid_grant",
  "invalid_client",
  "no_refresh_token",
  "missing_scope",
  "bad_response",
  "network_error",
  "not_configured",
  "store_error",
] as const;
export type OAuthResult = (typeof OAUTH_RESULTS)[number];

export function screenUrl(request: Request, result: OAuthResult): URL {
  const url = new URL(SCREEN_PATH, request.url);
  url.searchParams.set(result === "connected" ? "connected" : "error", result === "connected" ? "1" : result);
  return url;
}

export interface SyncRequest {
  dryRun: boolean;
}

/**
 * A DRY RUN UNLESS THE BODY SAYS OTHERWISE, TWICE: a save needs `dryRun: false`
 * AND `confirmSave: true`, each exactly the boolean. Anything else is a dry run.
 * `dryRun: false` alone is a refusal, so a half-written client cannot save.
 */
export function parseSyncRequest(body: unknown): { kind: "dry_run" } | { kind: "save" } | { kind: "confirmation_required" } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (b.dryRun === false) return b.confirmSave === true ? { kind: "save" } : { kind: "confirmation_required" };
  return { kind: "dry_run" };
}
