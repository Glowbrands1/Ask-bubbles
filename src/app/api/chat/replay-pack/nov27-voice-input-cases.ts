import { expect, vi } from "vitest";

import { agentLoopSkipReason } from "@/lib/ai/agent-loop/switch";

import { WEST_DODGE, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { loopStandIn } from "./loop-stand-in";

/**
 * ============================================================================
 * A DICTATED QUESTION TAKES THE SAME PATH AS A TYPED ONE (VOICE_INPUT_ENABLED, the owner, 27 Nov 2026)
 * ============================================================================
 *
 * Voice only fills the text box. When the manager sends dictated text, the browser adds `inputMode: "voice"`, the voice
 * route's trace id and whether the words were edited. Through the real chat route with production's flags, those
 * fields change nothing: the same reply and card as the typed message, the agent loop entered the same number of
 * times, and never an `agentLoopSkipReason`. Spoken style: lower case, no punctuation. Every person invented.
 */

const REPORT = "The owner, 27 Nov 2026: voice is a way to fill a text box; the answer stays the same as typing";

const SPOKEN = ["what forms does fenna prewitt have on file", "what is the policy on breaks", "ca for ozren brack he was late on tuesday"] as const;

const VOICE = { inputMode: "voice", voiceTraceId: "0e7d9c1a-2b3c-4d5e-8f90-a1b2c3d4e5f6", voiceEdited: false } as const;

const shape = (answer: ReplayAnswer) => ({
  reply: answer.content,
  card: answer.formProposal ? { templateKey: answer.formProposal.templateKey, employeeName: answer.formProposal.employeeName, status: answer.formProposal.status } : null,
});

async function askAll(t: ReplayContext, extra: Record<string, unknown> | undefined) {
  const watch = t.watchLoopEntries!();
  try {
    const outcomes = [];
    for (const words of SPOKEN) outcomes.push(shape(await t.thread().say(words, undefined, extra)));
    return { outcomes, entered: watch.entered() };
  } finally {
    watch.stop();
  }
}

export const NOV27_VOICE_INPUT_CASES: ReplayCase[] = [
  {
    id: "nov27-voice-input-same-answer-as-typed",
    title: "a dictated message sent with inputMode voice gets the same reply and card as the typed message, enters the agent loop the same way, and is never a reason to skip it",
    report: `${REPORT}; spoken-style messages in lower case with no punctuation`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-27T02:40:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn(() => ({ text: "Noted." })));

      expect(agentLoopSkipReason({ ...VOICE } as never), "the voice fields became a reason to skip the loop").toBeNull();

      const typed = await askAll(t, undefined);
      const voiced = await askAll(t, { ...VOICE });
      expect(voiced.outcomes, "a dictated message was answered differently from the typed one").toEqual(typed.outcomes);
      expect(voiced.entered, "the voice fields changed whether the loop answered").toBe(typed.entered);
      expect(voiced.entered, "the loop was skipped for a dictated message").toBe(SPOKEN.length);
      for (const outcome of voiced.outcomes) expect(outcome.reply.trim(), "a blank reply").not.toBe("");
    },
  },
];
