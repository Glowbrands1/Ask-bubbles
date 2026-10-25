import { readLocationMentions } from "./location-mention";

/**
 * ============================================================================
 * "LOCATION KEARNEY" NAMES THE STORE
 * ============================================================================
 *
 * Ported from the sibling app (QA Round 4, 24 Oct 2026). A field label in front of
 * a store's name ("location kearney", "store kearney") was not read as a
 * place, so the store an earlier turn named stayed on the card. "kearney
 * location" and "location is kearney" already were.
 *
 * The label is put as "at", which the store reader already takes as a place
 * cue, so its own rules still decide. The original text is read as well, so
 * a numbered store keeps its number reading.
 */
const FIELD_LABEL = /\b(?:location|store)\b\s*(?:(?:is|was)\s+|[:=-]\s*)?(?=[a-z0-9#])/gi;

/** The registered stores a manager turn names, a field label counting as a place cue. */
export function labelledStoreIds(text: string): string[] {
  const labelled = text.replace(FIELD_LABEL, "at ");
  return [
    ...new Set(
      [...readLocationMentions(text), ...readLocationMentions(labelled)]
        .filter((mention) => !mention.confirm && mention.locationIds.length === 1)
        .map((mention) => mention.locationIds[0]!),
    ),
  ];
}
