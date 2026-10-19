import "server-only";

import { PINNED_COMPANY_ID } from "@/lib/employees/woven/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { COMPANY_LOCATION_ABBREVIATIONS, COMPANY_LOCATION_NICKNAMES } from "@/config/company/locations";

import { buildStoreIndex, type StoreAlias, type StoreIndex } from "./resolver";

/**
 * ============================================================================
 * THE NAMES AND NUMBERS WOVEN USES FOR A REGISTERED STORE
 * ============================================================================
 *
 * READ-ONLY, AND ONLY WHAT A PERSON HAS MAPPED. A Woven location is a name for
 * a registered store only where `woven_location_map` says `mapped` — set by a
 * reviewer, never inferred from matching digits (Woven 225 is the Omaha store,
 * not store 225). Unmapped, ignored and closed rows contribute nothing, and
 * only the pinned company's rows are read.
 *
 * NEVER FAILS A CONVERSATION. A read error returns no aliases, and the
 * resolver then works from the registered roster alone — the same answer it
 * gave before Woven names existed, not a guess.
 *
 * The result is cached briefly: the map changes when a reviewer decides, not
 * per message.
 */

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; aliases: StoreAlias[] } | null = null;

export function clearWovenStoreAliasCache(): void {
  cache = null;
}

export async function loadWovenStoreAliases(now: number = Date.now()): Promise<StoreAlias[]> {
  if (cache && now - cache.at < TTL_MS) return cache.aliases;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("woven_location_map")
      .select("woven_location_name, woven_display_name, woven_location_number, location_id, is_closed")
      .eq("status", "mapped")
      .eq("woven_company_id", PINNED_COMPANY_ID)
      .limit(1000);
    if (error) return [];

    const aliases: StoreAlias[] = [];
    for (const row of data ?? []) {
      const storeId = typeof row.location_id === "string" ? row.location_id : null;
      if (!storeId || row.is_closed === true) continue;
      for (const name of [row.woven_location_name, row.woven_display_name]) {
        if (typeof name === "string" && name.trim()) aliases.push({ storeId, kind: "woven_name", text: name.trim() });
      }
      if (typeof row.woven_location_number === "string" && row.woven_location_number.trim()) {
        aliases.push({ storeId, kind: "woven_number", text: row.woven_location_number.trim() });
      }
    }
    cache = { at: now, aliases };
    return aliases;
  } catch {
    return [];
  }
}

/**
 * The index every server caller reads a store through: the registered roster,
 * the reviewed company nicknames and abbreviations, and the Woven names a
 * person mapped to a registered store.
 */
export async function loadStoreIndex(): Promise<StoreIndex> {
  return buildStoreIndex({
    nicknames: COMPANY_LOCATION_NICKNAMES,
    abbreviations: COMPANY_LOCATION_ABBREVIATIONS,
    extraAliases: await loadWovenStoreAliases(),
  });
}

let titleCache: { at: number; titles: string[] } | null = null;

export function clearKnownTitleCache(): void {
  titleCache = null;
}

/**
 * The job titles Woven holds, for telling a title from a name. Names of
 * positions only — no employee data — read from the position queue the sync
 * keeps. Never fails a conversation: an error is an empty list.
 */
export async function loadKnownTitles(now: number = Date.now()): Promise<string[]> {
  if (titleCache && now - titleCache.at < TTL_MS) return titleCache.titles;
  try {
    const { data, error } = await getSupabaseAdmin().from("woven_position_map").select("woven_position_name").limit(1000);
    if (error) return [];
    const titles = [
      ...new Set(
        (data ?? [])
          .map((row) => (typeof row.woven_position_name === "string" ? row.woven_position_name.trim() : ""))
          .filter((title) => title.length > 0),
      ),
    ];
    titleCache = { at: now, titles };
    return titles;
  } catch {
    return [];
  }
}
