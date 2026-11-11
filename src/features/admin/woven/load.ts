import "server-only";

import vercelConfig from "../../../../vercel.json";
import { isDemoMode } from "@/lib/config/runtime";
import { supabaseReadiness } from "@/lib/config/server-env";
import { loadAccessPreviewRows } from "@/lib/employees/woven/access-preview";
import { readWovenAccessMode, type WovenAccessMode } from "@/lib/employees/woven/access/config";
import { loadAccessPlan, type AccessPlan } from "@/lib/employees/woven/access/load";
import { AutoSyncError, readAutoSync, wovenCronSchedule } from "@/lib/employees/woven/auto-sync";
import { describeDaily, nextDailyRun } from "@/lib/employees/woven/auto-sync-schedule";
import { readWovenConfig } from "@/lib/employees/woven/config";
import { validationAccessCodeConfigured } from "@/lib/employees/woven/validation-access";
import { loadChangePage, loadDirectoryRows, loadEmployeeDetail, loadRuns } from "@/lib/employees/woven/directory";
import { listWovenLocations } from "@/lib/employees/woven/locations";
import { listWovenPositions } from "@/lib/employees/woven/positions";
import {
  readOverviewCounts,
  readWovenSyncStatus,
  WovenStatusError,
  type WovenSyncStatus,
} from "@/lib/employees/woven/status";
import type {
  AccessPreviewRow,
  ChangePage,
  DirectoryPage,
  EmployeeDetail,
  LocationMappingRow,
  OverviewCounts,
  PositionMappingRow,
  RunRow,
} from "@/lib/employees/woven/view-types";
import {
  employeeDetailFrom,
  parseChangeQuery,
  parseDirectoryQuery,
  parseEmployeeRowId,
  queryChanges,
  queryDirectory,
} from "@/lib/employees/woven/views";
import { wovenSampleForThisDeployment } from "./sample";
import { sampleAccessPlan } from "./sample-plan";

/**
 * Everything the Woven Employee Sync screens show, read on the server.
 *
 * EVERY STATE ON THE SCREEN IS MEASURED OR EVIDENCED, NOT DECLARED:
 *
 *   credentials         which variables are set, by NAME — never a value
 *   sign-in             only from a recorded run that got past the token
 *                       exchange; nothing else proves it
 *   directory           the database's own answer, and a missing table is kept
 *                       apart from a database that did not answer
 *   daily schedule      the cron entry must be in THIS BUILD'S vercel.json, the
 *                       switch must be on, AND a scheduled run must have
 *                       succeeded. A switch alone proves nothing.
 *
 * SAMPLE OR REAL, NEVER BOTH. In a demo build (`sample.ts`) the tabs render the
 * labelled sample set and read nothing from Supabase; otherwise they read the
 * database and never the sample.
 */

export const WOVEN_CRON_PATH = "/api/employees/woven/cron";

export type DatabaseState =
  | { state: "ready"; status: WovenSyncStatus }
  | { state: "missing" }
  | { state: "unavailable"; code: string | null }
  | { state: "unconfigured" };

/**
 * THE AUTO SYNC PANEL'S DATA. The setting comes from the database; the schedule
 * from THIS BUILD'S vercel.json; the readiness checks from the same switches the
 * server route enforces. Nothing is declared by hand.
 */
export interface AutoSyncPanelData {
  setting: { state: "ready"; enabled: boolean; updatedAt: string | null } | { state: "missing" } | { state: "unavailable"; code: string | null };
  /** null: this build does not schedule the cron at all. */
  schedule: { expression: string; description: string | null; nextRunAt: string | null } | null;
  readiness: { syncReady: boolean; writesEnabled: boolean; scheduled: boolean; directorySaved: boolean };
  lastSuccessAt: string | null;
  lastScheduledSuccessAt: string | null;
  recentRuns: { id: string; startedAt: string; scheduled: boolean; status: string; errorCode: string | null; employeesReceived: number; changesRecorded: number }[];
}

export interface WovenSyncPageProps {
  /** WOVEN_SYNC_ENABLED: "Run employee sync" may be used. */
  enabled: boolean;
  /** WOVEN_SYNC_WRITES_ENABLED: a sync may save. Shown only; the page never asks for a save. */
  syncWritesEnabled: boolean;
  /** WOVEN_VALIDATION_ENABLED: "Test Woven connection" may be used. Opens no sync. */
  validationEnabled: boolean;
  /** Whether WOVEN_VALIDATION_ACCESS_CODE is set (demo mode needs it). A yes/no — never the code. */
  validationAccessCodeConfigured: boolean;
  scheduleEnabled: boolean;
  /** Whether this build's vercel.json schedules the Woven cron route. */
  scheduleDeployed: boolean;
  /** False in demo mode, where the live check is refused by design. */
  liveMode: boolean;
  /** Credential variable names not yet set. Never values. */
  missingCredentials: string[];
  /** Which variables supplied the Woven login (names only), or null when none is configured. */
  credentialSource: "employee" | "knowledge_login" | null;
  /** Login-eligible email domains. Not secret. Empty: nobody is login-eligible. */
  loginEmailDomains: string[];
  database: DatabaseState;
  /** The Auto Sync panel; null in demo builds, which read nothing live. */
  autoSync: AutoSyncPanelData | null;
  /** The Overview's cards, when they could be read (or the sample's, in a demo build). */
  overview: OverviewCounts | null;
  /** The sample label when this screen is showing sample data. */
  sampleLabel: string | null;
}

export function cronDeployed(config: { crons?: { path: string }[] }): boolean {
  return (config.crons ?? []).some((c) => c.path === WOVEN_CRON_PATH);
}

export async function loadWovenSyncPage(): Promise<WovenSyncPageProps> {
  const config = readWovenConfig();
  const sample = await wovenSampleForThisDeployment();
  const base = {
    enabled: config.enabled,
    validationEnabled: config.validationEnabled,
    syncWritesEnabled: config.writesEnabled,
    validationAccessCodeConfigured: validationAccessCodeConfigured(),
    scheduleEnabled: config.scheduleEnabled,
    scheduleDeployed: cronDeployed(vercelConfig as { crons?: { path: string }[] }),
    liveMode: !isDemoMode(),
    missingCredentials: config.missingCredentials,
    credentialSource: config.credentialSource,
    loginEmailDomains: sample ? [...sample.loginEmailDomains] : config.loginEmailDomains,
    overview: sample?.overview ?? null,
    sampleLabel: sample?.label ?? null,
  };

  if (!supabaseReadiness().ready) return { ...base, autoSync: null, database: { state: "unconfigured" } };

  try {
    const status = await readWovenSyncStatus();
    const overview = sample ? sample.overview : await readOverviewCounts();
    const autoSync = sample || isDemoMode() ? null : await loadAutoSyncPanel(config, status);
    /* The schedule step reads the DATABASE setting, not the retired environment switch. */
    const scheduleEnabled = autoSync?.setting.state === "ready" ? autoSync.setting.enabled : false;
    return { ...base, scheduleEnabled, autoSync, overview, database: { state: "ready", status } };
  } catch (error) {
    if (error instanceof WovenStatusError && error.reason === "missing") {
      return { ...base, autoSync: null, database: { state: "missing" } };
    }
    return {
      ...base,
      autoSync: null,
      database: { state: "unavailable", code: error instanceof WovenStatusError ? error.code : null },
    };
  }
}

async function loadAutoSyncPanel(config: ReturnType<typeof readWovenConfig>, status: WovenSyncStatus): Promise<AutoSyncPanelData> {
  const cron = wovenCronSchedule();
  const schedule = cron
    ? {
        expression: cron.expression,
        description: cron.daily ? describeDaily(cron.daily) : null,
        nextRunAt: cron.daily ? nextDailyRun(cron.daily, new Date()).toISOString() : null,
      }
    : null;
  let setting: AutoSyncPanelData["setting"];
  try {
    const read = await readAutoSync();
    setting = { state: "ready", enabled: read.enabled, updatedAt: read.updatedAt };
  } catch (error) {
    setting = error instanceof AutoSyncError && error.code === "setting_missing" ? { state: "missing" } : { state: "unavailable", code: error instanceof AutoSyncError ? error.code : null };
  }
  return {
    setting,
    schedule,
    readiness: {
      syncReady: !config.tenantProblem && config.enabled && config.missingCredentials.length === 0,
      writesEnabled: config.writesEnabled,
      scheduled: schedule !== null,
      directorySaved: status.lastSuccessAt !== null,
    },
    lastSuccessAt: status.lastSuccessAt,
    lastScheduledSuccessAt: status.lastCronSuccessAt,
    recentRuns: status.recentRuns.slice(0, 8).map((r) => ({
      id: r.id,
      startedAt: r.startedAt,
      scheduled: r.requestedBy === "cron",
      status: r.status,
      errorCode: r.errorCode,
      employeesReceived: r.employeesReceived,
      changesRecorded: r.changesRecorded,
    })),
  };
}

/* ------------------------------------------------------------- the tabs -- */

export const WOVEN_VIEWS = ["directory", "changes", "runs", "mappings", "preview"] as const;
export type WovenView = (typeof WOVEN_VIEWS)[number];

export function isWovenView(value: string): value is WovenView {
  return (WOVEN_VIEWS as readonly string[]).includes(value);
}

/**
 * Which tabs show people. They need `manage_users` as well as
 * `manage_integrations`; Sync History is counts only.
 */
export function viewShowsPeople(view: WovenView): boolean {
  return view !== "runs";
}

export type ViewData =
  | { view: "directory"; page: DirectoryPage }
  | { view: "changes"; page: ChangePage }
  | { view: "runs"; runs: RunRow[] }
  | { view: "mappings"; locations: LocationMappingRow[]; positions: PositionMappingRow[] }
  | {
      view: "preview";
      plan: AccessPlanState;
      accessMode: WovenAccessMode;
      actionFilter: string | null;
      loginEmailDomains: string[];
      sampleRows: AccessPreviewRow[] | null;
    };

export type AccessPlanState = { state: "ready"; plan: AccessPlan } | { state: "not_applied" } | { state: "unavailable"; code: string | null };

export type ViewState =
  | { state: "ready"; data: ViewData }
  | { state: "missing" }
  | { state: "unavailable"; code: string | null }
  | { state: "unconfigured" };

export interface WovenViewProps {
  view: WovenView;
  sampleLabel: string | null;
  /** False in demo mode: the routes behind every action refuse there. */
  liveMode: boolean;
  content: ViewState;
}

type Params = Record<string, string | string[] | undefined>;

export async function loadWovenView(view: WovenView, params: Params): Promise<WovenViewProps> {
  const sample = await wovenSampleForThisDeployment();
  const common = { view, sampleLabel: sample?.label ?? null, liveMode: !isDemoMode() };

  if (sample) {
    const data: ViewData = (() => {
      switch (view) {
        case "directory":
          return { view, page: queryDirectory(sample.directory, parseDirectoryQuery(params)) };
        case "changes":
          return { view, page: queryChanges(sample.changes, parseChangeQuery(params)) };
        case "runs":
          return { view, runs: [...sample.runs] };
        case "mappings":
          return { view, locations: [...sample.locations], positions: [...sample.positions] };
        case "preview":
          return {
            view,
            plan: { state: "ready", plan: sampleAccessPlan(sample) },
            accessMode: "off",
            actionFilter: firstParam(params.action),
            loginEmailDomains: [...sample.loginEmailDomains],
            sampleRows: [...sample.accessPreview],
          };
      }
    })();
    return { ...common, content: { state: "ready", data } };
  }

  if (!supabaseReadiness().ready) return { ...common, content: { state: "unconfigured" } };

  try {
    const data: ViewData = await (async (): Promise<ViewData> => {
      switch (view) {
        case "directory":
          return { view, page: queryDirectory(await loadDirectoryRows(), parseDirectoryQuery(params)) };
        case "changes":
          return { view, page: await loadChangePage(parseChangeQuery(params)) };
        case "runs":
          return { view, runs: await loadRuns() };
        case "mappings": {
          const [locations, positions] = await Promise.all([listWovenLocations(), listWovenPositions()]);
          return { view, locations, positions };
        }
        case "preview": {
          const domains = readWovenConfig().loginEmailDomains;
          /* The legacy rows still drive the Active employee check (and prove the directory is there). */
          await loadAccessPreviewRows(domains);
          return {
            view,
            plan: await loadPlanState(),
            accessMode: readWovenAccessMode().mode,
            actionFilter: firstParam(params.action),
            loginEmailDomains: domains,
            sampleRows: null,
          };
        }
      }
    })();
    return { ...common, content: { state: "ready", data } };
  } catch (error) {
    if (error instanceof WovenStatusError && error.reason === "missing") return { ...common, content: { state: "missing" } };
    return { ...common, content: { state: "unavailable", code: error instanceof WovenStatusError ? error.code : null } };
  }
}

/* ------------------------------------------------------ one employee -- */

export type EmployeeState =
  | { state: "ready"; detail: EmployeeDetail }
  | { state: "not_found" }
  | { state: "missing" }
  | { state: "unavailable"; code: string | null }
  | { state: "unconfigured" };

export interface WovenEmployeeProps {
  sampleLabel: string | null;
  liveMode: boolean;
  content: EmployeeState;
}

/**
 * One employee's page. The same rules as the tabs: sample OR real, never
 * both; a missing migration and a database that did not answer are told apart;
 * an id that is not well-formed is "not found" without a query.
 */
export async function loadWovenEmployee(rawId: string): Promise<WovenEmployeeProps> {
  const sample = await wovenSampleForThisDeployment();
  const common = { sampleLabel: sample?.label ?? null, liveMode: !isDemoMode() };
  const id = parseEmployeeRowId(rawId);

  if (sample) {
    const detail = id ? employeeDetailFrom(sample.directory, sample.changes, id) : null;
    return { ...common, content: detail ? { state: "ready", detail } : { state: "not_found" } };
  }
  if (!supabaseReadiness().ready) return { ...common, content: { state: "unconfigured" } };
  if (!id) return { ...common, content: { state: "not_found" } };

  try {
    const detail = await loadEmployeeDetail(id);
    return { ...common, content: detail ? { state: "ready", detail } : { state: "not_found" } };
  } catch (error) {
    if (error instanceof WovenStatusError && error.reason === "missing") return { ...common, content: { state: "missing" } };
    return { ...common, content: { state: "unavailable", code: error instanceof WovenStatusError ? error.code : null } };
  }
}

/* ------------------------------------------------------- access plan -- */

function firstParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && /^[A-Za-z_]{1,40}$/.test(v) ? v : null;
}

/** The plan, or why there is none: the access-sync migration not applied is not the same as a database that did not answer. */
async function loadPlanState(): Promise<AccessPlanState> {
  try {
    return { state: "ready", plan: await loadAccessPlan() };
  } catch (error) {
    if (error instanceof WovenStatusError && error.reason === "missing") return { state: "not_applied" };
    return { state: "unavailable", code: error instanceof WovenStatusError ? error.code : null };
  }
}

