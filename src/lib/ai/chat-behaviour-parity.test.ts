import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * CONVERSATIONAL BEHAVIOUR PORTED FROM THE REFERENCE PLATFORM
 * ============================================================================
 *
 * Multi-turn conversations replayed through the real proposal path
 * (`proposeFormForTurn`, `detectTemplateIntent`, `continuationFor`) against
 * the fixture forms registry. Each case is a behaviour the reference platform
 * pins in its own QA replays; the wording here is Ask Bubbles'.
 */

vi.mock("@/config/company/forms", async () =>
  (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
);

const LOCATION: AccessScope = { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] };

const COACHING = {
  id: "tpl-coaching-id",
  key: "fixture-coaching",
  name: "Fixture Coaching Note",
  shortName: "Coaching Note",
  description: "A fixture coaching record.",
  layoutFamily: "coaching",
  requiredPermission: "create_forms",
  active: true,
  displayOrder: 1,
  currentVersion: { id: "v1", status: "published", variants: [] },
  draftVersion: null,
  versionCount: 1,
  activeAsset: null,
  assetCount: 0,
};

vi.mock("@/lib/forms/repository", () => ({
  listTemplateSummaries: async () => [COACHING],
}));

const { proposeFormForTurn } = await import("./form-proposal");
const { continuationFor } = await import("@/lib/forms/proposal-continuation");
const { detectTemplateIntent } = await import("@/lib/forms/template-intent");
const { answersFormClarification } = await import("@/lib/forms/form-clarification");

let sequence = 0;
const user = (content: string): ChatMessage => ({ id: `u${++sequence}`, role: "user", content, createdAt: "2026-10-06T12:00:00Z" });

/** A conversation: each manager turn answered by the real proposal path, as the browser would send it. */
async function converse(turns: string[]) {
  const history: ChatMessage[] = [];
  const replies: Awaited<ReturnType<typeof proposeFormForTurn>>[] = [];
  for (const question of turns) {
    const continued = continuationFor(history);
    const reply = await proposeFormForTurn({
      history,
      question,
      questionMessageId: `q${sequence + 1}`,
      actor: { role: "location_manager" as never, scope: LOCATION },
      ...(continued ? { continueTemplateKey: continued.templateKey } : {}),
      summaries: [COACHING] as never,
      today: "2026-10-06",
    });
    replies.push(reply);
    history.push(user(question));
    history.push({
      id: `a${sequence}`,
      role: "assistant",
      content: reply?.content ?? "(an ordinary grounded answer)",
      createdAt: "2026-10-06T12:00:00Z",
      ...(reply?.formProposal ? { formProposal: reply.formProposal } : {}),
    } as ChatMessage);
  }
  return { replies, history };
}

beforeEach(() => {
  sequence = 0;
});

describe("advice, or the form? — asked, not guessed", () => {
  it.each(["coach Avery Testperson", "I need to coach Avery", "Avery Testperson needs coaching"])(
    "%s → one question with a chip for each reading",
    async (question) => {
      const { replies } = await converse([question]);
      expect(replies[0]!.content).toMatch(/^Do you want guidance, or do you want me to start a Fixture Coaching Note/);
      expect(replies[0]!.formProposal).toBeUndefined();
      expect(replies[0]!.followUpSuggestions).toHaveLength(2);
    },
  );

  it("'the form' answers it with a proposal for the same person, without asking who again", async () => {
    const { replies } = await converse(["coach Avery Testperson", "the form"]);
    expect(replies[1]!.formProposal?.templateKey).toBe("fixture-coaching");
    expect(replies[1]!.formProposal?.employeeName).toBe("Avery Testperson");
    expect(replies[1]!.content).not.toMatch(/Who is this form for|employee's full name/);
  });

  it.each(["how should I coach Avery?", "coach me through a hard conversation", "tips for coaching Avery"])(
    "%s stays advice: no question back, no form",
    (question) => {
      expect(detectTemplateIntent(question).kind).toBe("none");
    },
  );

  it("'the form' means nothing without the question before it", () => {
    expect(answersFormClarification([], "the form")).toBe(false);
  });
});

describe("the intake survives across turns, and nothing is asked twice", () => {
  it("knows who the form is for once it has been said", async () => {
    const { replies } = await converse(["I need a coaching note for avery testperson", "she was late today"]);
    expect(replies[1]!.formProposal?.employeeName?.toLowerCase()).toBe("avery testperson");
    expect(replies[1]!.content).not.toMatch(/Who is this form for/);
  });

  it("an account with nobody named still continues the intake", async () => {
    const { replies } = await converse(["coaching note for Avery Testperson", "missed the opening checklist today"]);
    expect(replies[1]).not.toBeNull();
    expect(replies[1]!.formProposal?.templateKey).toBe("fixture-coaching");
  });

  it("does not ask what happened when the manager already said", async () => {
    const { replies } = await converse(["coaching note for Avery Testperson — she was late twice this week"]);
    expect(replies[0]!.content).not.toMatch(/What the form should cover/);
  });

  it("does ask what happened when nothing was said", async () => {
    const { replies } = await converse(["I need a coaching note"]);
    expect(replies[0]!.content).toMatch(/What the form should cover/);
  });

  it("multi-turn: the form, the person, what happened and when each arrive in their own turn and are all kept", async () => {
    const { replies } = await converse([
      "I need a coaching note",
      "it's for avery testperson",
      "she was late twice this week",
      "the date is 10/5",
    ]);
    const last = replies[3]!;
    expect(last.formProposal?.templateKey).toBe("fixture-coaching");
    expect(last.formProposal?.employeeName?.toLowerCase()).toBe("avery testperson");
    expect(last.formProposal?.formDate).toBe("2026-10-05");
    expect(last.content).not.toMatch(/Who is this form for|employee's full name|What the form should cover/);
  });

  it("a question in the middle of an intake is answered, not swallowed", async () => {
    const { replies } = await converse(["coaching note for Avery Testperson", "what does the attendance policy say?"]);
    expect(replies[1]).toBeNull();
  });
});

describe("names as managers type them", () => {
  it.each([
    ["coaching note for Avery Testperson", "Avery Testperson"],
    ["coaching note for avery testperson", "avery testperson"],
    ['coaching note for "Avery Testperson"', "Avery Testperson"],
    ["coaching note for AVERY TESTPERSON", "AVERY TESTPERSON"],
    ["coaching note for Avery", "Avery"],
  ])("%s", async (question, name) => {
    const { replies } = await converse([question]);
    expect(replies[0]!.formProposal?.employeeName).toBe(name);
  });

  it("two people named is one short question", async () => {
    const { replies } = await converse(["coaching note for Avery Testperson and Jordan Testperson"]);
    expect(replies[0]!.content).toContain("Which of them is this **Fixture Coaching Note** for — **Avery Testperson** or **Jordan Testperson**?");
  });

  it("a correction replaces the person; a passing mention does not", async () => {
    const corrected = await converse(["coaching note for Jordan Testperson", "No, not Jordan. Avery Testperson."]);
    expect(corrected.replies[1]!.formProposal?.employeeName).toBe("Avery Testperson");
  });
});

describe("with the shipped registry, no clarification is configured", () => {
  it("the example form declares none, so 'coach Avery' is ordinary chat", async () => {
    vi.resetModules();
    vi.doUnmock("@/config/company/forms");
    const intent = await import("@/lib/forms/template-intent");
    expect(intent.detectTemplateIntent("coach Avery Testperson").kind).toBe("none");
    vi.doMock("@/config/company/forms", async () =>
      (await import("@/test/forms/fixture-forms")).fixtureFormsModule(),
    );
  });
});
