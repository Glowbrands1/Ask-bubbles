import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AccessScope } from "@/types";

import { rosterStoreScopedEnabled } from "@/lib/config/chat-quality-flags";

import { isServiceAccountName, type RosterEmployee } from "./employee-match";
import { authorizedLocationIds } from "./location-scope";
import { isNonPersonWovenId } from "./roster-non-person";

/**
 * Directory ids the grounded path already chose. Unset, the scoped roster
 * is the one `loadScopedRoster` already returned. An empty set does not filter.
 */
const rosterLimit = new AsyncLocalStorage<ReadonlySet<string>>();

export function withRosterLimit<T>(ids: readonly string[] | null, run: () => T): T {
  if (!ids || ids.length === 0) return rosterLimit.run(new Set(), run);
  return rosterLimit.run(new Set(ids), run);
}

/**
 * ============================================================================
 * THE EMPLOYEES A FORM-FILER MAY NAME — FROM THE WOVEN DIRECTORY, IN SCOPE
 * ============================================================================
 *
 * READ-ONLY USE OF THE PHASE-ONE DIRECTORY. `employee_access_directory` is the
 * observe-only Woven sync (docs/woven-employee-sync.md). Nothing here writes to
 * it, and nothing here grants access: it is read to check a SPELLING and to
 * learn which location an employee works at, after the actor's own scope has
 * already decided which locations they may file against.
 *
 * SCOPE IS APPLIED HERE, BEFORE ANY NAME LEAVES THE SERVER:
 *
 *   location     employees with an active, person-mapped affiliation at one of the
 *             actor's own locations. Nobody else is ever a candidate.
 *   global    every active employee — a global scope excludes no location.
 *   district  employees at the locations the area contains, resolved through
 *   region    the location roster (`authorizedLocationIds`). An area the roster
 *             does not know resolves to no location, so to NOBODY — and an
 *             empty roster means the typed name is used as typed.
 *   demo      NOBODY. A demo actor has no verified scope.
 *
 * FAILS TO "UNCHECKED", NEVER TO "EVERYONE". Any read error returns an empty
 * roster, and an empty roster changes nothing about the form: the name the
 * manager typed is used, as it always was.
 *
 * TERMINATED EMPLOYEES ARE LEFT OUT. A coaching form is about somebody on the
 * team today. `unknown` statuses stay in — the sync never reads `unknown` as
 * terminated, and neither does this.
 *
 * SHARED AND SERVICE ACCOUNTS ARE LEFT OUT. "Risk Management", "No Manager"
 * and "GlowBrands IT Support" are directory rows, not people; a row is left
 * out only when every word of its name is a department, role or system word.
 * See `isServiceAccountName`. The directory itself is never changed.
 */

export interface DirectoryRosterRow {
  readonly id: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly preferredFirstName: string | null;
  readonly employmentStatus: string | null;
  readonly locationIds: readonly string[];
  readonly positionName?: string | null;
  readonly lastSyncedAt?: string | null;
}

/** Restricts the directory to what this actor may see. Pure. */
export function scopeRoster(
  rows: readonly DirectoryRosterRow[],
  scope: AccessScope | null,
): RosterEmployee[] {
  if (!scope) return [];
  // Area scopes resolve through the location roster; an unknown area resolves to none.
  const allowed = scope.level === "global" ? null : new Set(authorizedLocationIds(scope));
  if (allowed && allowed.size === 0) return [];

  const roster: RosterEmployee[] = [];
  for (const row of rows) {
    if (row.employmentStatus === "terminated") continue;
    const first = row.firstName?.trim() ?? "";
    const last = row.lastName?.trim() ?? "";
    if (!first || !last) continue;
    // "Risk Management", "No Manager": a shared or service account, never a suggestion.
    if (isServiceAccountName(first, last)) continue;
    const locationIds = allowed ? row.locationIds.filter((id) => allowed.has(id)) : [...row.locationIds];
    if (allowed && locationIds.length === 0) continue;
    roster.push({
      id: row.id,
      firstName: first,
      lastName: last,
      preferredFirstName: row.preferredFirstName?.trim() || null,
      locationIds,
      positionName: row.positionName?.trim() || null,
      employmentStatus: row.employmentStatus,
      lastSyncedAt: row.lastSyncedAt ?? null,
    });
  }
  return roster;
}

/**
 * The whole directory, joined to configured locations through the
 * person-reviewed location map, which stores the `loc-<code>` id directly.
 * Three small reads joined in memory.
 */
export async function readDirectoryRoster(): Promise<DirectoryRosterRow[]> {
  const supabase = getSupabaseAdmin();
  const [people, affiliations, map] = await Promise.all([
    supabase
      .from("employee_access_directory")
      .select("id, first_name, last_name, preferred_first_name, employment_status, position_name, last_synced_at")
      .limit(5000),
    supabase
      .from("employee_location_affiliations")
      .select("employee_id, woven_location_id")
      .eq("active", true)
      .limit(20000),
    supabase
      .from("woven_location_map")
      .select("woven_location_id, location_id")
      .eq("status", "mapped")
      .limit(1000),
  ]);
  if (people.error || affiliations.error || map.error) {
    throw new Error("The employee directory could not be read.");
  }

  const locationByWoven = new Map<string, string>();
  for (const row of map.data ?? []) {
    if (typeof row.location_id === "string" && row.location_id.startsWith("loc-")) {
      locationByWoven.set(String(row.woven_location_id), row.location_id);
    }
  }
  const locationsByEmployee = new Map<string, Set<string>>();
  for (const row of affiliations.data ?? []) {
    const location = locationByWoven.get(String(row.woven_location_id));
    if (!location) continue;
    const key = String(row.employee_id);
    if (!locationsByEmployee.has(key)) locationsByEmployee.set(key, new Set());
    locationsByEmployee.get(key)!.add(location);
  }

  return (people.data ?? []).map((row) => ({
    id: String(row.id),
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    preferredFirstName: (row.preferred_first_name as string | null) ?? null,
    employmentStatus: (row.employment_status as string | null) ?? null,
    positionName: (row.position_name as string | null) ?? null,
    lastSyncedAt: (row.last_synced_at as string | null) ?? null,
    locationIds: [...(locationsByEmployee.get(String(row.id)) ?? [])].sort(),
  }));
}

/**
 * What a roster read could and could not establish. `unavailable` is a failed
 * read; `not_checked` is a scope that has no roster to read (preview mode, or an
 * area scope the location roster does not yet resolve). Neither is "nobody".
 */
export type ScopedRosterResult =
  | { status: "ok"; roster: RosterEmployee[] }
  | { status: "unavailable" }
  | { status: "not_checked"; reason: "no_scope" | "area_scope" };

export async function loadScopedRosterResult(scope: AccessScope | null): Promise<ScopedRosterResult> {
  if (!scope) return { status: "not_checked", reason: "no_scope" };
  /*
   * A DISTRICT OR REGION IS VERIFIED THROUGH THE STORES IT CONTAINS. The area
   * resolves through the registered roster (`authorizedLocationIds`), and
   * `scopeRoster` keeps only employees with an active, mapped assignment at one
   * of them — so a district manager is checked against their whole district,
   * not one store. An area the roster cannot resolve to any store stays
   * unchecked: failing closed, never open to every employee.
   */
  if (scope.level !== "global" && authorizedLocationIds(scope).length === 0) {
    return { status: "not_checked", reason: "area_scope" };
  }
  if (rosterStoreScopedEnabled()) {
    try {
      return { status: "ok", roster: (await readStoreRoster(scope)).map(rosterEmployeeOf) };
    } catch {
      return { status: "unavailable" };
    }
  }
  try {
    return { status: "ok", roster: scopeRoster(await readDirectoryRoster(), scope) };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * The scoped roster for one actor, or empty when it cannot be established.
 * Never throws: a directory outage must not stop a manager filing a form.
 */
export async function loadScopedRoster(scope: AccessScope | null): Promise<RosterEmployee[]> {
  const result = await loadScopedRosterResult(scope);
  const roster = result.status === "ok" ? result.roster : [];
  const limit = rosterLimit.getStore();
  if (!limit || limit.size === 0) return roster;
  return roster.filter((person) => limit.has(person.id));
}

/** Roster row plus the Woven title and primary location the name check does not read. */
export interface DirectoryFact extends RosterEmployee {
  readonly title: string | null;
  readonly primaryLocationName: string | null;
}

/**
 * The same scoped roster, plus job title and primary location.
 *
 * Called only when grounded entities are on. A failed read returns an empty
 * list; the caller then uses `loadScopedRoster`.
 */
export async function readDirectoryFacts(scope: AccessScope | null): Promise<DirectoryFact[]> {
  if (!scope) return [];
  if (scope.level !== "global" && authorizedLocationIds(scope).length === 0) return [];
  if (rosterStoreScopedEnabled()) {
    try {
      return await readStoreRoster(scope);
    } catch {
      return [];
    }
  }
  try {
    const supabase = getSupabaseAdmin();
    const [people, affiliations, map] = await Promise.all([
      supabase
        .from("employee_access_directory")
        .select(
          "id, first_name, last_name, preferred_first_name, employment_status, position_name, primary_woven_location_id, primary_location_name",
        )
        .limit(5000),
      supabase
        .from("employee_location_affiliations")
        .select("employee_id, woven_location_id")
        .eq("active", true)
        .limit(20000),
      supabase.from("woven_location_map").select("woven_location_id, location_id").eq("status", "mapped").limit(1000),
    ]);
    if (people.error || affiliations.error || map.error) return [];

    const locationByWoven = new Map<string, string>();
    for (const row of map.data ?? []) {
      if (typeof row.location_id === "string" && row.location_id.startsWith("loc-")) {
        locationByWoven.set(String(row.woven_location_id), row.location_id);
      }
    }
    const locationsByEmployee = new Map<string, Set<string>>();
    for (const row of affiliations.data ?? []) {
      const location = locationByWoven.get(String(row.woven_location_id));
      if (!location) continue;
      const key = String(row.employee_id);
      if (!locationsByEmployee.has(key)) locationsByEmployee.set(key, new Set());
      locationsByEmployee.get(key)!.add(location);
    }

    const allowed = scope.level === "global" ? null : new Set(authorizedLocationIds(scope));
    const facts: DirectoryFact[] = [];
    for (const row of people.data ?? []) {
      const first = String(row.first_name ?? "").trim();
      const last = String(row.last_name ?? "").trim();
      if (!first || !last) continue;
      if (row.employment_status === "terminated") continue;
      if (isServiceAccountName(first, last)) continue;
      const primaryWoven = row.primary_woven_location_id ? String(row.primary_woven_location_id) : "";
      const primaryId = primaryWoven ? locationByWoven.get(primaryWoven) : undefined;
      const affiliated = [...(locationsByEmployee.get(String(row.id)) ?? [])];
      const locationIds = affiliated.length > 0 ? affiliated : primaryId ? [primaryId] : [];
      const inScope = allowed ? locationIds.filter((id) => allowed.has(id)) : locationIds;
      if (allowed && inScope.length === 0) continue;
      facts.push({
        id: String(row.id),
        firstName: first,
        lastName: last,
        preferredFirstName: String(row.preferred_first_name ?? "").trim() || null,
        locationIds: [...inScope].sort(),
        positionName: String(row.position_name ?? "").trim() || null,
        title: String(row.position_name ?? "").trim() || null,
        primaryLocationName: String(row.primary_location_name ?? "").trim() || null,
      });
    }
    return facts;
  } catch {
    return [];
  }
}

/**
 * ============================================================================
 * ROSTER_STORE_SCOPED_ENABLED — ONLY THE MANAGER'S OWN STORES, NEVER THE WHOLE
 * DIRECTORY (master plan step 1, 3 Nov 2026; same mechanism in both apps)
 * ============================================================================
 *
 * The flag-off reads above load the whole directory (`.limit(5000)`,
 * `.limit(20000)`) and scope it in memory. The database answers at most 1,000
 * rows per request whatever the limit says, so a directory past that would be
 * cut short without an error — and every store's shared login ("Dodge
 * Account", an active "Team Member Full Time" to Woven) was a candidate name.
 *
 * READ FROM THE WOVEN-SYNCED TABLES, NEVER FROM WOVEN. The daily sync
 * (vercel.json, 11:17 UTC) keeps `employee_access_directory` and
 * `employee_location_affiliations` current; nothing here calls the Woven API.
 *
 *   1. the actor's stores (`authorizedLocationIds`; a global scope is every
 *      configured store) → their mapped Woven locations
 *   2. → the ACTIVE affiliations at those locations
 *   3. → those people, `employment_status = 'active'` only
 *   4. minus shared or service accounts by name (`isServiceAccountName`, as
 *      before) and the reviewed store logins by Woven id
 *      (`roster-non-person.ts`)
 *
 * Every read is paged with `.range()` and ordered, so no response can be cut
 * at the 1,000-row cap; one store is tens of rows. Throws on a read error: the
 * callers turn that into "unavailable" (never "nobody", never "everyone").
 */
export const ROSTER_PAGE_ROWS = 1000;
/** Ids per `.in()` filter, so a request URL stays short. */
const IN_CHUNK = 200;

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row of one read, a page of `ROSTER_PAGE_ROWS` at a time. */
async function readAllPages<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += ROSTER_PAGE_ROWS) {
    const { data, error } = await page(from, from + ROSTER_PAGE_ROWS - 1);
    if (error) throw new Error("The employee directory could not be read.");
    rows.push(...(data ?? []));
    if ((data ?? []).length < ROSTER_PAGE_ROWS) return rows;
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

type Row = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim());

/** The active people at the actor's own stores, with title and primary store. */
export async function readStoreRoster(scope: AccessScope | null): Promise<DirectoryFact[]> {
  if (!scope) return [];
  const stores = authorizedLocationIds(scope);
  if (stores.length === 0) return [];
  const supabase = getSupabaseAdmin();

  const map = await readAllPages<Row>((from, to) =>
    supabase
      .from("woven_location_map")
      .select("woven_location_id, location_id")
      .eq("status", "mapped")
      .in("location_id", stores)
      .order("woven_location_id", { ascending: true })
      .range(from, to),
  );
  const storeByWoven = new Map<string, string>();
  for (const row of map) {
    const location = text(row.location_id);
    if (location.startsWith("loc-") && stores.includes(location)) storeByWoven.set(text(row.woven_location_id), location);
  }
  if (storeByWoven.size === 0) return [];

  const affiliations: Row[] = [];
  for (const wovenIds of chunks([...storeByWoven.keys()], IN_CHUNK)) {
    affiliations.push(
      ...(await readAllPages<Row>((from, to) =>
        supabase
          .from("employee_location_affiliations")
          .select("employee_id, woven_location_id")
          .eq("active", true)
          .in("woven_location_id", wovenIds)
          // A unique order (employee, location), so no row is skipped or repeated between pages.
          .order("employee_id", { ascending: true })
          .order("woven_location_id", { ascending: true })
          .range(from, to),
      )),
    );
  }
  const storesByEmployee = new Map<string, Set<string>>();
  for (const row of affiliations) {
    const store = storeByWoven.get(text(row.woven_location_id));
    if (!store) continue;
    const key = text(row.employee_id);
    if (!storesByEmployee.has(key)) storesByEmployee.set(key, new Set());
    storesByEmployee.get(key)!.add(store);
  }
  if (storesByEmployee.size === 0) return [];

  const people: Row[] = [];
  for (const ids of chunks([...storesByEmployee.keys()], IN_CHUNK)) {
    people.push(
      ...(await readAllPages<Row>((from, to) =>
        supabase
          .from("employee_access_directory")
          .select(
            "id, external_employee_id, first_name, last_name, preferred_first_name, employment_status, position_name, last_synced_at, primary_location_name",
          )
          .in("id", ids)
          .eq("employment_status", "active")
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  }

  const facts: DirectoryFact[] = [];
  for (const row of people) {
    const first = text(row.first_name);
    const last = text(row.last_name);
    if (!first || !last) continue;
    if (row.employment_status !== "active") continue;
    if (isServiceAccountName(first, last)) continue;
    if (isNonPersonWovenId(text(row.external_employee_id))) continue;
    const position = text(row.position_name) || null;
    facts.push({
      id: text(row.id),
      firstName: first,
      lastName: last,
      preferredFirstName: text(row.preferred_first_name) || null,
      locationIds: [...(storesByEmployee.get(text(row.id)) ?? [])].sort(),
      positionName: position,
      employmentStatus: "active",
      lastSyncedAt: text(row.last_synced_at) || null,
      title: position,
      primaryLocationName: text(row.primary_location_name) || null,
    });
  }
  return facts.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id));
}

/** A store-roster row as the name checks read it. */
function rosterEmployeeOf(fact: DirectoryFact): RosterEmployee {
  return {
    id: fact.id,
    firstName: fact.firstName,
    lastName: fact.lastName,
    preferredFirstName: fact.preferredFirstName,
    locationIds: fact.locationIds,
    positionName: fact.positionName ?? null,
    employmentStatus: fact.employmentStatus ?? "active",
    lastSyncedAt: fact.lastSyncedAt ?? null,
  };
}
