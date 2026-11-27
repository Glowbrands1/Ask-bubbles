import "server-only";

import { openMeeting } from "@/features/l10/data.server";
import { getOwnConversation } from "@/lib/chat/store";
import { loadScopedRoster } from "@/lib/forms/employee-roster";
import { listTemplateSummaries } from "@/lib/forms/repository";
import { locationById } from "@/lib/locations";
import type { AccessScope } from "@/types";

import type { ChatHintSources, MeetingHintSources } from "./keyterms";

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

export function chatHintSources(input: { userId: string; scope: AccessScope }): ChatHintSources {
  return {
    ownConversation: async (conversationId) => (await getOwnConversation(input.userId, conversationId)).messages,
    scopedRoster: () => loadScopedRoster(input.scope),
    publishedFormNames: async () =>
      (await listTemplateSummaries()).filter((template) => template.active && template.currentVersion !== null).map((template) => template.name),
    storeName: () => ownStoreName(input.scope),
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
  };
}
