import { describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { buildStoreIndex } from "@/lib/stores/resolver";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA, 20 OCTOBER 2026 — NAME, ROLE, STORE, IN ONE RUN
 * ============================================================================
 *
 * Reported on the reference platform and reproduced here in Buff City Soap's
 * terms. A manager asks:
 *
 *     "Can you create a coaching form for a manager on the onboarding
 *      process? Brandi Algya ASM Grand Island. Properly uploading
 *      documentation for onboarding, reading through the list of acceptable
 *      documentation"
 *
 * "Brandi Algya ASM Grand Island" was read as one capitalised run, so the card
 * was for an employee of that whole name — or, phrased differently, for
 * nobody, and the manager was asked who the form was for. See `nameBeforeRole`
 * in `lib/forms/proposal.ts`, and the role cue in `lib/stores/resolver.ts`
 * that reads the store named after the role.
 *
 * Replayed through the real server path, as the 30 September QA is. The store
 * index is the registered roster as it ships (no Woven mappings), so the store
 * is read by the store resolver alone.
 */

vi.mock("@/lib/forms/repository", () => ({
  listTemplateSummaries: async () => {
    throw new Error("the proposal takes the library from its caller");
  },
  getTemplateByKey: async () => {
    throw new Error("the proposal must not read the library");
  },
}));

vi.mock("@/lib/stores/woven-aliases", () => ({
  loadKnownTitles: async () => [],
  loadStoreIndex: async () => buildStoreIndex({ stores: COMPANY_LOCATIONS }),
}));

const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

function template(key: string, name: string, permission: string) {
  return {
    id: `tpl-${key}`,
    key,
    name,
    shortName: name,
    description: name,
    layoutFamily: key,
    requiredPermission: permission,
    active: true,
    displayOrder: 1,
    currentVersion: { id: `v-${key}`, status: "published", variants: [] },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
  };
}

const LIBRARY = [
  template("coaching", "Coaching Form", "create_coaching_form"),
  template("follow-up-coaching", "Follow-Up Coaching Form", "create_coaching_form"),
  template("policy-review", "Policy Review", "create_policy_review"),
];

let counter = 0;
function id(): string {
  counter += 1;
  return `msg-${counter}`;
}

/** Sends each turn the way the chat screen does; returns the latest assistant turn. */
async function converse(...turns: string[]): Promise<ChatMessage> {
  return converseAs(GLOBAL, ...turns);
}

async function converseAs(scope: AccessScope, ...turns: string[]): Promise<ChatMessage> {
  const { proposeFormForTurn } = await import("./form-proposal");
  const thread: ChatMessage[] = [];
  for (const question of turns) {
    const history = [...thread];
    const user: ChatMessage = { id: id(), role: "user", content: question, createdAt: "2026-10-20T12:00:00Z" };
    thread.push(user);
    const answer = await proposeFormForTurn({
      history,
      question,
      questionMessageId: user.id,
      actor: { role: "admin" as never, scope },
      continueTemplateKey: continuationFor(history)?.templateKey,
      summaries: LIBRARY as never,
      today: "2026-10-20",
    });
    thread.push({
      id: id(),
      role: "assistant",
      content: answer?.content ?? "Here is how to run that coaching conversation.",
      createdAt: "2026-10-20T12:00:00Z",
      ...(answer?.formProposal ? { formProposal: answer.formProposal } : {}),
    });
  }
  return thread[thread.length - 1]!;
}

function expectReadyCoaching(last: ChatMessage, employee: string) {
  expect(last.formProposal, last.content).toBeDefined();
  expect(last.formProposal!.templateKey).toBe("coaching");
  expect(last.formProposal!.employeeName).toBe(employee);
  expect(last.formProposal!.status).toBe("ready");
}

const REPORTED =
  "Can you create a coaching form for a manager on the onboarding process? Brandi Algya ASM Grand Island. Properly uploading documentation for onboarding, reading through the list of acceptable documentation";

describe("QA 20 Oct — a name followed by a role and a store", () => {
  it("the reported message proposes the Coaching Form for Brandi Algya", async () => {
    const last = await converse(REPORTED);
    expectReadyCoaching(last, "Brandi Algya");
    expect(last.formProposal!.employeeRole).toBe("Assistant Manager");
  }, 15_000);

  it.each([
    "can you create a coaching form for Brandi Algya ASM Grand Island. Properly uploading documentation",
    "can you please create a coaching form for Brandi Algya ASM Grand Island. Properly uploading documentation",
    "can u pls create a coaching form for Brandi Algya ASM Grand Island. Properly uploading documentation",
    "Can you pls create a coaching frm for a manager. Brandi Algya ASM Grand Island, onboarding documentation",
  ])("%s", async (question) => {
    expectReadyCoaching(await converse(question), "Brandi Algya");
  });

  it("the replayed conversation: a date, then the name line on its own, keeps the form", async () => {
    const last = await converse(
      "Can you create a coaching form for a manager on the onboarding process?",
      "10/9/2026",
      "Brandi Algya ASM Grand Island",
    );
    expectReadyCoaching(last, "Brandi Algya");
    expect(last.formProposal!.formDate).toBe("2026-10-09");
  });

  it.each([
    ["Brandi Algya SD Kearney", "Brandi Algya"],
    ["Brandi Algya DM Lee's Summit", "Brandi Algya"],
    ["Brandi Algya ASM", "Brandi Algya"],
  ])("answers 'who is this for?' with %s", async (answer, employee) => {
    expectReadyCoaching(await converse("I need a coaching form", answer), employee);
  });

  it("a role with only one name word before it still names nobody from the run", async () => {
    const last = await converse("I need a coaching form", "Sarah ASM Grand Island");
    expect(last.formProposal?.employeeName ?? null).not.toBe("Sarah ASM Grand Island");
  });

  it("a manager over several stores gets the one named after the role", async () => {
    const severalStores: AccessScope = { level: "location", primaryAreaId: "loc-236", alsoCoversAreaIds: ["loc-66", "loc-219"] };
    const last = await converseAs(
      severalStores,
      "Can you create a coaching form for a manager on the onboarding process? Brandi Algya ASM Lee's Summit. Properly uploading documentation for onboarding",
    );
    expectReadyCoaching(last, "Brandi Algya");
    expect(last.formProposal!.locationId).toBe("loc-219");
  });
});
