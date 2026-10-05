import type { ChatConversation } from "@/types";

/**
 * Seeded chat content — DEMO CONTENT.
 *
 * Every answer below is written for this prototype. None of it is real company
 * policy language; where an answer describes "what the policy says" it is
 * paraphrasing the seeded demo documents, and the UI labels it accordingly.
 *
 * FUTURE: MockAIProvider is replaced by ClaudeProvider, which sends the
 * retrieved chunks plus the manager's question to Claude and streams the
 * response. The shape of what comes back — prose, citations, recommended
 * videos, an optional form handoff — does not change.
 */

/*
 * THE VOCABULARY LIVES IN `data/answer-modes.ts` NOW, re-exported here so
 * existing importers are unchanged. It is production copy; keeping it in this
 * file meant importing a mode label also shipped every seeded answer and
 * conversation below it.
 */
export {
  ANSWER_MODE_HELPER,
  ANSWER_MODE_LABEL,
  MANAGER_NOTE,
  MANAGER_NOTE_SHORT,
  SOURCE_PROMISE,
} from "@/data/answer-modes";

/*
 * THE SHAPE LIVES ON THE DEMO BOUNDARY, in `lib/demo/types.ts`, so the
 * production implementation can describe an answer bank without importing
 * this file. Re-exported here for the seeded data below.
 */
export type { DemoAnswer } from "@/lib/demo/types";
import type { DemoAnswer } from "@/lib/demo/types";

/**
 * THE DEMO ANSWER BANK — placeholders that exercise the chat UI.
 *
 * Demo builds only. Each answer says it is a demo answer and cites only the
 * demo documents above. None of it is Buff City Soap policy.
 */
export const DEMO_ANSWERS: DemoAnswer[] = [
  {
    id: "ans-demo-opening",
    matchers: ["open the store", "opening", "open for the day", "checklist"],
    quick: "Demo answer: arrive early, walk the floor, count the drawer, and check displays before opening. [Demo]",
    standard:
      "**Demo answer — not Buff City Soap policy.**\n\nA typical opening routine: arrive before opening, walk the floor, count the opening drawer, and make sure displays are stocked and tidy before the doors open.",
    detailed:
      "**Demo answer — not Buff City Soap policy.**\n\n1. Arrive before opening and unlock.\n2. Walk the floor for anything out of place.\n3. Count the opening drawer.\n4. Confirm displays are stocked and tidy.\n\nUpload the real opening checklist to the knowledge base and this answer will come from it instead.",
    citationChunkIds: ["chunk-demo-001"],
    videoIds: [],
    followUps: ["What should I check before closing?"],
  },
  {
    id: "ans-demo-guest",
    matchers: ["guest", "ingredient", "customer", "product question"],
    quick: "Demo answer: greet within a minute, offer a product to try, and send ingredient questions to the label.",
    standard:
      "**Demo answer — not Buff City Soap policy.**\n\nGreet every guest within a minute, ask what brings them in, and offer a product to try. For ingredient questions, point them to the product label — never guess.",
    detailed:
      "**Demo answer — not Buff City Soap policy.**\n\nGreet guests promptly, ask an open question, and let them try a product. Ingredient and allergy questions are answered from the product label only; when in doubt, say so.",
    citationChunkIds: ["chunk-demo-002"],
    videoIds: [],
  },
  {
    id: "ans-demo-attendance",
    matchers: ["attendance", "late", "call out", "call-out", "shift"],
    quick: "Demo answer: be ready at the start of the shift, and call your manager early if you can't make it.",
    standard:
      "**Demo answer — not Buff City Soap policy.**\n\nTeam members are expected to be ready at the start of their shift and to call their manager as early as possible if they cannot make it.",
    detailed:
      "**Demo answer — not Buff City Soap policy.**\n\nBe ready to work at the start of the scheduled shift. If you cannot make it, call your manager directly and as early as possible.",
    citationChunkIds: ["chunk-demo-003"],
    videoIds: [],
  },
];

export const FALLBACK_ANSWER = {
  quick: "That isn't covered by the demo knowledge base. In a live deployment the answer comes from Buff City Soap's own documents.",
  standard:
    "That isn't covered by the demo knowledge base, so there's nothing to cite. In a live deployment the answer is grounded in the documents uploaded to the knowledge base, and when they don't cover something the assistant says so rather than guessing.",
  detailed:
    "That isn't covered by the demo knowledge base, so there's nothing to cite.\n\nIn a live deployment, every answer is grounded in the documents uploaded to the knowledge base and cites them. When the documents don't cover a question, the assistant says so plainly rather than inventing an answer.",
};

export const DEMO_CONVERSATIONS: ChatConversation[] = [];
