import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import type { ManualChunkRow } from "@/lib/knowledge/full-manual-load";

/**
 * ============================================================================
 * p.19 "charging in the break room" — conv_mvnoscyz200gtat, the live answer path
 * ============================================================================
 *
 * Production, 25 Oct 2026 (QA run B9). The manager pasted part of the cell
 * phone policy and asked what it means. The turn loaded the full manual
 * (cache_creation_input_tokens 41942). The reply said:
 *
 *   "Keep it off you and out of the way (the manual gives charging in the
 *    break room as an example of where it belongs) [p.19]."
 *
 * JBA Policy Manual p.19: "Employees should keep cell phones on silent and not
 * on their person (this means not in back pockets, charging in the break room,
 * or sitting on top of a drawer till)". The bracket lists three places the
 * phone may NOT be. HR's ruling (via QA, 25 Oct 2026): charging in the break
 * room is not allowed. The P2 run (conv_mvnosd3q2i4mb6g) and an earlier run
 * (conv_mvnncdjq20qg61c) of "What is the cell phone policy?" read it right.
 *
 * With MANUAL_NEGATED_LIST_NOTE_ENABLED on, a reading note for that list goes
 * into the per-turn grounding block whenever the grounding the model reads
 * (the cached full manual, or retrieved chunks) holds the sentence. The
 * manual text and the cached manual prefix are not changed. Off, the prompt
 * is byte-for-byte what it was.
 */

const state = vi.hoisted(() => ({
  system: "",
  grounding: "",
  cachedContext: undefined as string | undefined,
  calls: [] as { grounding: string; cachedContext: string | undefined }[],
  reply: "",
  rows: [] as unknown[],
}));

vi.mock("./query-rewrite-claude", () => ({
  rewriteRetrievalQuery: async (input: { question: string }) => input.question,
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async () => null,
  suggestFormsForTurn: () => null,
}));

vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));

vi.mock("@/lib/chat/person-memory-store", () => ({ recallPeople: async () => null }));

/* The production manual rows, read the way full-manual-load.ts reads them. */
vi.mock("@/lib/knowledge/full-manual-load", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/knowledge/full-manual-load")>();
  const { planFullManualContext } = await import("./full-manual-context");
  const fixture = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
    ...original,
    loadFullManualPlan: async (_scopeId: string, question: string, policyText?: string) =>
      planFullManualContext({
        question,
        policyText: policyText ?? question,
        documents: [
          {
            id: fixture.document_ids["ask-bubbles"],
            title: "2025 JBA Policy Manual - Edited 5-2025",
            category: "policies_compliance",
            status: "indexed",
            indexed: true,
            chunks: (fixture.chunks as ManualChunkRow[]).map(original.manualChunkFromRow),
          },
        ],
      }),
  };
});

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      return state.rows;
    }
    async fetchRoleGrounding() {
      return null;
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));

vi.mock("./call-claude", () => ({
  callClaude: async (input: { system: string; grounding: string; cachedContext?: string }) => {
    /*
     * The first call is the answer. A reply that cites no page from the loaded
     * manual is asked once more on ordinary retrieval; that call is kept in
     * `calls`, and the first one is the prompt checked here.
     */
    if (state.calls.length === 0) {
      state.system = input.system;
      state.grounding = input.grounding;
      state.cachedContext = input.cachedContext;
    }
    state.calls.push({ grounding: input.grounding, cachedContext: input.cachedContext });
    return state.reply;
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

/** conv_mvnoscyz200gtat, the manager's turn as sent. */
const B9_QUESTION =
  '"Personal cell phones are permitted in the workplace but must be kept out of sight. The only time a cell phone should be accessed while clocked in is in an emergency situation." what does this mean?';

/** conv_mvnosd3q2i4mb6g and conv_mvnncdjq20qg61c. */
const POLICY_QUESTION = "What is the cell phone policy?";

/** conv_mvnosd3q2i4mb6g, the reply production sent, word for word. */
const P2_REPLY = `Here's the cell phone/smart watch policy that applies across all brands [p.19]:

- Personal cell phones are allowed in the workplace but must stay out of sight — not in back pockets, not charging in the break room, not sitting on top of a till drawer [p.19].
- Phones should be kept on silent, and employees should only access them while clocked in for emergency situations.
- Texting, making calls or using social media while on shift is called out specifically as something that jeopardizes the customer experience, and it's on the employee to protect that experience [p.19].
- Smart watches are allowed, as long as they aren't used for texting, calls or social media — management can ask an employee to remove one if it starts interfering with the customer experience [p.19].

Separately, personal cell phone use while driving on company business is addressed under the Vehicle Fleet policy: texting, email or anything else that distracts from safe driving is forbidden, and cell use should be kept to a minimum even then [p.32].

Let me know if you want this tied to a specific situation you're dealing with.`;

/** conv_mvnncdjq20qg61c, the reply production sent, word for word. */
const P3_REPLY = `The cell phone and smart watch policy applies across all brands:

- Personal cell phones are allowed in the workplace but must be kept out of sight — not in back pockets, not charging in the break room, not sitting on a till drawer [p.19]. They should be on silent.
- Protecting the guest experience is each employee's responsibility — texting, calls, or social media on the clock jeopardizes that [p.19]. The only time a phone should be accessed while clocked in is an emergency [p.19].
- Smart watches are allowed as long as they're not being used for social media, texting, or calls [p.19]. Management can ask an employee to remove a smart watch if it starts interfering with the customer experience [p.19].

If you're dealing with a specific situation where someone's phone use is becoming a pattern, let me know — happy to help you think through how to coach it.`;

const NOTE =
  "Reading note (p.19): 'not in back pockets, charging in the break room, or sitting on top of a drawer till' lists three places the phone may NOT be: not in a back pocket, not charging in the break room, and not sitting on top of a drawer till. None of the three is allowed; charging in the break room is not allowed. The manual does not give the break room or a drawer till as a place the phone belongs.";

const NOTE_BLOCK = `MANUAL READING NOTES

These notes are not manual text and are not cited. Each one says how to read a sentence that is in the manual text above.

- ${NOTE}`;

const CELL_PHONE_CHUNK = manual151.chunks.find((row) => row.chunk_index === 61)!;

function retrievedRow(content: string, section: string) {
  return {
    chunk_id: `chunk-${section}`,
    document_id: manual151.document_ids["ask-bubbles"],
    document_title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    locator: `Page 19 — ${section}`,
    page: 20,
    section,
    content,
    similarity: 0.93,
  };
}

async function ask(question: string) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      conversationId: "conv_mvnoscyz200gtat",
      context: { userName: "Test Manager", locationName: "All areas", todayIso: "2026-10-25" },
    } as never,
    ACTOR,
  );
}

interface Captured {
  system: string;
  grounding: string;
  cachedContext: string | undefined;
  content: string;
}

async function run(question: string, flag: string | undefined): Promise<Captured> {
  state.calls = [];
  if (flag === undefined) delete process.env.MANUAL_NEGATED_LIST_NOTE_ENABLED;
  else process.env.MANUAL_NEGATED_LIST_NOTE_ENABLED = flag;
  const response = await ask(question);
  return {
    system: state.system,
    grounding: state.grounding,
    cachedContext: state.cachedContext,
    content: response.content,
  };
}

const saved = {
  note: process.env.MANUAL_NEGATED_LIST_NOTE_ENABLED,
  manual: process.env.FULL_MANUAL_CONTEXT_ENABLED,
};

// The first import of server-ask is the slow part; under load it alone passed 5s.
beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.system = "";
  state.grounding = "";
  state.cachedContext = undefined;
  state.calls = [];
  state.reply = "An answer [p.19].";
  state.rows = [retrievedRow(CELL_PHONE_CHUNK.content, "Cell Phone/Smart Watch Policy")];
});

afterEach(() => {
  for (const [name, value] of [
    ["MANUAL_NEGATED_LIST_NOTE_ENABLED", saved.note],
    ["FULL_MANUAL_CONTEXT_ENABLED", saved.manual],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("conv_mvnoscyz200gtat — the full manual is loaded (the live path)", () => {
  beforeEach(() => {
    process.env.FULL_MANUAL_CONTEXT_ENABLED = "1";
  });

  it("the B9 paste-and-ask turn gets the p.19 reading note in its grounding with the flag on", async () => {
    const on = await run(B9_QUESTION, "1");
    expect(on.cachedContext).toBeTruthy();
    // The manual the model reads holds the sentence, across the stored line break.
    expect(on.cachedContext!.replace(/\s+/g, " ")).toContain(
      "not in back pockets, charging in the break room, or sitting on top of a drawer till",
    );
    expect(on.grounding).toContain(NOTE);
    expect(on.grounding).toContain(NOTE_BLOCK);
    // The note is not manual text: the cached manual does not carry it.
    expect(on.cachedContext).not.toContain("Reading note");
  });

  it("with the flag off the prompt is byte-for-byte what it was, and on adds only the note", async () => {
    const unset = await run(B9_QUESTION, undefined);
    const off = await run(B9_QUESTION, "off");
    const on = await run(B9_QUESTION, "1");
    expect(unset.grounding).not.toContain("Reading note");
    expect(off.grounding).toBe(unset.grounding);
    expect(off.system).toBe(unset.system);
    expect(off.cachedContext).toBe(unset.cachedContext);
    // On: the same grounding with the note block after it.
    expect(on.grounding).toBe(`${unset.grounding}\n\n${NOTE_BLOCK}`);
    // The cached prefix and the system prompt are the same either way: the cache key does not move.
    expect(on.cachedContext).toBe(unset.cachedContext);
    expect(on.system).toBe(unset.system);
  });

  it.each([
    ["conv_mvnosd3q2i4mb6g", P2_REPLY],
    ["conv_mvnncdjq20qg61c", P3_REPLY],
  ])('"What is the cell phone policy?" (%s) gets the note, and nothing else in the answer changes', async (_id, reply) => {
    state.reply = reply;
    const off = await run(POLICY_QUESTION, undefined);
    const on = await run(POLICY_QUESTION, "1");
    expect(on.grounding).toContain(NOTE);
    expect(off.grounding).not.toContain("Reading note");
    expect(on.content).toBe(off.content);
    expect(on.content).toContain("not charging in the break room");
  });

  it("the retrieval retry after an uncited reply carries the note too", async () => {
    state.reply = "An answer with no page.";
    await run(B9_QUESTION, undefined);
    const offRetry = state.calls[1];
    await run(B9_QUESTION, "1");
    const onRetry = state.calls[1];
    expect(offRetry?.cachedContext).toBeUndefined();
    expect(offRetry?.grounding).toContain("charging in the break room");
    expect(offRetry?.grounding).not.toContain("Reading note");
    expect(onRetry?.grounding).toBe(`${offRetry?.grounding}\n\n${NOTE_BLOCK}`);
  });

  it("a correct answer is left as written", async () => {
    state.reply = "Phones may not be charging in the break room [p.19].";
    const on = await run(B9_QUESTION, "1");
    expect(on.content).toContain("Phones may not be charging in the break room");
  });
});

describe("conv_mvnoscyz200gtat — ordinary retrieval (full manual off)", () => {
  beforeEach(() => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
  });

  it("a retrieved p.19 chunk gets the reading note beside it with the flag on", async () => {
    const off = await run(B9_QUESTION, undefined);
    const on = await run(B9_QUESTION, "1");
    expect(on.cachedContext).toBeUndefined();
    expect(off.grounding).toContain("charging in the break room");
    expect(off.grounding).not.toContain("Reading note");
    expect(on.grounding).toBe(`${off.grounding}\n\n${NOTE_BLOCK}`);
    expect(on.system).toBe(off.system);
  });

  it("grounding without the p.19 sentence gets no note, flag on or off", async () => {
    state.rows = [
      retrievedRow(
        "Company Email Account\nCompany email accounts are for authorized Employees only.",
        "Company Email Account",
      ),
    ];
    const off = await run(B9_QUESTION, undefined);
    const on = await run(B9_QUESTION, "1");
    expect(on.grounding).toBe(off.grounding);
    expect(on.grounding).not.toContain("Reading note");
  });
});

/**
 * conv_mvnsu3dz2mwoihh (Production, chat-history replay, 25 Oct 2026). The
 * turn read retrieved chunks (no cached manual: cache tokens 0/0) and the p.19
 * chunk ranked first. The reply said "Phones should stay silent and either
 * charging in the break room or in a drawer till, not carried during a shift."
 * p.19 lists both the break room and "sitting on top of a drawer till" as
 * places the phone may NOT be. QA (25 Oct 2026): the note must name all three
 * places, the drawer till included.
 */
const PHONES_ON_SHIFT_QUESTION = "Can employees have their phones on them during a shift?";

/** conv_mvnsu3dz2mwoihh, the reply production sent, word for word. */
const PHONES_ON_SHIFT_REPLY = `No — per policy, personal cell phones are allowed in the workplace but must be kept out of sight and not on the employee's person while clocked in (not in back pockets, not on them). Phones should stay silent and either charging in the break room or in a drawer till, not carried during a shift. The only time a phone should be accessed while clocked in is an emergency.

Smart watches are treated a bit differently — they're allowed as long as they're not being used for texting, calls, or social media, and you can ask an employee to remove one if it starts interfering with the guest experience.`;

describe("conv_mvnsu3dz2mwoihh — \"Can employees have their phones on them during a shift?\"", () => {
  it("the note names all three places as NOT allowed, the drawer till included", () => {
    expect(NOTE).toContain("three places the phone may NOT be");
    expect(NOTE).toContain("not in a back pocket");
    expect(NOTE).toContain("not charging in the break room");
    expect(NOTE).toContain("not sitting on top of a drawer till");
    expect(NOTE).toContain("None of the three is allowed");
    expect(NOTE).toContain("does not give the break room or a drawer till as a place the phone belongs");
  });

  it("ordinary retrieval (the path this turn took): the exact question gets the note with the flag on", async () => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    state.reply = PHONES_ON_SHIFT_REPLY;
    const off = await run(PHONES_ON_SHIFT_QUESTION, undefined);
    const on = await run(PHONES_ON_SHIFT_QUESTION, "1");
    expect(off.grounding).toContain("sitting on top of a drawer till");
    expect(off.grounding).not.toContain("Reading note");
    expect(on.grounding).toBe(`${off.grounding}\n\n${NOTE_BLOCK}`);
    expect(on.system).toBe(off.system);
  });

  it("full manual loaded: the exact question gets the note with the flag on", async () => {
    process.env.FULL_MANUAL_CONTEXT_ENABLED = "1";
    state.reply = PHONES_ON_SHIFT_REPLY;
    const on = await run(PHONES_ON_SHIFT_QUESTION, "1");
    expect(on.grounding).toContain(NOTE_BLOCK);
  });
});
