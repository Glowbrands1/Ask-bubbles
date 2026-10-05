import {
  DEMO_ANSWERS,
  DEMO_CONVERSATIONS,
  DEMO_KNOWLEDGE_CHUNKS,
  DEMO_KNOWLEDGE_DOCUMENTS,
  DEMO_USERS,
  FALLBACK_ANSWER,
  userForRole as seededUserForRole,
} from "@/data/demo";
import { WOVEN_SAMPLE_DATASET } from "@/data/demo/woven";
import type { Role } from "@/types";

import type { DemoRuntime } from "./types";

/**
 * ============================================================================
 * THE DEMO SIDE OF THE BOUNDARY — the only module that imports seeded data
 * ============================================================================
 *
 * Substituted for `runtime.ts` by `next.config.ts` only when a build sets
 * `NEXT_PUBLIC_DEMO_MODE=true` (and never on a Vercel Production build unless
 * `NEXT_PUBLIC_ALLOW_DEMO_IN_PRODUCTION=true`). Everything it returns is
 * labelled demo content.
 */
export const demoRuntime: DemoRuntime = {
  kind: "demo",

  async loadSeeds() {
    return {
      documents: DEMO_KNOWLEDGE_DOCUMENTS,
      templates: [],
      forms: [],
      conversations: DEMO_CONVERSATIONS,
    };
  },

  async loadAnswerBank() {
    return { answers: DEMO_ANSWERS, fallback: FALLBACK_ANSWER };
  },

  async loadKnowledge() {
    return { documents: DEMO_KNOWLEDGE_DOCUMENTS, chunks: DEMO_KNOWLEDGE_CHUNKS };
  },

  async loadUsers() {
    return DEMO_USERS;
  },

  async userForRole(role: Role) {
    return seededUserForRole(role);
  },

  async loadWovenSample() {
    return WOVEN_SAMPLE_DATASET;
  },
};

export type { DemoAnswer, DemoAnswerBank, DemoKnowledge, DemoRuntime, DemoSeeds } from "./types";
