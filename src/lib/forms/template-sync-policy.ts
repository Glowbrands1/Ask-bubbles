/**
 * ============================================================================
 * WHERE THE CODE'S TEMPLATES MAY BE WRITTEN INTO THE DATABASE
 * ============================================================================
 *
 * `ensureTemplateLibrary` installs missing templates, publishes a newer seed
 * revision of a form, and renames a template — all from the TEMPLATE LIBRARY
 * THIS BUILD SHIPS, not from anything a person authored. It runs when an
 * administrator opens Forms → Form Templates, and on `POST /api/forms/templates`.
 *
 * PREVIEW AND PRODUCTION READ ONE SUPABASE DATABASE (see
 * `docs/production-demo-posture.md`). So a Preview deployment running a PR's
 * code could publish that PR's template revision into Production's library
 * before Production runs the code that revision is written for — new forms
 * would be filled against a document Production does not know how to draft or
 * print. Found in the PR #84 pre-merge review, where opening Form Templates on
 * the Preview would have published Corrective Action revision 5 early.
 *
 * THE RULE, decided from `VERCEL_ENV` (set by Vercel on every deployment), not
 * from a hostname:
 *
 *   production                  allowed — the deployment whose code the
 *                               shared database is meant to match.
 *   preview, development, or    refused. Fails CLOSED: a Vercel deployment
 *   on Vercel with no readable  that cannot say it is Production is treated
 *   environment                 as not Production. No switch overrides it.
 *   not on Vercel, under test   allowed — the suite runs against an in-memory
 *                               fake, never a real database.
 *   not on Vercel, otherwise    refused unless `FORMS_TEMPLATE_SYNC_ENABLED`
 *   (`next dev`, `next start`)  is on. The only Supabase project is
 *                               Production's, so a local build pointed at it
 *                               must opt in on purpose.
 *
 * PUBLISHING A PERSON'S DRAFT FOLLOWS THE SAME RULE (`templatePublishDecision`).
 * The template editor's Publish, an uploaded document's proposal and
 * activating a reference copy all change what every live form is filled and
 * printed against, in the one database Preview shares with Production. A
 * person reviewing a pull request on its Preview could otherwise publish
 * into the live library by clicking Publish there. So those writes are
 * allowed exactly where the library sync is: on the Production deployment,
 * under test, or on a local build that opted in. Editing and saving a draft,
 * previewing it and filling forms are not publishing and are unchanged.
 *
 * Pure: reads only the environment it is handed.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** The local opt-in. Never consulted on a Vercel deployment. */
export const TEMPLATE_SYNC_ENABLED_ENV = "FORMS_TEMPLATE_SYNC_ENABLED";

export type TemplateSyncDecision =
  | { allowed: true; environment: string }
  | { allowed: false; environment: string; reason: string };

function read(env: Env, name: string): string {
  return (env[name] ?? "").trim().toLowerCase();
}

function flag(env: Env, name: string): boolean {
  return ["true", "1", "yes", "on"].includes(read(env, name));
}

/** Where the environment rule lands, before any wording is chosen. */
type Placement =
  | { allowed: true; environment: string }
  | { allowed: false; environment: string; onVercel: boolean };

function placement(env: Env): Placement {
  /*
   * The server-side variable first; the browser-exposed twin is a fallback for
   * a project that exposes only that one. Both are set by Vercel itself.
   */
  const vercelEnv = read(env, "VERCEL_ENV") || read(env, "NEXT_PUBLIC_VERCEL_ENV");
  const onVercel = vercelEnv !== "" || read(env, "VERCEL") === "1";

  if (onVercel) {
    if (vercelEnv === "production") return { allowed: true, environment: "production" };
    return { allowed: false, environment: vercelEnv || "unknown", onVercel: true };
  }

  if (read(env, "NODE_ENV") === "test") return { allowed: true, environment: "test" };
  if (flag(env, TEMPLATE_SYNC_ENABLED_ENV)) return { allowed: true, environment: "local" };
  return { allowed: false, environment: "local", onVercel: false };
}

function deploymentName(environment: string): string {
  return environment === "preview" ? "Preview" : `"${environment}"`;
}

export function templateSyncDecision(env: Env = process.env): TemplateSyncDecision {
  const where = placement(env);
  if (where.allowed) return where;
  if (where.onVercel) {
    return {
      allowed: false,
      environment: where.environment,
      reason: `Template sync is off on this ${deploymentName(where.environment)} deployment. Preview and Production share one database, so only the Production deployment installs or publishes the template library. Nothing was installed, published or renamed.`,
    };
  }
  return {
    allowed: false,
    environment: where.environment,
    reason: `Template sync is off outside the Production deployment. Set ${TEMPLATE_SYNC_ENABLED_ENV}=true to sync a local build — only against a database that is not Production's. Nothing was installed, published or renamed.`,
  };
}

/**
 * Whether a person's draft or reference copy may be published from this
 * deployment. The same placement as the library sync; see the header.
 */
export function templatePublishDecision(env: Env = process.env): TemplateSyncDecision {
  const where = placement(env);
  if (where.allowed) return where;
  if (where.onVercel) {
    return {
      allowed: false,
      environment: where.environment,
      reason: `Publishing is off on this ${deploymentName(where.environment)} deployment. Preview and Production share one database, so a template published here would go live for every location. Publish from the Production app. Your draft is saved and nothing was published.`,
    };
  }
  return {
    allowed: false,
    environment: where.environment,
    reason: `Publishing is off outside the Production deployment. Set ${TEMPLATE_SYNC_ENABLED_ENV}=true to publish from a local build — only against a database that is not Production's. Your draft is saved and nothing was published.`,
  };
}

/** Thrown by a publishing write this deployment may not make. Nothing was written. */
export class TemplatePublishRefusedError extends Error {
  constructor(
    readonly environment: string,
    message: string,
  ) {
    super(message);
    this.name = "TemplatePublishRefusedError";
  }
}

/** Refuses, before any write, a publish this deployment may not make. */
export function assertTemplatePublishAllowed(env: Env = process.env): void {
  const decision = templatePublishDecision(env);
  if (!decision.allowed) throw new TemplatePublishRefusedError(decision.environment, decision.reason);
}
