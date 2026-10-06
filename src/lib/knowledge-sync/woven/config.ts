import "server-only";

import { WOVEN_TENANT } from "@/config/company/woven";
import { WOVEN_WEB_APP_ORIGIN } from "./web-app";

/**
 * ============================================================================
 * THE WOVEN KNOWLEDGE SYNC'S CONFIGURATION — Buff City Soap only
 * ============================================================================
 *
 * THE TENANT IS NOT CONFIGURABLE. Ask Bubbles' Woven integration is a Buff
 * City Soap connector: the company it reads is `WOVEN_TENANT`
 * (`src/config/company/woven.ts` — Midwest Soap Makers,
 * 55839F24-9241-418C-8405-37BAF9A42A87), in code. No environment variable
 * names, defaults or selects a company. The two company variables below are
 * CONFIRMATIONS: each accepts exactly the pinned value, and any other value
 * disables the connector (and withholds its credentials).
 *
 *   WOVEN_BCS_COMPANY_ID     required; must be the pinned Company ID
 *   WOVEN_BCS_COMPANY_NAME   optional; if set, must be "Midwest Soap Makers"
 *
 * INHERITED NAMES ARE NOT READ. The reference platform's `WOVEN_TEAM_*`
 * variables configure nothing here. If one of its tenant variables
 * (`WOVEN_TEAM_COMPANY`, `WOVEN_TEAM_COMPANY_ID`, `WOVEN_TEAM_BASE_URL`) is
 * present — say, copied from another project — with anything but the pinned
 * value, the connector is disabled rather than silently ignoring it.
 *
 * ONE ORIGIN. Woven is read at `https://app.woven.team` only.
 *
 * SERVER-SIDE ONLY. None is `NEXT_PUBLIC_`, and none is ever logged, returned
 * by a route, or written to the database. Problems are reported by variable
 * NAME, never by value.
 */

export const WOVEN_KNOWLEDGE_SYNC_ENABLED_ENV = "WOVEN_KNOWLEDGE_SYNC_ENABLED";
export const WOVEN_BCS_USERNAME_ENV = "WOVEN_BCS_USERNAME";
export const WOVEN_BCS_PASSWORD_ENV = "WOVEN_BCS_PASSWORD";
export const WOVEN_BCS_COMPANY_ID_ENV = "WOVEN_BCS_COMPANY_ID";
export const WOVEN_BCS_COMPANY_NAME_ENV = "WOVEN_BCS_COMPANY_NAME";
/**
 * The File Library download is NOT yet verified for this company. Off, every
 * file part is BLOCKED: tracked and reported, never fetched.
 */
export const WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED_ENV = "WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED";

/** The reference platform's tenant variables. Never read as configuration; a foreign value disables the connector. */
export const INHERITED_TENANT_ENV = {
  company: "WOVEN_TEAM_COMPANY",
  companyId: "WOVEN_TEAM_COMPANY_ID",
  baseUrl: "WOVEN_TEAM_BASE_URL",
} as const;

export interface WovenTeamCredentials {
  username: string;
  password: string;
}

export interface WovenKnowledgeConfig {
  enabled: boolean;
  /** Always `https://app.woven.team`. */
  baseUrl: string;
  /**
   * Why the connector is disabled for tenant reasons: a company variable with
   * any value but the pinned one. Null when every company variable agrees.
   */
  tenantProblem: string | null;
  /** Downloads switched on after their route was verified for this company. Default off. */
  downloads: { fileLibrary: boolean };
  credentials: WovenTeamCredentials | null;
  missingCredentials: string[];
  problems: string[];
  /**
   * Whether a PREVIEW (dry run) may fall back to an in-memory store when the
   * knowledge-sync tables are not installed. Never in a Vercel Production
   * deployment; see `previewTestModeAllowed`.
   */
  previewTestModeAllowed: boolean;
}

/**
 * PREVIEW TEST MODE is for Vercel Preview and local development only.
 *
 * `VERCEL_ENV` is set by Vercel on every deployment: `production`, `preview`
 * or `development`. Production is refused outright. Outside Vercel (no
 * `VERCEL_ENV`), only a non-production Node build qualifies, so a self-hosted
 * `next start` does not quietly enable it either.
 */
export function previewTestModeAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const vercelEnv = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv.length > 0) return vercelEnv === "preview" || vercelEnv === "development";
  return (env.NODE_ENV ?? "").trim().toLowerCase() !== "production";
}

/** Pacing and retries. Gentle: this is a person-sized web app, not a bulk API. */
export const WOVEN_TEAM_TRANSPORT = {
  minIntervalMs: 750,
  requestTimeoutMs: 30_000,
  downloadTimeoutMs: 90_000,
  maxRetries: 3,
  baseBackoffMs: 1_000,
  maxRetryAfterMs: 60_000,
  maxRedirects: 6,
} as const;

type Env = Readonly<Record<string, string | undefined>>;

function readFlag(env: Env, name: string): boolean {
  const raw = (env[name] ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

/** GUIDs compare without case or braces: Woven shows them upper-case, a page may not. */
export function sameCompanyId(a: string, b: string): boolean {
  const norm = (v: string) => v.trim().replace(/^\{|\}$/g, "").toLowerCase();
  return norm(a).length > 0 && norm(a) === norm(b);
}

/** Company names compare without case, extra spaces or `&amp;`. */
export function sameCompanyName(a: string, b: string): boolean {
  const norm = (v: string) => v.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a).length > 0 && norm(a) === norm(b);
}

function sameOrigin(raw: string): boolean {
  try {
    return new URL(raw.trim()).origin === WOVEN_WEB_APP_ORIGIN && new URL(raw.trim()).pathname === "/";
  } catch {
    return false;
  }
}

/**
 * Every company-bearing variable must agree with the pin. Returns one sentence
 * per variable that does not, naming the variable only.
 */
export function tenantProblems(env: Env): string[] {
  const out: string[] = [];
  const pinned = `${WOVEN_TENANT.brand} company (${WOVEN_TENANT.companyName}, ${WOVEN_TENANT.companyId})`;
  const id = (env[WOVEN_BCS_COMPANY_ID_ENV] ?? "").trim();
  if (id && !sameCompanyId(id, WOVEN_TENANT.companyId)) out.push(`${WOVEN_BCS_COMPANY_ID_ENV} is not the ${pinned}.`);
  const name = (env[WOVEN_BCS_COMPANY_NAME_ENV] ?? "").trim();
  if (name && !sameCompanyName(name, WOVEN_TENANT.companyName)) out.push(`${WOVEN_BCS_COMPANY_NAME_ENV} is not the ${pinned}.`);
  const legacyId = (env[INHERITED_TENANT_ENV.companyId] ?? "").trim();
  if (legacyId && !sameCompanyId(legacyId, WOVEN_TENANT.companyId)) out.push(`${INHERITED_TENANT_ENV.companyId} names another Woven company than the ${pinned}.`);
  const legacyName = (env[INHERITED_TENANT_ENV.company] ?? "").trim();
  if (legacyName && !sameCompanyName(legacyName, WOVEN_TENANT.companyName)) out.push(`${INHERITED_TENANT_ENV.company} names another Woven company than the ${pinned}.`);
  const legacyBase = (env[INHERITED_TENANT_ENV.baseUrl] ?? "").trim();
  if (legacyBase && !sameOrigin(legacyBase)) out.push(`${INHERITED_TENANT_ENV.baseUrl} is not ${WOVEN_WEB_APP_ORIGIN}, the only Woven origin Ask Bubbles reads.`);
  return out;
}

export function readWovenKnowledgeConfig(env: Env = process.env): WovenKnowledgeConfig {
  const problems: string[] = [];
  const username = (env[WOVEN_BCS_USERNAME_ENV] ?? "").trim();
  /* A password is not trimmed: surrounding whitespace can be part of it. */
  const password = env[WOVEN_BCS_PASSWORD_ENV] ?? "";

  const missingCredentials: string[] = [];
  if (!username) missingCredentials.push(WOVEN_BCS_USERNAME_ENV);
  if (password.length === 0) missingCredentials.push(WOVEN_BCS_PASSWORD_ENV);
  /* The Company ID is a required confirmation: unset, nothing runs. */
  if (!(env[WOVEN_BCS_COMPANY_ID_ENV] ?? "").trim()) missingCredentials.push(WOVEN_BCS_COMPANY_ID_ENV);

  const tenant = tenantProblems(env);
  const tenantProblem = tenant.length > 0 ? `${tenant.join(" ")} Woven knowledge sync will not start.` : null;
  if (tenantProblem) problems.push(tenantProblem);

  const enabled = readFlag(env, WOVEN_KNOWLEDGE_SYNC_ENABLED_ENV);
  if (enabled && missingCredentials.length > 0) {
    problems.push(
      `${WOVEN_KNOWLEDGE_SYNC_ENABLED_ENV} is on but ${missingCredentials.join(", ")} ${
        missingCredentials.length === 1 ? "is" : "are"
      } not set.`,
    );
  }

  return {
    enabled,
    baseUrl: WOVEN_WEB_APP_ORIGIN,
    tenantProblem,
    downloads: { fileLibrary: readFlag(env, WOVEN_BCS_FILE_LIBRARY_DOWNLOAD_ENABLED_ENV) },
    /* A foreign company withholds the credentials too: nothing can sign in on its behalf. */
    credentials: missingCredentials.length === 0 && !tenantProblem ? { username, password } : null,
    missingCredentials,
    problems,
    previewTestModeAllowed: previewTestModeAllowed(env),
  };
}
