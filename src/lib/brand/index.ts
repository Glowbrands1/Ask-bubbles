import { BCS_BRAND } from "@/config/company/brand";
import type { BrandConfig } from "@/types";

/**
 * The brand this build ships. Company configuration lives in
 * `src/config/company/brand.ts`; this module is the platform's single read of
 * it, so no component imports company config directly.
 */
export const ACTIVE_BRAND: BrandConfig = BCS_BRAND;

/** Turns a BrandConfig palette map into an inline style object. */
export function brandStyle(brand: BrandConfig): Record<string, string> {
  return { ...brand.paletteTokens };
}

/**
 * The brand's word for one location as a label — "Store" — for the row both
 * form cards (the proposal and the inline form) show beside Employee, so the
 * two never name the same thing differently.
 */
export const LOCATION_LABEL: string =
  ACTIVE_BRAND.vocabulary.locationNoun.charAt(0).toUpperCase() + ACTIVE_BRAND.vocabulary.locationNoun.slice(1);
