import "server-only";

import { storesTableEnabled } from "@/lib/config/chat-quality-flags";
import type { CompanyLocation } from "@/lib/locations";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { buildStoreIndex, primeStoreIndex, type StoreAlias } from "./resolver";

/**
 * Loads `public.stores` and the mapped rows of `woven_location_map` into
 * the resolver. A missing table, or the flag off, leaves the in-memory
 * roster. Nothing is written.
 */

interface StoreRow {
  id: string;
  code: string;
  name: string;
  state: string | null;
  district_id: string | null;
}

interface MapRow {
  woven_location_name: string | null;
  woven_location_number: string | null;
  location_id: string | null;
  status: string;
}

export async function primeStoresFromTable(): Promise<void> {
  if (!storesTableEnabled()) {
    primeStoreIndex(null);
    return;
  }
  try {
    const admin = getSupabaseAdmin();
    const stores = await admin.from("stores").select("id, code, name, state, district_id");
    if (stores.error || !stores.data?.length) {
      primeStoreIndex(null);
      return;
    }
    const mapped = await admin
      .from("woven_location_map")
      .select("woven_location_name, woven_location_number, location_id, status")
      .eq("status", "mapped");
    const locations: CompanyLocation[] = (stores.data as StoreRow[]).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      state: row.state,
      districtId: row.district_id,
      districtName: null,
      regionId: null,
      regionName: null,
    }));
    const aliases: StoreAlias[] = [];
    for (const row of (mapped.data ?? []) as MapRow[]) {
      if (!row.location_id) continue;
      if (row.woven_location_name?.trim()) {
        aliases.push({ storeId: row.location_id, kind: "woven_name", text: row.woven_location_name.trim() });
      }
      if (row.woven_location_number?.trim()) {
        aliases.push({ storeId: row.location_id, kind: "woven_number", text: row.woven_location_number.trim() });
      }
    }
    primeStoreIndex(buildStoreIndex({ stores: locations, extraAliases: aliases }));
  } catch {
    primeStoreIndex(null);
  }
}
