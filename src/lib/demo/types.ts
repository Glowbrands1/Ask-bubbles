import type { WovenSampleDataset } from "@/lib/employees/woven/view-types";
import type {
  AnswerMode,
  ChatConversation,
  FormTemplate,
  GeneratedForm,
  KnowledgeChunk,
  KnowledgeDocument,
  Role,
  User,
} from "@/types";

/**
 * ============================================================================
 * THE SHAPE OF SEEDED CONTENT, WITHOUT ANY OF IT
 * ============================================================================
 *
 * Types only. This module is imported by the PRODUCTION side of the demo
 * boundary, so it must be able to describe a seeded answer bank without
 * containing one — and a type import is erased by the compiler, so nothing
 * here reaches a bundle at all.
 */

/** One seeded answer in the demo bank, in each of the three lengths. */
export interface DemoAnswer {
  id: string;
  /** Lowercase keywords matched against the question. */
  matchers: string[];
  quick: string;
  standard: string;
  detailed: string;
  citationChunkIds: string[];
  /** Retained for answer-bank compatibility; always empty. */
  videoIds: string[];
  followUps?: string[];
}

/** The collections the client store seeds itself from in demo mode. */
export interface DemoSeeds {
  readonly documents: readonly KnowledgeDocument[];
  readonly templates: readonly FormTemplate[];
  readonly forms: readonly GeneratedForm[];
  readonly conversations: readonly ChatConversation[];
}

/** What `MockAIProvider` answers from. */
export interface DemoAnswerBank {
  readonly answers: readonly DemoAnswer[];
  readonly fallback: Record<AnswerMode, string>;
}

/** What the seeded retriever searches. */
export interface DemoKnowledge {
  readonly documents: readonly KnowledgeDocument[];
  readonly chunks: readonly KnowledgeChunk[];
}

/**
 * Everything the app can ask the demo boundary for.
 *
 * ONE INTERFACE, TWO IMPLEMENTATIONS, SELECTED AT BUILD TIME. Production code
 * imports `@/lib/demo/runtime` and gets the production implementation unless
 * the build explicitly asks for the demo one.
 */
export interface DemoRuntime {
  /** Which implementation this build selected. Reported by the health route. */
  readonly kind: "production" | "demo";
  loadSeeds(): Promise<DemoSeeds>;
  loadAnswerBank(): Promise<DemoAnswerBank>;
  loadKnowledge(): Promise<DemoKnowledge>;
  loadUsers(): Promise<readonly User[]>;
  userForRole(role: Role): Promise<User | null>;
  /**
   * The Woven Employee Sync's LABELLED SAMPLE SET, shown in place of the
   * database on the Woven tabs in a demo build. Null in production.
   */
  loadWovenSample(): Promise<WovenSampleDataset | null>;
}
