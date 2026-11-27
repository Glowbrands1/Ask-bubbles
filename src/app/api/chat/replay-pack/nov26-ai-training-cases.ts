import { expect, vi } from "vitest";

import { __setDataToolDepsForTests } from "@/lib/ai/agent-loop/data-tools";
import type { TrainingCatalog } from "@/lib/ai-training/types";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * AI TRAINING'S LESSONS REACH THE MODEL (port from the sibling app; CLAUDE.md §5)
 * ============================================================================
 *
 * AI Training was notReadable. read_ai_training reads its published lessons as a reader who is not an editor sees them
 * (never a draft, never an admin-only module's lesson). This case asks in a manager's words through the real chat
 * route and asserts the published lesson reaches the model and the others never do. The lessons are tables the
 * harness does not hold, so they are scripted.
 */
const REPORT = "Pau, 20 Nov 2026: \"how can we program this AI to read new things added to the app? i need to always say it?\" (AI Training)";

const CATALOG: TrainingCatalog = {
  tracks: [{ id: "t1", slug: "basics", title: "AI Basics", sortOrder: 1 }],
  modules: [
    { id: "m1", trackId: "t1", slug: "prompts", title: "Prompting", sortOrder: 1, adminOnly: false },
    { id: "m2", trackId: "t1", slug: "archive", title: "Archive", sortOrder: 2, adminOnly: true },
  ],
  lessons: [
    { id: "l1", trackId: "t1", moduleId: "m1", slug: "clear", title: "Writing a clear prompt", summary: "Say who, what and why.", weekNumber: 1, sortOrder: 1, status: "published", publishedAt: "2026-11-20T10:00:00Z" },
    { id: "l2", trackId: "t1", moduleId: "m1", slug: "draft", title: "Unfinished draft lesson", summary: null, weekNumber: 2, sortOrder: 2, status: "draft", publishedAt: null },
    { id: "l3", trackId: "t1", moduleId: "m2", slug: "old", title: "Old archived lesson", summary: null, weekNumber: null, sortOrder: 1, status: "published", publishedAt: "2026-01-02T10:00:00Z" },
  ],
};

export const NOV26_AI_TRAINING_CASES: ReplayCase[] = [
  {
    id: "nov26-ai-training-reaches-the-model",
    title: "\"what lessons are in AI Training?\": read_ai_training gives the model the published lessons only, never a draft or an archived lesson, and the rules name the page",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-26T16:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      __setDataToolDepsForTests({ loadTrainingCatalog: async () => CATALOG });
      try {
        const model = loopStandIn((view: LoopView) => (lastResult(view, "read_ai_training") ? { text: "Here are the lessons." } : { tool: "read_ai_training", input: {} }));
        t.loopModel!(model);
        await t.thread().say("what lessons are in AI Training?");
        expect(model.views[0]?.system).toContain("AI training (read_ai_training)");
        const output = (model.views.flatMap((view) => view.results.filter((result) => result.tool === "read_ai_training")).at(-1)?.output ?? {}) as Record<string, unknown>;
        expect(output.refused, JSON.stringify(output)).toBeUndefined();
        const seen = JSON.stringify(output.lessons);
        expect(seen, "the published lesson did not reach the model").toContain("Writing a clear prompt");
        expect(seen, "a draft reached the model").not.toContain("Unfinished draft");
        expect(seen, "an admin-only module's lesson reached the model").not.toContain("Old archived lesson");
      } finally {
        __setDataToolDepsForTests(null);
      }
    },
  },
];
