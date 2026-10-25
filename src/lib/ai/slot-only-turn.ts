import type { ClaudeTurn } from "./call-claude";
import { isEllipticalFollowUp, MAX_CONTINUATION_HOPS } from "./continuation";

/**
 * ============================================================================
 * A TURN THAT ONLY FILLS IN A DETAIL IS NOT A NEW TOPIC TO SEARCH
 * ============================================================================
 *
 * Production, conv_mvnljjl32xlit48 (25 Oct 2026). A coaching conversation:
 * "I need to coach an employee", "Her name is Test Employee", "She works at
 * Grand Island", "It happened on 10-21". Every turn was searched on its own
 * words. "She works at Grand Island" matched soap recipe pages, "It happened
 * on 10-21" matched event tech-guide pages, and the replies built on them —
 * one told the manager "the sources you just shared are all soap and
 * auxiliary recipe directions".
 *
 * A turn that only supplies a store, a date, a time or a name answers the
 * conversation's question; it does not ask a new one. Its retrieval query is
 * the conversation's topic: the manager's most recent turn before it that is
 * not itself a slot or a fragment. The model is still given the turn as typed.
 *
 * NARROW ON PURPOSE. The whole turn must be one of the shapes below and no
 * longer than `MAX_WORDS`, so "It happened on 10-21 when she yelled at a
 * guest" carries its own topic and is searched as typed. With no earlier
 * topic — a conversation that opens with "She works at Grand Island" — the
 * turn is searched as typed too.
 */

const MAX_WORDS = 10;

const MONTH =
  String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const WEEKDAY = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?`;
const TIME = String.raw`(?:(?:at|around|about)\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)`;
const DAY = [
  String.raw`\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?`,
  String.raw`\d{4}-\d{2}-\d{2}`,
  String.raw`(?:yesterday|today|tonight|this\s+morning|this\s+afternoon|last\s+night)`,
  String.raw`(?:(?:last|this|on)\s+)?${WEEKDAY}`,
  String.raw`${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?`,
  String.raw`(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?\s+of\s+${MONTH}`,
].join("|");
const WHEN = String.raw`(?:(?:${DAY})(?:,?\s+${TIME})?|${TIME}(?:\s+(?:on\s+)?(?:${DAY}))?)`;

/** A place name: up to four words, none of them a joiner that starts a new clause. */
const PLACE = String.raw`(?!(?:and|but|because|when|while|where|who|so)\b)[\w#.'&-]+(?:\s+(?!(?:and|but|because|when|while|where|who|so)\b)[\w#.'&-]+){0,3}`;
const PLACE_NOUN = String.raw`(?:store|location|shop|site)`;
const CAPITALISED_PLACE = String.raw`[A-Z0-9#][\w.'&-]*(?:\s+[A-Z0-9#][\w.'&-]*){0,3}(?:\s+${PLACE_NOUN})?`;
const WHO = String.raw`(?:she|he|they|the\s+employee|the\s+team\s+member|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)`;
const NAME = String.raw`[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}`;
const END = String.raw`\s*[.!]?\s*$`;

const SLOT_ONLY: readonly RegExp[] = [
  // "She works at Grand Island", "He works out of the Downtown store"
  new RegExp(String.raw`^${WHO}\s+(?:works?|worked|is\s+working|is\s+based|was\s+based)\s+(?:at|in|out\s+of|from)\s+(?:the\s+)?${PLACE}${END}`, "i"),
  // "At Grand Island", "In the Downtown store" — a capitalised name, so "At least twice" is not a place
  new RegExp(String.raw`^(?:[Aa]t|[Ii]n|[Ff]rom)\s+(?:the\s+)?${CAPITALISED_PLACE}${END}`),
  // "The store is Grand Island", "Location: Grand Island"
  new RegExp(String.raw`^(?:the\s+|her\s+|his\s+|their\s+)?${PLACE_NOUN}\s*(?:is|was|:)\s*(?:the\s+)?${PLACE}${END}`, "i"),
  // "It happened on 10-21", "This was yesterday at 3pm"
  new RegExp(String.raw`^(?:it|this|that|everything|the\s+incident|the\s+issue)\s+(?:happened|occurred|took\s+place|was)\s+(?:on\s+)?${WHEN}${END}`, "i"),
  // "10-21", "On Tuesday", "Yesterday at 2pm"
  new RegExp(String.raw`^(?:on\s+)?${WHEN}${END}`, "i"),
  // "The date was 10/21"
  new RegExp(String.raw`^(?:the\s+)?(?:date|day)\s*(?:is|was|:)\s*(?:on\s+)?${WHEN}${END}`, "i"),
  // "Her name is Test Employee", "The employee is Jordan Smith"
  new RegExp(String.raw`^(?:[Hh]er|[Hh]is|[Tt]heir|[Tt]he\s+employee's|[Tt]he\s+team\s+member's)\s+name\s+is\s+${NAME}${END}`),
];

/** Whether the turn only supplies a store, a date, a time or a name. */
export function isSlotOnlyTurn(question: string): boolean {
  const text = (question ?? "").trim();
  if (text === "") return false;
  if (text.split(/\s+/).length > MAX_WORDS) return false;
  return SLOT_ONLY.some((pattern) => pattern.test(text));
}

/**
 * The conversation's topic for a slot-only turn: the manager's most recent
 * earlier turn that is neither a slot nor a fragment. `null` when the turn is
 * not slot-only, or when no earlier turn carries a topic — then the turn is
 * searched as typed. Only the MANAGER'S words are used: an assistant turn is
 * the model's own output, and searching on it would let one answer ground the
 * next.
 */
export function slotOnlyRetrievalTopic(question: string, history: readonly ClaudeTurn[]): string | null {
  if (!isSlotOnlyTurn(question)) return null;
  let hops = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index]!;
    if (turn.role === "assistant") continue;
    const text = turn.content.trim();
    if (text !== "" && !isSlotOnlyTurn(text) && !isEllipticalFollowUp(text)) return text;
    hops += 1;
    if (hops > MAX_CONTINUATION_HOPS) return null;
  }
  return null;
}
