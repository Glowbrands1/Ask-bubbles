import { spokenNameKeyterms, spokenVocabulary, type SpokenPerson, type SpokenPlace, type SpokenVocabulary } from "./spoken-names";

/**
 * SPELLING HINTS FOR ONE CLIP, BUILT ON THE SERVER (VOICE_INPUT_ENABLED).
 *
 * Every term comes from the database through the readers passed in; nothing comes from the browser, and nothing here
 * is a fixed list of words. The list is never logged (only its length is). At most 100 terms and 8,000 characters
 * (AssemblyAI's limits), duplicates removed, terms over six words dropped, nothing that looks like an email or an id.
 *
 * CHANGED ON PURPOSE (the owner, 27 Nov 2026: "i said Curt, it spelled it as Kurt"; "make sure sunny bubble and
 * leadership hub know the spelling of all employee"; "also salon names too and store"; ported from the sibling app). A staff
 * name used to be a hint only once this conversation had named it, so the FIRST time a manager said a name nothing told
 * the provider its spelling. Now, after the conversation's own names, the stores and the people this manager may
 * already see (the same scoped roster the forms' name check reads) are hints too, their own stores first within the
 * 100-term bound. Nobody outside their scope is a hint. The same people and stores are the `vocabulary` the route
 * corrects the transcript's spelling against (`spoken-names.ts`); it stays on the server.
 *
 * Boxes A, B and C (chat, overview, report), in this order:
 *   (a) names used in THIS conversation, read from the person's own server-side history, and only when the browser's
 *       `conversationId` is one of theirs (`getOwnConversation` scopes by user id and refuses anyone else's); a name is
 *       kept only if it is also on the person's scoped roster (`loadScopedRoster`);
 *   (b) the person's own store name, then the stores of their scope (with the nicknames the app knows);
 *   (c) the published form type names; (d) the people on their scoped roster, their own stores' first.
 *   Plus a short domain prompt, and when (a) applied, the recent turns as `conversation_context`.
 * Box D (l10): (a) the names of the people in that meeting as the Leadership Hub returns them to this person (names
 *   only); (b) the meeting's name as the Hub gives it; (c) the person's own store name; (d) the stores and people of
 *   their scope, as above. A domain prompt about a
 *   leadership meeting, and no conversation context (L10 chat history lives in the browser).
 */

export const MAX_KEYTERMS = 100;
export const MAX_KEYTERM_CHARS = 8000;
const MAX_WORDS = 6;
const CONTEXT_TURNS = 4;
const CONTEXT_TURN_CHARS = 600;

export const CHAT_VOICE_PROMPT =
  "A retail store manager is dictating a short message to the company's workplace assistant: a question or request about store policy, coaching, HR forms, scheduling, operations or sales reports. Spell people's names, store names and form names as in the hints.";

export const L10_VOICE_PROMPT =
  "A manager is speaking in a weekly leadership (L10) meeting, asking the meeting assistant about the agenda, scorecard, rocks, to-dos, issues, headlines or the people in the meeting. Spell people's names and the meeting name as in the hints.";

export type HintPerson = SpokenPerson;

export interface HintMessage {
  readonly role: string;
  readonly content: string;
}

export interface VoiceHints {
  readonly keyterms: string[];
  readonly prompt: string;
  readonly conversationContext: string[] | null;
  /** Whether (a) used the person's conversation. */
  readonly usedConversation: boolean;
  /** The scoped people and stores the transcript's spelling is checked against. Server only: never sent or logged. */
  readonly vocabulary?: SpokenVocabulary;
}

export interface ChatHintSources {
  /** The person's own conversation; throws (or returns null) for one that is not theirs. */
  readonly ownConversation: (conversationId: string) => Promise<readonly HintMessage[] | null>;
  readonly scopedRoster: () => Promise<readonly HintPerson[]>;
  readonly publishedFormNames: () => Promise<readonly string[]>;
  readonly storeName: () => string | null;
  /** The stores this person's scope may see, by the names a manager says them by. */
  readonly scopedPlaces?: () => Promise<readonly SpokenPlace[]>;
  /** The person's own stores, whose people come first in the hints. */
  readonly ownStoreIds?: () => readonly string[];
}

export interface MeetingHintSources {
  /** The meeting's people and name as the Hub returns them to this person; null when the Hub does not answer. */
  readonly meeting: () => Promise<{ name: string | null; people: readonly { name: string }[] } | null>;
  readonly storeName: () => string | null;
  readonly scopedRoster?: () => Promise<readonly HintPerson[]>;
  readonly scopedPlaces?: () => Promise<readonly SpokenPlace[]>;
  readonly ownStoreIds?: () => readonly string[];
}

const EMAIL_OR_ID = /@|\d{3,}|^[0-9a-f-]{16,}$|^(?:conv|msg|loc)[-_]/i;

/** Dedupe (ignoring case and spacing), drop long or id-like terms, and stop at 100 terms and 8,000 characters. */
export function limitKeyterms(candidates: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const term = raw.replace(/\s+/g, " ").trim();
    if (term.length < 2 || EMAIL_OR_ID.test(term)) continue;
    if (term.split(" ").length > MAX_WORDS) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    if (out.length >= MAX_KEYTERMS || chars + term.length > MAX_KEYTERM_CHARS) break;
    seen.add(key);
    out.push(term);
    chars += term.length;
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function said(text: string, word: string | null | undefined): boolean {
  const name = word?.trim();
  if (!name || name.length < 3) return false;
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}($|[^\\p{L}])`, "iu").test(text);
}

/** The roster people this conversation already names, as full names. Never anyone the conversation does not name. */
export function rosterNamesUsed(messages: readonly HintMessage[], roster: readonly HintPerson[]): string[] {
  const text = messages.map((message) => message.content).join("\n");
  if (!text.trim()) return [];
  const names: string[] = [];
  for (const person of roster) {
    if (said(text, person.firstName) || said(text, person.preferredFirstName) || said(text, person.lastName)) {
      const first = person.preferredFirstName?.trim() || person.firstName.trim();
      names.push(`${first} ${person.lastName.trim()}`.trim());
      if (person.preferredFirstName?.trim() && person.firstName.trim() !== first) names.push(`${person.firstName.trim()} ${person.lastName.trim()}`);
    }
  }
  return names;
}

function recentTurns(messages: readonly HintMessage[]): string[] | null {
  const turns = messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content.trim())
    .slice(-CONTEXT_TURNS)
    .map((message) => message.content.replace(/\s+/g, " ").trim().slice(0, CONTEXT_TURN_CHARS));
  return turns.length > 0 ? turns : null;
}

/** Boxes A, B and C. `conversationId` is the browser's correlation key; it confers nothing on its own. */
export async function buildChatHints(conversationId: string | null | undefined, sources: ChatHintSources): Promise<VoiceHints> {
  let conversation: readonly HintMessage[] | null = null;
  if (conversationId) {
    try {
      conversation = await sources.ownConversation(conversationId);
    } catch {
      conversation = null; // Not this person's, missing, or unreadable: (a) is skipped.
    }
  }
  const roster = await sources.scopedRoster().catch(() => [] as readonly HintPerson[]);
  const places = await (sources.scopedPlaces?.() ?? Promise.resolve([] as readonly SpokenPlace[])).catch(() => [] as readonly SpokenPlace[]);
  const names = conversation && conversation.length > 0 ? rosterNamesUsed(conversation, roster) : [];
  let forms: readonly string[] = [];
  try {
    forms = await sources.publishedFormNames();
  } catch {
    forms = [];
  }
  const usedConversation = conversation !== null && conversation.length > 0;
  const scoped = spokenNameKeyterms(roster, places, sources.ownStoreIds?.() ?? []);
  return {
    keyterms: limitKeyterms([...names, sources.storeName(), ...scoped.places, ...forms, ...scoped.people]),
    prompt: CHAT_VOICE_PROMPT,
    conversationContext: usedConversation ? recentTurns(conversation ?? []) : null,
    usedConversation,
    vocabulary: spokenVocabulary(roster, places),
  };
}

/** Box D. */
export async function buildMeetingHints(sources: MeetingHintSources): Promise<VoiceHints> {
  let meeting: Awaited<ReturnType<MeetingHintSources["meeting"]>> = null;
  try {
    meeting = await sources.meeting();
  } catch {
    meeting = null;
  }
  const people = (meeting?.people ?? []).map((person) => (typeof person?.name === "string" ? person.name : null));
  const roster = await (sources.scopedRoster?.() ?? Promise.resolve([] as readonly HintPerson[])).catch(() => [] as readonly HintPerson[]);
  const places = await (sources.scopedPlaces?.() ?? Promise.resolve([] as readonly SpokenPlace[])).catch(() => [] as readonly SpokenPlace[]);
  const scoped = spokenNameKeyterms(roster, places, sources.ownStoreIds?.() ?? []);
  // The meeting's people are spellings the Hub gave this person, so they are corrected to as well.
  const meetingPeople: HintPerson[] = people
    .filter((name): name is string => typeof name === "string")
    .map((name) => {
      const [first = "", ...rest] = name.trim().split(/\s+/);
      return { firstName: first, lastName: rest.join(" ") };
    });
  return {
    keyterms: limitKeyterms([...people, meeting?.name ?? null, sources.storeName(), ...scoped.places, ...scoped.people]),
    prompt: L10_VOICE_PROMPT,
    conversationContext: null,
    usedConversation: false,
    vocabulary: spokenVocabulary([...roster, ...meetingPeople], places),
  };
}
