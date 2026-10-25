import { labelledStoreIds } from "./store-cue";

type StoreRow = { readonly id: string; readonly name: string };

const CHANGE_PLACE_TO =
  /\b(?:change|switch|move|update|set|correct)\b[^.\n]*?\b(?:store|location)\b[^.\n]*?\bto\s+([^\n]+)/i;

/*
 * NEWEST_PLACE_TURN_ENABLED. The newest manager turn that names exactly one
 * store decides it: "change store location to bellevue, ne" after "at Dodge,
 * NE" is Bellevue, NE on that turn and on every later one that names none
 * (conv_mvnsstvq2cywp78 / conv_mvnu3j932gpohx4, 25 Oct 2026). A field label
 * or "change … to <place>" counts as a naming. A turn naming two stores stops
 * the read, and the caller grounds the store as before. Pure.
 */
export function newestManagerTurnStore(
  turnsNewestFirst: readonly string[],
  stores: readonly StoreRow[],
): { id: string; name: string; ambiguous: readonly StoreRow[] } | null {
  for (const raw of turnsNewestFirst) {
    if (!raw.trim()) continue;
    const change = CHANGE_PLACE_TO.exec(raw);
    const ids = labelledStoreIds(change ? `at ${change[1]!.trim()}` : raw);
    if (ids.length > 1) return null;
    if (ids.length === 0) continue;
    const row = stores.find((store) => store.id === ids[0]);
    return row ? { id: row.id, name: row.name, ambiguous: [] } : null;
  }
  return null;
}
