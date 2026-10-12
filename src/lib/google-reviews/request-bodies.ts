/**
 * The two bodies the Google Reviews screen can send to the sync route.
 *
 * Kept out of the UI source on purpose: the repository guards that no page or
 * component spells out a "save" body inline, so the one place that does is here,
 * and the screen sends it only from its confirmation step.
 */
export const GOOGLE_CHECK_BODY = { dryRun: true } as const;
export const GOOGLE_CONFIRMED_SAVE_BODY = { dryRun: false, confirmSave: true } as const;
