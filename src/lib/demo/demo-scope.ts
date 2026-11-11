import { FORM_FAMILY_READ_PERMISSIONS } from "@/config/company/forms/categories";
import { locationByCode } from "@/lib/locations";
import type { Permission, ScopeLevel } from "@/types";

/**
 * DEMO BUILD ONLY — which invented stores a previewed role covers.
 *
 * The demo accounts' areas (`loc-demo-1`, `dist-demo`) are not on the store
 * roster, so the demo maps them here: the District Manager covers the four
 * Nebraska stores, a store-level role covers Omaha (West Dodge Rd). Client-safe:
 * the previewed role lives in the browser, so screens apply this there.
 */
export const DEMO_DISTRICT_STORE_CODES: readonly string[] = ["66", "67", "236", "264"];
export const DEMO_LOCATION_STORE_CODE = "264";

const idOf = (code: string) => locationByCode(code)?.id ?? `loc-${code}`;

/** The store ids a demo scope is shown; null means every store. */
export function demoStoreIdsFor(scopeLevel: ScopeLevel | null | undefined): string[] | null {
  if (scopeLevel === "district") return DEMO_DISTRICT_STORE_CODES.map(idOf);
  if (scopeLevel === "location") return [idOf(DEMO_LOCATION_STORE_CODE)];
  return null;
}

/** The demo forms a previewed role would see live: its stores, and exit forms only with the right to read them. */
export function demoFormVisible(
  form: { locationId: string | null; layoutFamily: string },
  scopeLevel: ScopeLevel | null | undefined,
  can: (permission: Permission) => boolean,
): boolean {
  const stores = demoStoreIdsFor(scopeLevel);
  if (stores && (!form.locationId || !stores.includes(form.locationId))) return false;
  const needed = FORM_FAMILY_READ_PERMISSIONS[form.layoutFamily];
  return !needed || can(needed as Permission);
}
