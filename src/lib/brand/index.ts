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
