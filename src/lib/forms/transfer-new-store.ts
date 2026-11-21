import { rosterLocationName } from "./location-mention";
import { readStoreMentions, type StoreIndex } from "@/lib/stores/resolver";

/**
 * ============================================================================
 * A TRANSFER'S NEW STORE, AS THE MANAGER NAMED IT (QA's Bubbles round 2, 22 Nov 2026, U54)
 * ============================================================================
 *
 * "<P> is PT at 15/hr and wants to transfer to dawley effective 11-2-26": the saved Position Transfer Form had the pay,
 * the status and the date, but no New Location. "Dawley" is Woven's own name for a registered store ("SD Dawley Farms",
 * `woven_location_map`), which the employment-change reader (registered names only) does not read.
 *
 * The mechanism, no word lists:
 *
 *   MODEL    reads where the person is moving (propose_form `new_store`) and quotes the manager's words for it
 *            (`new_store_evidence`), kept only on that evidence from this request.
 *   READ     the store index every server caller uses (`loadStoreIndex`: the roster, the company's nicknames and the
 *            Woven names a person mapped), the words as a place first, then as "at <words>". Exactly one store, never an
 *            inferred spelling (`confirm`, `loose`): anything else is not read, and the card asks which store.
 *   CREATE   the card's words and quote go with Create; the route checks the quote is in this chat's manager turns and
 *            reads the words again here, server-side, before it writes New Location as the manager's statement.
 */

export function transferNewStoreId(said: string, index: StoreIndex): string | null {
  const words = said.trim();
  if (!words) return null;
  const idsOf = (text: string) => {
    const reading = readStoreMentions(text, index);
    if (reading.mentions.some((mention) => mention.confirm || mention.loose)) return null;
    return [...new Set(reading.mentions.flatMap((mention) => [...mention.locationIds]))];
  };
  const ids = idsOf(words) ?? [];
  const found = ids.length > 0 ? ids : (idsOf(`at ${words}`) ?? []);
  return found.length === 1 ? found[0]! : null;
}

export function transferNewStoreName(said: string, index: StoreIndex): string | null {
  const id = transferNewStoreId(said, index);
  return id ? (rosterLocationName(id) ?? null) : null;
}

const flat = (text: string) => text.toLowerCase().replace(/[*_"“”]/g, "").replace(/\s+/g, " ").trim();

/** Whether the quote holds the words, and the manager's turns hold the quote (Create's server-side check). */
export function newStoreQuoted(said: string, quote: string, managerWords: string): boolean {
  const words = flat(said);
  const quoted = flat(quote);
  return words !== "" && quoted !== "" && quoted.includes(words) && flat(managerWords).includes(quoted);
}
