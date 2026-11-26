/**
 * SPELLING HINTS FOR ONE CLIP, BUILT ON THE SERVER (VOICE_INPUT_ENABLED).
 *
 * Every term comes from the database through the readers passed in; nothing comes from the browser, and nothing here
 * is a fixed list of words. The list is never logged (only its length is). At most 100 terms and 8,000 characters
 * (AssemblyAI's limits), duplicates removed, terms over six words dropped, nothing that looks like an email or an id.
 * The full roster is never sent: only the people already named in this conversation, or the people in this meeting.
 *
 * Boxes A, B and C (chat, overview, report), in this order:
 *   (a) names used in THIS conversation, read from the person's own server-side history, and only when the browser's
 *       `conversationId` is one of theirs (`getOwnConversation` scopes by user id and refuses anyone else's); a name is
 *       kept only if it is also on the person's scoped roster (`loadScopedRoster`);
 *   (b) the published form type names; (c) the person's own store name.
 *   Plus a short domain prompt, and when (a) applied, the recent turns as `conversation_context`.
 * Box D (l10): (a) the names of the people in that meeting as the Leadership Hub returns them to this person (names
 *   only); (b) the meeting's name as the Hub gives it; (c) the person's own store name. A domain prompt about a
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

export interface HintPerson {
  readonly firstName: string;
  readonly lastName: string;
  readonly preferredFirstName?: string | null;
}

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
}

export interface ChatHintSources {
  /** The person's own conversation; throws (or returns null) for one that is not theirs. */
  readonly ownConversation: (conversationId: string) => Promise<readonly HintMessage[] | null>;
  readonly scopedRoster: () => Promise<readonly HintPerson[]>;
  readonly publishedFormNames: () => Promise<readonly string[]>;
  readonly storeName: () => string | null;
}

export interface MeetingHintSources {
  /** The meeting's people and name as the Hub returns them to this person; null when the Hub does not answer. */
  readonly meeting: () => Promise<{ name: string | null; people: readonly { name: string }[] } | null>;
  readonly storeName: () => string | null;
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
  let names: string[] = [];
  if (conversation && conversation.length > 0) {
    try {
      names = rosterNamesUsed(conversation, await sources.scopedRoster());
    } catch {
      names = [];
    }
  }
  let forms: readonly string[] = [];
  try {
    forms = await sources.publishedFormNames();
  } catch {
    forms = [];
  }
  const usedConversation = conversation !== null && conversation.length > 0;
  return {
    keyterms: limitKeyterms([...names, ...forms, sources.storeName()]),
    prompt: CHAT_VOICE_PROMPT,
    conversationContext: usedConversation ? recentTurns(conversation ?? []) : null,
    usedConversation,
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
  return {
    keyterms: limitKeyterms([...people, meeting?.name ?? null, sources.storeName()]),
    prompt: L10_VOICE_PROMPT,
    conversationContext: null,
    usedConversation: false,
  };
}
