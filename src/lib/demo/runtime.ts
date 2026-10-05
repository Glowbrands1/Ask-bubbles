import type {
  DemoAnswerBank,
  DemoKnowledge,
  DemoRuntime,
  DemoSeeds,
} from "./types";

/**
 * ============================================================================
 * THE PRODUCTION SIDE OF THE DEMO BOUNDARY
 * ============================================================================
 *
 * Empty collections, and no import of `data/demo/*`. Every production-reachable
 * module imports this file; `next.config.ts` substitutes `runtime.demo.ts` for
 * it ONLY when a build explicitly asks for the demo. So a production build does
 * not contain the seeded records, rather than containing them behind a branch
 * nobody takes.
 */

const EMPTY_SEEDS: DemoSeeds = {
  documents: [],
  templates: [],
  forms: [],
  conversations: [],
};

const EMPTY_ANSWER_BANK: DemoAnswerBank = {
  answers: [],
  fallback: { quick: "", standard: "", detailed: "" },
};

const EMPTY_KNOWLEDGE: DemoKnowledge = { documents: [], chunks: [] };

export const demoRuntime: DemoRuntime = {
  kind: "production",
  async loadSeeds() {
    return EMPTY_SEEDS;
  },
  async loadAnswerBank() {
    return EMPTY_ANSWER_BANK;
  },
  async loadKnowledge() {
    return EMPTY_KNOWLEDGE;
  },
  async loadUsers() {
    return [];
  },
  async userForRole() {
    return null;
  },
  async loadWovenSample() {
    return null;
  },
};

export type { DemoAnswer, DemoAnswerBank, DemoKnowledge, DemoRuntime, DemoSeeds } from "./types";
