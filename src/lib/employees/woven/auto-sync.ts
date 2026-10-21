import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import vercelConfig from "../../../../vercel.json";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { parseDailyCron, type DailySchedule } from "./auto-sync-schedule";

/**
 * ============================================================================
 * AUTO SYNC — the ON/OFF setting, in the database
 * ============================================================================
 *
 * The cron route reads this on every tick. FAIL CLOSED: if the setting cannot be
 * read, the answer is "do not run" and the reason is a code, never a guess.
 * Turning it ON is refused (by the database function, not only here) until a
 * stored sync has saved the directory.
 *
 * Nothing here runs a sync, reads Woven, or touches an account.
 */

export const WOVEN_EMPLOYEE_CRON_PATH = "/api/employees/woven/cron";

export type AutoSyncErrorCode = "auto_sync_requires_saved_directory" | "setting_missing" | "store_unavailable";

export class AutoSyncError extends Error {
  readonly code: AutoSyncErrorCode;
  constructor(code: AutoSyncErrorCode) {
    super(
      code === "auto_sync_requires_saved_directory"
        ? "Automatic sync can be turned on only after a stored sync has saved the directory."
        : code === "setting_missing"
          ? "The Auto Sync setting table does not exist in this database yet."
          : "The Auto Sync setting could not be read or changed.",
    );
    this.name = "AutoSyncError";
    this.code = code;
  }
}

export interface AutoSyncSetting {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const MISSING = new Set(["42P01", "PGRST205", "PGRST200", "42883", "PGRST202"]);

function classify(error: { code?: string | null; message?: string | null } | null | undefined): AutoSyncError {
  if (error?.message?.includes("auto_sync_requires_saved_directory")) return new AutoSyncError("auto_sync_requires_saved_directory");
  if (error?.code && MISSING.has(error.code)) return new AutoSyncError("setting_missing");
  return new AutoSyncError("store_unavailable");
}

export async function readAutoSync(client: SupabaseClient = getSupabaseAdmin()): Promise<AutoSyncSetting> {
  const { data, error } = await client.from("employee_sync_settings").select("auto_sync_enabled, updated_at, updated_by").maybeSingle();
  if (error) throw classify(error);
  if (!data) throw new AutoSyncError("setting_missing");
  const row = data as Record<string, unknown>;
  return {
    enabled: row.auto_sync_enabled === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    updatedBy: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

export async function setAutoSync(enabled: boolean, actor: string, client: SupabaseClient = getSupabaseAdmin()): Promise<{ enabled: boolean; changed: boolean }> {
  const { data, error } = await client.rpc("employee_sync_set_auto", { p_enabled: enabled, p_actor: actor });
  if (error) throw classify(error);
  const result = (data ?? {}) as { enabled?: boolean; changed?: boolean };
  return { enabled: result.enabled === true, changed: result.changed === true };
}

/** The schedule this build's vercel.json gives the Woven employee cron, or null when it has none (or an unrecognised shape). */
export function wovenCronSchedule(config: { crons?: { path: string; schedule: string }[] } = vercelConfig): { expression: string; daily: DailySchedule | null } | null {
  const entry = (config.crons ?? []).find((c) => c.path === WOVEN_EMPLOYEE_CRON_PATH);
  return entry ? { expression: entry.schedule, daily: parseDailyCron(entry.schedule) } : null;
}
