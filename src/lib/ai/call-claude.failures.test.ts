import { afterEach, describe, expect, it, vi } from "vitest";

import { Anthropic, __setAnthropicClient } from "./anthropic";
import { callClaude } from "./call-claude";
import { AiError } from "./errors";

/**
 * WHAT A REFUSED MODEL CALL LOOKS LIKE FROM OUTSIDE.
 *
 * Production answered every grounded question with "could not produce an
 * answer" while retrieval succeeded, and no log said why: the SDK error was
 * discarded whole. These pin the replacement — a rejection of the deployment's
 * key or model is reported as configuration, every failure leaves one log line
 * with the status, type and request id, and that line never carries the SDK
 * message, which can echo the grounding text.
 */

const SECRET = "GROUNDING-TEXT-THAT-MUST-NOT-BE-LOGGED";

function failWith(status: number | undefined, type: string) {
  const error = Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message: `echo of ${SECRET}` } },
    `echo of ${SECRET}`,
    status ? new Headers({ "request-id": "req_test_123" }) : undefined,
  );
  __setAnthropicClient({ messages: { create: async () => { throw error; } } } as never);
}

const INPUT = { system: "s", grounding: "g", history: [], question: "q", maxTokens: 64 };

async function failure(): Promise<{ error: AiError; logged: string }> {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await callClaude(INPUT);
    throw new Error("callClaude resolved");
  } catch (error) {
    return { error: error as AiError, logged: log.mock.calls.map((call) => call.join(" ")).join("\n") };
  } finally {
    log.mockRestore();
  }
}

afterEach(() => __setAnthropicClient(null));

describe("a rejected key or model is configuration, not a retry", () => {
  for (const [status, type] of [
    [401, "authentication_error"],
    [403, "permission_error"],
    [404, "not_found_error"],
  ] as const) {
    it(`HTTP ${status} is not_configured and names the status`, async () => {
      failWith(status, type);
      const { error, logged } = await failure();
      expect(error).toBeInstanceOf(AiError);
      expect(error.code).toBe("not_configured");
      expect(error.message).toContain(`HTTP ${status}`);
      expect(error.message).not.toContain(SECRET);
      expect(logged).toContain(`status=${status}`);
      expect(logged).toContain(`type=${type}`);
      expect(logged).toContain("request_id=req_test_123");
      expect(logged).not.toContain(SECRET);
    });
  }
});

describe("every other failure stays model_failed, and is logged", () => {
  for (const [status, type] of [
    [400, "invalid_request_error"],
    [429, "rate_limit_error"],
    [529, "overloaded_error"],
  ] as const) {
    it(`HTTP ${status}`, async () => {
      failWith(status, type);
      const { error, logged } = await failure();
      expect(error.code).toBe("model_failed");
      expect(error.message).toMatch(/could not reach the language model/);
      expect(logged).toContain(`status=${status} type=${type} request_id=req_test_123`);
      expect(logged).toMatch(/model="[^"]+" effort="[^"]+"/);
      expect(logged).not.toContain(SECRET);
    });
  }

  it("a connection failure logs its class only", async () => {
    failWith(undefined, "unused");
    const { error, logged } = await failure();
    expect(error.code).toBe("model_failed");
    expect(logged).toContain("status=none type=unknown request_id=none");
    expect(logged).not.toContain(SECRET);
  });
});
