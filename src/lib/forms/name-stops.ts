import { COMPANY_LOCATIONS } from "@/lib/locations";
import { manualDisplayTitle, OFFICIAL_POLICY_MANUAL } from "@/lib/forms/official-policy-manual";

import { type NameStopSources } from "./name-words";

/**
 * State codes from this company's stores, and the words of the JBA manual's
 * configured titles. Nothing here is a list of policies.
 */
let cached: NameStopSources | null = null;

export function companyNameStops(): NameStopSources {
  if (cached) return cached;
  const phrases = [
    ...new Set(OFFICIAL_POLICY_MANUAL.fallbackTitles.flatMap((title) => [title, manualDisplayTitle(title)])),
  ];
  const titleWords = new Set<string>();
  for (const phrase of phrases) {
    for (const word of phrase.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      if (word.length >= 3 && !/^\d+$/.test(word)) titleWords.add(word);
    }
  }
  const stateCodes = new Set(
    COMPANY_LOCATIONS.map((location) => location.state?.toUpperCase()).filter((state): state is string => Boolean(state)),
  );
  cached = { stateCodes, titleWords, phrases };
  return cached;
}
