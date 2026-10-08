/**
 * The brand line printed in the black chip at the top of a form, upper-case as
 * the source forms print theirs. Plain text: there is no approved logo asset.
 */
export const FORM_LETTERHEAD_BRAND = "BUFF CITY SOAP";

/**
 * The company name as a centred letterhead prints it, in title case under the
 * form's name (the Coaching and Resignation/Exit forms). Plain text: no logo.
 */
export const FORM_LETTERHEAD_BRAND_NAME = "Buff City Soap";

/**
 * The image printed beside the letterhead, by asset key, or null for none.
 * Register the asset in `src/lib/forms/assets/index.ts` first. No official
 * Buff City Soap logo asset has been supplied, so none is printed.
 */
export const FORM_LOGO_ASSET_KEY: string | null = null;
