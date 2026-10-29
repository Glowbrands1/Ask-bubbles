import "server-only";

import { preferredNameCardCurrentEnabled } from "@/lib/config/chat-quality-flags";
import { displayName } from "@/lib/forms/employee-match";
import { loadScopedRoster } from "@/lib/forms/employee-roster";
import type { AccessScope } from "@/types";

/**
 * PREFERRED_NAME_CARD_CURRENT_ENABLED. Audit, 29 Oct 2026: "create a ca for
 * kit dovetail" (Kit is Katrin Dovetail's preferred name) made a card for
 * Katrin Dovetail, and Create refused it as "out of date: the conversation
 * now says the form is for kit dovetail" — the creation check reads names,
 * not the roster. The card is current when its person, on the manager's own
 * roster, has a preferred name that, with the last name, is what was typed:
 * every typed word begins a word of "<preferred> <last>". Off: never.
 */
export async function preferredNameSamePerson(
  scope: AccessScope | null,
  cardName: string,
  typed: string | undefined,
): Promise<boolean> {
  if (!preferredNameCardCurrentEnabled() || !typed) return false;
  const card = cardName.trim().toLowerCase();
  const roster = await loadScopedRoster(scope);
  return roster.some(
    (person) =>
      Boolean(person.preferredFirstName?.trim()) &&
      displayName(person).toLowerCase() === card &&
      typedFor(typed, `${person.preferredFirstName} ${person.lastName}`),
  );
}

function typedFor(typed: string, name: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
  const full = words(name);
  const said = words(typed);
  return said.length > 0 && said.every((word) => word.length >= 2 && full.some((part) => part.startsWith(word)));
}
