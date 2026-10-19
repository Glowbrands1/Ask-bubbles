import "server-only";

import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit } from "@/lib/api/respond";
import { assertSameOrigin } from "@/lib/api/same-origin";
import { authorizeRequest } from "@/lib/auth/server";
import { AuthError, type AuthorizedContext } from "@/lib/auth/types";
import { canAccessAdminConsole, DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import { WovenStatusError } from "./status";
import { EmployeeStoreError } from "./store";

/**
 * ============================================================================
 * WHO MAY SEE WOVEN EMPLOYEES — both existing permissions, checked together
 * ============================================================================
 *
 * The routes that return names, emails or mapping decisions about people
 * require `manage_users` AND `manage_integrations`. Both already exist in the
 * permission matrix, which this does not change; it only asks for the two at
 * once, through the same `authorizeRequest` every protected route uses, so a
 * refusal is the same 401/403 the rest of the app gives.
 *
 * Counts-only routes (sync status, sync history) keep `manage_integrations`.
 */
export async function authorizeWovenPeopleRequest(request: Request): Promise<AuthorizedContext> {
  const context = await authorizeRequest(request, "manage_users");
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, context.identity.role, "manage_integrations")) {
    throw new AuthError("forbidden", "Your role does not have permission to do that.");
  }
  return context;
}

/**
 * THE GUARD FOR AN ADMINISTRATOR'S ACCESS DECISION (shadow review, rehire):
 * live mode, same-origin, both Woven permissions AND an administrator-console
 * role (admin / owner / developer), rate-limited. The acting account is the
 * VERIFIED SESSION's `identity.subject` — the only place an actor id ever comes
 * from; no route reads one from the body. The database re-checks that this
 * account is an active administrator.
 */
export async function authorizeWovenAdminDecision(request: Request): Promise<AuthorizedContext> {
  assertLiveMode();
  assertNoConfigurationProblems();
  assertSameOrigin(request);
  const context = await authorizeWovenPeopleRequest(request);
  if (!canAccessAdminConsole(context.identity.role)) {
    throw new AuthError("forbidden", "Only an administrator can make this decision.");
  }
  assertWithinRateLimit(request, "mutate");
  return context;
}

/** The reviewer label stored on a decision: the verified session, never the request body. */
export function reviewerLabel(context: AuthorizedContext): string {
  return `admin:${context.identity.email || context.identity.subject}`.slice(0, 120);
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The response for a directory that could not be read — a missing migration
 * and an unanswering database kept apart. Null when the error is not one.
 */
export function wovenStoreFailureResponse(error: unknown): NextResponse | null {
  if (error instanceof WovenStatusError) {
    return NextResponse.json(
      {
        status: "failed",
        code: error.reason === "missing" ? "directory_not_created" : "store_unavailable",
        reason: error.message,
      },
      { status: 503, headers: NO_STORE },
    );
  }
  if (error instanceof EmployeeStoreError) {
    return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
  }
  return null;
}
