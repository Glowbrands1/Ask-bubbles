import "server-only";

import { CLAUDE_READER_MODEL } from "@/lib/config/models";
import { requireEnv } from "@/lib/config/server-env";
import { activeSpendMeter } from "@/lib/ai/spend-meter";

/**
 * ============================================================================
 * THE POLICY-PICK MODEL CALL (POLICY_CITATION_CHECK_ENABLED)
 * ============================================================================
 *
 * The second of the two modules that load the AI SDK (the first is
 * `forms/form-patch-call.ts`), and the same way: a dynamic import inside the
 * call, so nothing is loaded until a flag-guarded caller reaches here
 * (`policy-from-manual/no-import.test.ts` checks it). Nothing imports this
 * module yet.
 *
 * Claude Haiku (CLAUDE_READER_MODEL), temperature 0, 500 output tokens at
 * most, no retries, an 8 s limit. The system text and the manual go in one
 * prompt-cached system message. The usage goes into the request's spend meter
 * when one is running. The raw object is returned unchecked: `resolve.ts`
 * parses it with the zod schema and verifies it against the manual. Never
 * throws: a timeout, an error or no usable object is a fallback.
 */

export const POLICY_PICK_TIMEOUT_MS = 8_000;
export const POLICY_PICK_MAX_OUTPUT_TOKENS = 500;

export interface PolicyPickCallInput {
  readonly system: string;
  /** The manual block that follows the system text. */
  readonly manual: string;
  readonly prompt: string;
  /** The output's JSON schema (`policyPickJsonSchema()`). */
  readonly schema: Record<string, unknown>;
}

export type PolicyPickCallResult =
  | { readonly ok: true; readonly output: unknown }
  | { readonly fallback: "timeout" | "error" | "invalid" };

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

function recordUsage(usage: unknown): void {
  const meter = activeSpendMeter();
  if (!meter || typeof usage !== "object" || usage === null) return;
  const read = usage as {
    inputTokens?: number;
    outputTokens?: number;
    inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  };
  const details = read.inputTokenDetails ?? {};
  meter.calls.push({
    model: CLAUDE_READER_MODEL,
    inputTokens: count(details.noCacheTokens ?? read.inputTokens),
    outputTokens: count(read.outputTokens),
    cacheReadTokens: count(details.cacheReadTokens),
    cacheWriteTokens: count(details.cacheWriteTokens),
  });
}

export async function callPolicyPickModel(input: PolicyPickCallInput): Promise<PolicyPickCallResult> {
  const signal = AbortSignal.timeout(POLICY_PICK_TIMEOUT_MS);
  try {
    const { generateObject, jsonSchema, NoObjectGeneratedError } = await import("ai");
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropic = createAnthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    try {
      const result = await generateObject({
        model: anthropic(CLAUDE_READER_MODEL),
        schema: jsonSchema(input.schema),
        system: [
          {
            role: "system",
            content: `${input.system}\n\n${input.manual}`,
            providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
          },
        ],
        prompt: input.prompt,
        temperature: 0,
        maxOutputTokens: POLICY_PICK_MAX_OUTPUT_TOKENS,
        maxRetries: 0,
        abortSignal: signal,
      });
      recordUsage(result.usage);
      return { ok: true, output: result.object };
    } catch (error) {
      if (signal.aborted) return { fallback: "timeout" };
      if (NoObjectGeneratedError.isInstance(error)) {
        recordUsage(error.usage);
        return { fallback: "invalid" };
      }
      return { fallback: "error" };
    }
  } catch {
    return { fallback: signal.aborted ? "timeout" : "error" };
  }
}
