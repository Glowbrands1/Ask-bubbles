import "server-only";

import { pageIdentity } from "@/lib/auth/page";
import type { AccessScope } from "@/types";

import { reportingScopeOf, type ReportingScope } from "./authorized-locations";

/**
 * The reporting scope for the person loading this page — resolved from the
 * VERIFIED server identity, never from the request. An unverified or missing
 * identity resolves to no locations.
 */
export async function resolveReportingScope(): Promise<ReportingScope> {
  const identity = await pageIdentity();
  if (!identity || !identity.verified) return reportingScopeOf(null);
  return resolveScopeFor(identity.scope);
}

/** The reporting scope for an already-authorized actor's scope. */
export async function resolveScopeFor(
  scope: AccessScope | null | undefined,
): Promise<ReportingScope> {
  return reportingScopeOf(scope ?? null);
}

export type { ReportingScope };
