import "server-only";

import { openMeeting } from "@/features/l10/data.server";
import { getOwnConversation } from "@/lib/chat/store";
import { loadScopedRoster } from "@/lib/forms/employee-roster";
import { listTemplateSummaries } from "@/lib/forms/repository";
import { COMPANY_LOCATION_NICKNAMES } from "@/config/company/locations";
import { authorizedLocationIds } from "@/lib/forms/location-scope";
import { locationById } from "@/lib/locations";
import { parseStoreName } from "@/lib/stores/resolver";
import { loadWovenStoreAliases } from "@/lib/stores/woven-aliases";
import type { AccessScope } from "@/types";

import type { ChatHintSources, MeetingHintSources } from "./keyterms";
import type { SpokenPlace } from "./spoken-names";

/**
 * Where the spelling hints come from: the app's own readers, scoped to the signed-in person. Nothing from the browser
 * but the two correlation keys, each checked by its reader (`getOwnConversation` scopes by user id; `openMeeting` asks
 * the Hub as this person).
 */

/** The person's own store, when they are assigned to one store. */
export function ownStoreName(scope: AccessScope | null | undefined): string | null {
  if (!scope || scope.level !== "location") return null;
  return locationById(scope.primaryAreaId)?.name ?? null;
}

/**
 * The stores this scope may see (the same `authorizedLocationIds` a form is filed against), each by the names a manager
 * says it by: its registered name, that name without the state, the reviewed company nicknames for it, and the Woven
 * names a person mapped to it. For voice input's spelling hints and correction only (ported from Ask Sunny).
 */
export async function scopedStorePlaces(scope: AccessScope | null | undefined): Promise<SpokenPlace[]> {
  if (!scope) return [];
  const ids = authorizedLocationIds(scope);
  const woven = await loadWovenStoreAliases().catch(() => []);
  const title = (phrase: string) => phrase.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  const places: SpokenPlace[] = [];
  for (const id of ids) {
    const store = locationById(id);
    if (!store) continue;
    const parsed = parseStoreName(store);
    const nicknames = Object.entries(COMPANY_LOCATION_NICKNAMES)
      .filter(([, code]) => code === store.code)
      .map(([phrase]) => title(phrase));
    const wovenNames = woven.filter((alias) => alias.storeId === id && alias.kind === "woven_name").map((alias) => alias.text);
    const names = [parsed.city, ...(parsed.qualifier ? [`${parsed.city} ${parsed.qualifier}`] : []), ...nicknames, ...wovenNames];
    places.push({ id, names: [...new Set(names.map((name) => name.trim()).filter(Boolean))] });
  }
  return places;
}

/** A store-level person's own stores, whose people come first in the hints. None for a wider scope. */
function ownStoreIds(scope: AccessScope | null | undefined): string[] {
  return scope && scope.level === "location" ? authorizedLocationIds(scope) : [];
}

export function chatHintSources(input: { userId: string; scope: AccessScope }): ChatHintSources {
  return {
    ownConversation: async (conversationId) => (await getOwnConversation(input.userId, conversationId)).messages,
    scopedRoster: () => loadScopedRoster(input.scope),
    publishedFormNames: async () =>
      (await listTemplateSummaries()).filter((template) => template.active && template.currentVersion !== null).map((template) => template.name),
    storeName: () => ownStoreName(input.scope),
    scopedPlaces: () => scopedStorePlaces(input.scope),
    ownStoreIds: () => ownStoreIds(input.scope),
  };
}

export function meetingHintSources(input: { meetingKey: string; scope: AccessScope }): MeetingHintSources {
  return {
    meeting: async () => {
      const opened = await openMeeting(input.meetingKey);
      if (!opened.ok) return null;
      return {
        name: typeof opened.meeting.info?.name === "string" ? opened.meeting.info.name : null,
        // Names only: never the Hub's ids or emails.
        people: opened.meeting.people.filter((person) => typeof person?.name === "string").map((person) => ({ name: person.name })),
      };
    },
    storeName: () => ownStoreName(input.scope),
    scopedRoster: () => loadScopedRoster(input.scope),
    scopedPlaces: () => scopedStorePlaces(input.scope),
    ownStoreIds: () => ownStoreIds(input.scope),
  };
}
