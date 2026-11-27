import { describe, expect, it, vi } from "vitest";

import { buildChatHints, buildMeetingHints, CHAT_VOICE_PROMPT, L10_VOICE_PROMPT, limitKeyterms, MAX_KEYTERM_CHARS, MAX_KEYTERMS, type ChatHintSources } from "./keyterms";

/**
 * Invented people only.
 *
 * CHANGED ON PURPOSE (the owner, 27 Nov 2026: "i said Curt, it spelled it as Kurt"; "make sure sunny bubble and
 * leadership hub know the spelling of all employee"; "also salon names too and store"). These used to pin that a staff
 * name was a hint only once the conversation had named it, so the first time a name was said nothing told the provider
 * its spelling. The scoped roster and the scope's stores are now hints too, after the conversation's own names. Still
 * pinned as before: nobody outside the scoped roster, no browser-sent term, someone else's conversation gives nothing,
 * a failing reader drops only its own part.
 */
const ROSTER = [
  { firstName: "Ada", lastName: "Quillfeather", preferredFirstName: null },
  { firstName: "Bartholomew", lastName: "Vance", preferredFirstName: "Bart" },
  { firstName: "Cyrene", lastName: "Oakhollow", preferredFirstName: null },
];

const OWN_ID = "conv_own";

function sources(overrides: Partial<ChatHintSources> = {}): ChatHintSources {
  return {
    ownConversation: vi.fn(async (id: string) => {
      if (id !== OWN_ID) throw new Error("This conversation is not available.");
      return [
        { role: "user", content: "I need to coach ada about being late, and bart too" },
        { role: "assistant", content: "Here is a Coaching Form draft for Ada Quillfeather." },
      ];
    }),
    scopedRoster: vi.fn(async () => ROSTER),
    publishedFormNames: vi.fn(async () => ["Coaching Form", "Corrective Action Form"]),
    storeName: () => "Riverbend Commons",
    scopedPlaces: async () => [{ id: "loc-0001", names: ["Riverbend Commons", "Riverbend"] }],
    ...overrides,
  };
}

describe("chat, overview and report hints", () => {
  it("(a) names this conversation uses, only if on the roster; (b) the stores; (c) form names; (d) the scoped roster", async () => {
    const hints = await buildChatHints(OWN_ID, sources());
    expect(hints.keyterms).toEqual([
      "Ada Quillfeather",
      "Bart Vance",
      "Bartholomew Vance",
      "Riverbend Commons",
      "Riverbend",
      "Coaching Form",
      "Corrective Action Form",
      "Cyrene Oakhollow",
      "Ada",
      "Bart",
      "Bartholomew",
      "Cyrene",
    ]);
    expect(hints.vocabulary?.exact.has("oakhollow")).toBe(true);
    expect(hints.prompt).toBe(CHAT_VOICE_PROMPT);
    expect(hints.usedConversation).toBe(true);
    expect(hints.conversationContext).toEqual(["I need to coach ada about being late, and bart too", "Here is a Coaching Form draft for Ada Quillfeather."]);
  });

  it("a name the conversation uses but the roster does not hold is not a hint", async () => {
    const hints = await buildChatHints(
      OWN_ID,
      sources({ ownConversation: async () => [{ role: "user", content: "write up Zebulon Marchetti" }] }),
    );
    expect(hints.keyterms.join(" ")).not.toMatch(/Zebulon|Marchetti/);
  });

  it("a conversationId that is not the person's own is ignored: no names, no context", async () => {
    const hints = await buildChatHints("conv_someone_else", sources());
    expect(hints.keyterms.slice(0, 4)).toEqual(["Riverbend Commons", "Riverbend", "Coaching Form", "Corrective Action Form"]);
    expect(hints.conversationContext).toBeNull();
    expect(hints.usedConversation).toBe(false);
  });

  it("no conversationId: (a) is skipped", async () => {
    const own = vi.fn();
    const hints = await buildChatHints(undefined, sources({ ownConversation: own }));
    expect(own).not.toHaveBeenCalled();
    expect(hints.conversationContext).toBeNull();
  });

  it("every term comes from the readers: the browser has no way to add one", async () => {
    // The builder takes a correlation key and nothing else from the request.
    expect(buildChatHints.length).toBe(2);
    const hints = await buildChatHints(OWN_ID, sources({ publishedFormNames: async () => [], storeName: () => null, scopedPlaces: async () => [] }));
    const fromRoster = ROSTER.flatMap((person) => [
      `${person.firstName} ${person.lastName}`,
      ...(person.preferredFirstName ? [`${person.preferredFirstName} ${person.lastName}`, person.preferredFirstName] : []),
      person.firstName,
    ]);
    for (const term of hints.keyterms) expect(fromRoster).toContain(term);
  });

  it("a failing reader drops its part, never the clip", async () => {
    const hints = await buildChatHints(OWN_ID, sources({ scopedRoster: async () => Promise.reject(new Error("down")), publishedFormNames: async () => Promise.reject(new Error("down")) }));
    expect(hints.keyterms).toEqual(["Riverbend Commons", "Riverbend"]);
  });
});

describe("L10 hints", () => {
  it("the meeting's people and its name as the Hub gives them, then the store; no conversation context", async () => {
    const hints = await buildMeetingHints({
      meeting: async () => ({ name: "Invented DM Weekly", people: [{ name: "Dorian Felsworth" }, { name: "Esme Calloway-Brandt" }] }),
      storeName: () => "Riverbend Commons",
    });
    expect(hints.keyterms).toEqual(["Dorian Felsworth", "Esme Calloway-Brandt", "Invented DM Weekly", "Riverbend Commons"]);
    expect(hints.prompt).toBe(L10_VOICE_PROMPT);
    expect(hints.conversationContext).toBeNull();
  });

  it("the Hub not answering leaves only the store", async () => {
    const hints = await buildMeetingHints({ meeting: async () => null, storeName: () => "Riverbend Commons" });
    expect(hints.keyterms).toEqual(["Riverbend Commons"]);
  });
});

describe("limits", () => {
  it("at most 100 terms", () => {
    const many = Array.from({ length: 250 }, (_, i) => `Person Number ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
    expect(limitKeyterms(many)).toHaveLength(MAX_KEYTERMS);
  });

  it("at most 8,000 characters", () => {
    const long = Array.from({ length: 90 }, (_, i) => `${"Abcdefghij ".repeat(5).trim()} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`.slice(0, 95));
    const kept = limitKeyterms(long.map((term) => term.replace(/ /g, "")).map((term) => term + "x".repeat(60)));
    expect(kept.join("").length).toBeLessThanOrEqual(MAX_KEYTERM_CHARS);
    expect(kept.length).toBeLessThan(90);
  });

  it("removes duplicates ignoring case and spacing; drops terms over six words", () => {
    expect(limitKeyterms(["Ada Quillfeather", "ada  quillfeather", "one two three four five six seven", "Coaching Form"])).toEqual(["Ada Quillfeather", "Coaching Form"]);
  });

  it("never an email or an id", () => {
    expect(limitKeyterms(["ada@example.test", "3f2b8c1e-1111-4222-8333-444455556666", "conv_abc", "loc-0001", "Employee 104233", "Ada Quillfeather"])).toEqual(["Ada Quillfeather"]);
  });
});
