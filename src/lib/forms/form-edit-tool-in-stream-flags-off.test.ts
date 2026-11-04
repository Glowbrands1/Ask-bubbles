import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * FORM_EDIT_TOOL_IN_STREAM_ENABLED OFF: THE MAIN REQUEST, BYTE FOR BYTE
 * ============================================================================
 *
 * Step 3. The answering call (`callClaude`) is given the same input it gets
 * today, created and streamed, with the prompt cache on and off, history in
 * both window policies and every optional block; every request body the
 * Anthropic client receives is recorded. With the flag off (unset, and with
 * only FORM_EDIT_SINGLE_WRITER_ENABLED on) the bodies are those of main
 * before this flag (bffe48cf), recorded in
 * `form-edit-tool-in-stream-flags-off.main.json` (`RECORD_MAIN_FIXTURE=1` on
 * that commit rewrites it): no `tools`, no `tool_choice`, no DATA block.
 *
 * The chat route's half — the same chats with the flag off reach no tool and
 * never load `form-edit-tool` — is pinned by
 * `form-edit-single-writer-flags-off.test.ts` (its flag-off runs are main's
 * replies, rows and events byte for byte) and by the e2e test's flag-alone
 * case (`form-edit-tool-in-stream-e2e.test.ts`).
 */

const sent = vi.hoisted(() => ({ bodies: [] as string[], toolModule: 0 }));

vi.mock("@/lib/forms/form-edit-tool", async (importOriginal) => {
  sent.toolModule += 1;
  return importOriginal();
});

// The fixture names the default model and effort, whatever the shell sets.
vi.mock("@/lib/config/models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/models")>()),
  CLAUDE_MODEL: "claude-sonnet-5",
  CLAUDE_EFFORT: "medium",
}));

vi.mock("@/lib/ai/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic")>();
  const message = { stop_reason: "end_turn", content: [{ type: "text", text: "An answer." }], usage: { input_tokens: 1, output_tokens: 1 } };
  return {
    ...actual,
    getAnthropicClient: () => ({
      messages: {
        create: async (body: unknown) => {
          sent.bodies.push(`create ${JSON.stringify(body)}`);
          return message;
        },
        stream: (body: unknown) => {
          sent.bodies.push(`stream ${JSON.stringify(body)}`);
          return {
            on() {
              return this;
            },
            finalMessage: async () => message,
          };
        },
      },
    }),
  };
});

const FLAGS = ["FORM_EDIT_TOOL_IN_STREAM_ENABLED", "FORM_EDIT_SINGLE_WRITER_ENABLED", "CHAT_TRACE_ENABLED", "PROMPT_CACHE_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED"] as const;
const saved = new Map<string, string | undefined>();
beforeAll(() => {
  for (const name of FLAGS) saved.set(name, process.env[name]);
});
afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function setFlags(on: readonly string[]) {
  for (const name of FLAGS) delete process.env[name];
  for (const name of on) process.env[name] = "true";
}

const HISTORY = [
  { role: "user", content: "Create a Corrective Action for Marnie Quill, she was late to open on 10-20-26" },
  { role: "assistant", content: "Here is the Corrective Action Form for **Marnie Quill**." },
  { role: "user", content: "   " },
];

/** Today's inputs to the answering call: every block, both history policies, a cached manual or none. */
async function bodies(): Promise<string[]> {
  const { callClaude } = await import("@/lib/ai/call-claude");
  sent.bodies.length = 0;
  const base = {
    system: "You are the assistant.",
    grounding: "SOURCES\n\n[S1] JBA Policy Manual — p.4\nArrive on time.",
    reportData: "REPORT DATA\n\nnone",
    personMemory: "WHAT THIS MANAGER SAID BEFORE\n\nnothing",
    formsLibrary: "FORMS LIBRARY\n\nCorrective Action Form",
    verifiedRecords: "VERIFIED RECORDS\n\nMarnie Quill — West Dodge Rd",
    formRecords: "FORMS ON FILE\n\nnone",
    history: HISTORY,
    question: "fix her last name, it is Quill-Hart",
    maxTokens: 1200,
  };
  await callClaude(base);
  await callClaude({ ...base, historyPolicy: "budget", priorSummary: "She was late once before." });
  await callClaude({ ...base, cachedContext: "THE POLICY MANUAL\n\np.4 Arrive on time." });
  await callClaude({ system: "plain", grounding: "", history: [], question: "what policy does that fall under?", maxTokens: 400 });
  return [...sent.bodies];
}

const FIXTURE = join("src", "lib", "forms", "form-edit-tool-in-stream-flags-off.main.json");
const RECORDING = process.env.RECORD_MAIN_FIXTURE === "1";

describe("FORM_EDIT_TOOL_IN_STREAM_ENABLED off: the answering request, byte for byte", () => {
  const runs: Record<string, string[]> = {};

  it("created (no stream flag) and streamed (trace, cache, manual flags), with the flag unset and with only the single writer on", async () => {
    setFlags([]);
    runs.create = await bodies();
    setFlags(["CHAT_TRACE_ENABLED", "PROMPT_CACHE_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED"]);
    runs.stream = await bodies();
    if (RECORDING) {
      writeFileSync(FIXTURE, `${JSON.stringify(runs, null, 1)}\n`);
      return;
    }
    setFlags(["FORM_EDIT_SINGLE_WRITER_ENABLED"]);
    runs.singleWriterCreate = await bodies();
    setFlags(["FORM_EDIT_SINGLE_WRITER_ENABLED", "CHAT_TRACE_ENABLED", "PROMPT_CACHE_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED"]);
    runs.singleWriterStream = await bodies();
    // The tool flag alone is off too (it needs the single writer).
    setFlags(["FORM_EDIT_TOOL_IN_STREAM_ENABLED", "CHAT_TRACE_ENABLED", "PROMPT_CACHE_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED"]);
    runs.toolAloneStream = await bodies();

    expect(existsSync(FIXTURE), `${FIXTURE} is missing`).toBe(true);
    const main = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, string[]>;
    expect(runs.create).toEqual(main.create);
    expect(runs.stream).toEqual(main.stream);
    expect(runs.singleWriterCreate).toEqual(main.create);
    expect(runs.singleWriterStream).toEqual(main.stream);
    expect(runs.toolAloneStream).toEqual(main.stream);
  });

  it.skipIf(RECORDING)("no tools, no tool_choice and no DATA block in any of them; form-edit-tool never loaded", () => {
    for (const body of Object.values(runs).flat()) {
      expect(body).not.toContain('"tools"');
      expect(body).not.toContain('"tool_choice"');
      expect(body).not.toContain("OPEN FORM DATA");
    }
    expect(Object.values(runs).flat().length).toBe(20);
    expect(sent.toolModule).toBe(0);
  });
});
