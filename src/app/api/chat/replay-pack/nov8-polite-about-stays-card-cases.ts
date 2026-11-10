import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "CAN YOU MAKE IT FOR MISSING OUT MONTHLY MEETING": THE CARD STAYS AND TAKES THE NEW TOPIC (the Bubbles live tester,
 * QA, 8 Nov 2026; the same with round 4's flags)
 * ============================================================================
 *
 * A Coaching card shown, then "can you make it for missing out monthly meeting": the reply was a policy answer ("For a
 * missed monthly meeting, the relevant policy is … I can't draft the coaching write-up itself here …") and no card;
 * the next turn brought the card back. Without "can you" the card stays. POLITE_ABOUT_STAYS_CARD_ENABLED
 * (`ai/polite-about-request.ts`; the call is one line in `ai/server-ask.ts`, coding 2's file; `ai/make-it-about.ts` reads
 * "make it for <topic>"). The tester's words; the person is invented (the pack's Marnie Holloway).
 */
const REQUEST = "create a coaching form for Marnie Holloway, she was late to her shift on 11/2";
const FIX = ["POLITE_ABOUT_STAYS_CARD_ENABLED"];
const REPORT = "The Bubbles live tester, QA, 8 Nov 2026: \"can you make it for missing out monthly meeting\" lost the Coaching card";
// Changed on purpose (coding 2, 8 Nov 2026): `ai/server-ask.ts` now proposes the turn without its polite lead, so these
// cases hold with their fix flag; their route hold and its constant are gone.

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

/** The topic change keeps a Coaching card for Marnie Holloway. */
async function keepsCard(t: ReplayContext, said: string) {
  const thread = start(t);
  await thread.say(REQUEST);
  const reply = (await thread.say(said)) as { content: string; formProposal?: { templateKey?: string; employeeName?: string | null } };
  expect(reply.formProposal, `the card is gone:\n${reply.content}`).toMatchObject({ templateKey: "coaching", employeeName: "Marnie Holloway" });
  return thread;
}

export const NOV8_POLITE_ABOUT_STAYS_CARD_CASES: ReplayCase[] = [
  {
    id: "nov8-polite-about-stays-card",
    title: "a Coaching card, then \"can you make it for missing out monthly meeting\": the card stays, and the draft is written about the missed meeting, not the lateness",
    report: REPORT,
    status: { open: "no card: the reply is a policy answer" },
    fixFlags: FIX,
    async run(t) {
      const thread = await keepsCard(t, "can you make it for missing out monthly meeting");
      await thread.create();
      const prompt = t.draftPrompts().at(-1) ?? "";
      expect(prompt, "the draft is not told the new topic").toMatch(/missing out monthly meeting/i);
      expect(prompt, "the draft is still about the lateness").not.toMatch(/late to her shift/i);
    },
  },
  ...[
    "can you make it about missing our monthly meeting",
    "make it for missing our monthly meeting",
    "make it about missing the monthly meeting",
  ].map(
    (said, index): ReplayCase => ({
      id: `nov8-polite-about-stays-card-negative-${index + 1}`,
      title: `${index === 0 ? "\"can you … about\"" : "negative"}: "${said}" keeps the card`,
      report: `${REPORT} (${index === 0 ? "the same with \"about\"" : "the wordings that already kept the card"})`,
      ...(index === 0 ? { status: { open: "no card: the reply is a policy answer" } as const } : { status: "fixed" as const }),
      fixFlags: FIX,
      async run(t) {
        await keepsCard(t, said);
      },
    }),
  ),
];
