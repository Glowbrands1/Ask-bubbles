import { withoutAppLines } from "@/lib/ai/app-sentences";
import { placeFromCueEnabled } from "@/lib/config/chat-quality-flags";
import type { StoreIndex } from "@/lib/stores/resolver";

import { readLocation } from "./location-mention";

/*
 * PLACE_FROM_CUE_ENABLED (port of the sibling app's gate finding, 6 Nov 2026, sf-s28): "create a
 * corrective action for <name> from bellevue" says which store the employee is from, but "from" is
 * no place cue for the store reader, so the store was never read and the card silently took the
 * employee's own store. With the flag on, "for <one to three name words> from <word>" is read as
 * "at <word>" — for the store readers only (`location-scope.ts`, `ai/intake-augment.ts`); nothing
 * else sees the change. Only that shape: "she transferred from …", "a call from the store", "a
 * complaint from a guest" and "from 10/5" are left as they are. The store still has to be one the
 * roster names.
 */
const FOR_NAME_FROM = /(\bfor\s+(?:[\p{L}'’-]+\s+){1,3}?)from\s+(?=\p{L})/giu;

/** The text the store reader reads: "for <name> from <store>" as "for <name> at <store>" with the flag on. */
export function placeText(text: string): string {
  return placeFromCueEnabled() ? text.replace(FOR_NAME_FROM, "$1at ") : text;
}

/**
 * The stores the text names. With the flag on, the manager's own words come first: the lines the app
 * writes back onto a turn ("It happened at …", `ai/app-sentences.ts`) are the app's earlier reading,
 * so they count only when the manager's words name no store. Off, as before.
 */
export function placeReading(text: string, index: StoreIndex): ReturnType<typeof readLocation> {
  if (!placeFromCueEnabled()) return readLocation(text, index);
  const own = readLocation(placeText(withoutAppLines(text)), index);
  return own.mentions.length > 0 ? own : readLocation(placeText(text), index);
}
