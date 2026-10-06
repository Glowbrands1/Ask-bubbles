import "server-only";

import { isDueForContinue, runKnowledgeSync, type EngineDeps, type RunOutcome } from "../engine";
import { MemoryKnowledgeSyncStore } from "../memory-store";
import { SinkError, type KnowledgeSink, type KnowledgeSyncStore } from "../ports";
import { createSupabaseKnowledgeSink } from "../sink";
import { createSupabaseKnowledgeSyncStore, KnowledgeSyncStoreError } from "../store";
import type { ContentType, KnowledgeSourceConnector, ManifestItem, RunMode, RunTrigger, SyncSettings } from "../types";
import { BcsConnectorError, BuffCitySoapWovenConnector } from "./bcs/connector";
import { BCS_COMPANY_WIDE_AUDIENCE_LABELS, BCS_CONTENT_TYPES } from "./bcs/contract";
import { bcsAudienceRestriction, bcsOwnershipHold } from "./bcs/policy";
import { WOVEN_TENANT } from "@/config/company/woven";
import { readWovenKnowledgeConfig, WOVEN_KNOWLEDGE_SYNC_ENABLED_ENV, type WovenKnowledgeConfig } from "./config";
import { describeWovenItem } from "./describe";
import { WovenTeamClient } from "./http";

/**
 * ============================================================================
 * THE WOVEN KNOWLEDGE SYNC — what the routes call
 * ============================================================================
 *
 * "Test Connection", "Run Initial Scan", "Sync Now" and the scheduled tick all
 * land here and all run `runKnowledgeSync` — there is no separate manual or
 * automatic implementation.
 *
 * TIME BUDGET. A route may run for 300 s. The engine stops starting new items
 * at 240 s and the HTTP client stops starting requests at 270 s, so the run is
 * always recorded. Anything not reached is `deferred` and finished by the next
 * daily tick in `continue` mode — which is how a large initial sync completes
 * unattended.
 */

export const SCHEDULE_REQUESTER = "schedule";
const ITEM_BUDGET_MS = 240_000;
const REQUEST_BUDGET_MS = 270_000;

export type WovenRunOutcome =
  | (RunOutcome & { previewTestMode?: true })
  | { status: "disabled"; reason: string }
  | { status: "not_configured"; missing: string[] };

/** The content types this deployment reads: Buff City Soap's (no Courses or Knowledge Elements). */
export const WOVEN_CONTENT_TYPES: readonly ContentType[] = BCS_CONTENT_TYPES;

/**
 * The rules a run classifies with. Production always uses Buff City Soap's
 * (`BCS_SYNC_POLICY`); tests of the shared engine against the reference
 * platform's fixtures may pass that platform's rules instead.
 */
export interface WovenSyncPolicy {
  contentTypes: readonly ContentType[];
  companyWideLabels: readonly string[];
  hold?: EngineDeps["hold"];
  audienceRestriction?: EngineDeps["audienceRestriction"];
}

export const BCS_SYNC_POLICY: WovenSyncPolicy = {
  contentTypes: WOVEN_CONTENT_TYPES,
  companyWideLabels: BCS_COMPANY_WIDE_AUDIENCE_LABELS,
  hold: bcsOwnershipHold,
  audienceRestriction: bcsAudienceRestriction,
};

/**
 * The sink used in PREVIEW TEST MODE. A preview never writes to Ask Bubbles —
 * the engine returns before applying anything — and this makes that a
 * guarantee rather than a property of the engine: every write throws. The one
 * read (titles of hand-uploaded documents, for the duplicate count) passes
 * through unchanged.
 */
export function readOnlySink(inner: KnowledgeSink): KnowledgeSink {
  const refuse = async (): Promise<never> => {
    throw new SinkError("preview_test_mode", "Preview test mode never writes to Ask Bubbles.", false);
  };
  return {
    ingest: refuse,
    updateMetadata: refuse,
    retire: refuse,
    countManualTitleMatches: (titles) => inner.countManualTitleMatches(titles),
  };
}

/**
 * The store for this run. Normally the Supabase store. In PREVIEW TEST MODE —
 * a preview, outside Production, with the knowledge-sync tables not installed —
 * an in-memory store that lives only as long as this request, so the dry run
 * reads Woven and returns its report without persisting any sync state.
 */
async function storeForRun(
  mode: RunMode,
  config: WovenKnowledgeConfig,
  supabaseStore: () => KnowledgeSyncStore,
): Promise<{ store: KnowledgeSyncStore; testMode: boolean }> {
  const store = supabaseStore();
  if (mode !== "preview") return { store, testMode: false };
  try {
    await store.loadSettings("woven");
    return { store, testMode: false };
  } catch (error) {
    const missing = error instanceof KnowledgeSyncStoreError && error.code === "sync_tables_missing";
    if (missing && config.previewTestModeAllowed) {
      return { store: new MemoryKnowledgeSyncStore(), testMode: true };
    }
    throw error;
  }
}

export interface WovenSyncOverrides {
  config?: WovenKnowledgeConfig;
  store?: KnowledgeSyncStore;
  /** Builds the Supabase store (injectable so tests can simulate missing tables). */
  supabaseStore?: () => KnowledgeSyncStore;
  sink?: KnowledgeSink;
  connector?: KnowledgeSourceConnector;
  now?: () => Date;
  contentTypes?: readonly ContentType[];
  /** Tests only: classify with other rules than Buff City Soap's. */
  policy?: WovenSyncPolicy;
}

function gate(config: WovenKnowledgeConfig): Extract<WovenRunOutcome, { status: "disabled" | "not_configured" }> | null {
  if (!config.enabled) return { status: "disabled", reason: `${WOVEN_KNOWLEDGE_SYNC_ENABLED_ENV} is not on, so nothing reaches Woven.` };
  /* The pinned tenant first: any company variable naming another company never reaches Woven. */
  if (config.tenantProblem) return { status: "disabled", reason: config.tenantProblem };
  if (!config.credentials) return { status: "not_configured", missing: config.missingCredentials };
  return null;
}

/**
 * THE ONLY CONNECTOR FACTORY. It returns the Buff City Soap connector, which
 * reads exactly `WOVEN_TENANT` and proves it by Company ID. There is no
 * switch, setting or argument that returns any other connector or company.
 */
export function createWovenKnowledgeConnector(config: WovenKnowledgeConfig, client: WovenTeamClient): BuffCitySoapWovenConnector {
  return new BuffCitySoapWovenConnector({ client, credentials: config.credentials!, downloads: config.downloads });
}

function buildConnector(config: WovenKnowledgeConfig, startedAt: number): BuffCitySoapWovenConnector {
  return createWovenKnowledgeConnector(config, new WovenTeamClient({ baseUrl: config.baseUrl, deadlineAt: startedAt + REQUEST_BUDGET_MS }));
}

export async function runWovenKnowledgeSync(
  options: { mode: RunMode; trigger: RunTrigger; requestedBy: string; confirmLargeRemoval?: boolean },
  overrides: WovenSyncOverrides = {},
): Promise<WovenRunOutcome> {
  const config = overrides.config ?? readWovenKnowledgeConfig();
  const closed = gate(config);
  if (closed) return closed;

  const now = overrides.now ?? (() => new Date());
  const startedAt = now().getTime();
  const { store, testMode } = overrides.store
    ? { store: overrides.store, testMode: false }
    : await storeForRun(options.mode, config, overrides.supabaseStore ?? createSupabaseKnowledgeSyncStore);
  const sink = overrides.sink ?? createSupabaseKnowledgeSink("woven");
  const policy = overrides.policy ?? BCS_SYNC_POLICY;
  const deps: EngineDeps = {
    connector: overrides.connector ?? buildConnector(config, startedAt),
    store,
    sink: testMode ? readOnlySink(sink) : sink,
    describe: describeWovenItem,
    companyWideLabels: policy.companyWideLabels,
    contentTypes: overrides.contentTypes ?? policy.contentTypes,
    now,
    deadlineAt: startedAt + ITEM_BUDGET_MS,
    hold: policy.hold,
    audienceRestriction: policy.audienceRestriction,
  };
  const outcome = await runKnowledgeSync(deps, options);
  return testMode && "runId" in outcome ? { ...outcome, previewTestMode: true } : outcome;
}

/* ------------------------------------------------------ test connection -- */

export type ConnectionTest =
  | { status: "ok"; company: string; companyId: string; handbooksVisible: number }
  | { status: "failed"; code: string; reason: string }
  | Extract<WovenRunOutcome, { status: "disabled" | "not_configured" }>;

/**
 * Signs in, proves the company by its ID and reads one small list. Writes
 * nothing anywhere. What "Test Connection" does.
 */
export async function testWovenConnection(overrides: { config?: WovenKnowledgeConfig; client?: WovenTeamClient } = {}): Promise<ConnectionTest> {
  const config = overrides.config ?? readWovenKnowledgeConfig();
  const closed = gate(config);
  if (closed) return closed;
  const client = overrides.client ?? new WovenTeamClient({ baseUrl: config.baseUrl, deadlineAt: Date.now() + 60_000 });
  const connector = createWovenKnowledgeConnector(config, client);
  try {
    const info = await connector.connect();
    const handbooks = await connector.list("handbook");
    if (!handbooks.ok) return { status: "failed", code: handbooks.code, reason: handbooks.message };
    return {
      status: "ok",
      company: info.companyLabel ?? WOVEN_TENANT.companyName,
      companyId: info.companyId ?? WOVEN_TENANT.companyId,
      handbooksVisible: handbooks.records.length,
    };
  } catch (error) {
    if (error instanceof BcsConnectorError) return { status: "failed", code: error.code, reason: error.message };
    return {
      status: "failed",
      code: (error as { code?: string }).code ? `woven_${(error as { code: string }).code}` : "woven_unexpected",
      reason: error instanceof Error ? error.message : "The connection test failed.",
    };
  }
}

/* ------------------------------------------------------------ schedule -- */

export type ScheduledWork =
  | { run: "sync" }
  | { run: "continue" }
  | { run: "none"; reason: "auto_sync_off" | "initial_sync_not_done" | "not_due" };

/** When the next automatic full sync is due, or null before the initial sync. */
export function nextAutomaticSyncAt(settings: SyncSettings): string | null {
  if (!settings.initialSyncCompletedAt) return null;
  const from = settings.lastFullScanAt ?? settings.initialSyncCompletedAt;
  return new Date(Date.parse(from) + settings.intervalDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The UTC hour in which a due FULL scan starts: the hourly tick's 09:40 run.
 * One attempt a day, so a scan that fails is retried the next day, not hourly.
 */
export const FULL_SYNC_HOUR_UTC = 9;

/**
 * What the hourly tick should do.
 *
 *   FULL SCAN     only when 30 days have passed since the last complete scan,
 *                 and only in the daily 09:xx UTC slot (a failed scan is tried
 *                 again the next day);
 *   CONTINUE      every hour, whenever work is due: items a run could not
 *                 reach in its time budget, and failed items whose retry time
 *                 has come. A continuation lists nothing — it does not rescan
 *                 Woven — and addresses the same documents, so nothing is
 *                 ingested twice. Deferred work never waits for the monthly scan;
 *   NOTHING       otherwise, without even signing in to Woven.
 */
export function decideScheduledWork(settings: SyncSettings, manifest: ManifestItem[], now: Date): ScheduledWork {
  if (!settings.initialSyncCompletedAt) return { run: "none", reason: "initial_sync_not_done" };
  if (!settings.autoSyncEnabled) return { run: "none", reason: "auto_sync_off" };
  const next = nextAutomaticSyncAt(settings)!;
  if (now.getTime() >= Date.parse(next) && now.getUTCHours() === FULL_SYNC_HOUR_UTC) return { run: "sync" };
  if (manifest.some((item) => isDueForContinue(item, now))) return { run: "continue" };
  return { run: "none", reason: "not_due" };
}

export async function runScheduledWovenKnowledgeTick(overrides: WovenSyncOverrides = {}): Promise<WovenRunOutcome | { status: "skipped"; reason: string }> {
  const config = overrides.config ?? readWovenKnowledgeConfig();
  const closed = gate(config);
  if (closed) return closed;
  const store = overrides.store ?? createSupabaseKnowledgeSyncStore();
  const now = overrides.now ?? (() => new Date());
  const work = decideScheduledWork(await store.loadSettings("woven"), await store.loadManifest("woven"), now());
  if (work.run === "none") return { status: "skipped", reason: work.reason };
  return runWovenKnowledgeSync({ mode: work.run, trigger: "schedule", requestedBy: SCHEDULE_REQUESTER }, { ...overrides, config, store });
}
