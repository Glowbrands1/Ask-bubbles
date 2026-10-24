import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { modelRetryEnabled } from "@/lib/config/chat-quality-flags";
import { requireEnv } from "@/lib/config/server-env";

/**
 * The Anthropic client. Server-only, constructed once.
 *
 * `import "server-only"` is what guarantees ANTHROPIC_API_KEY cannot reach the
 * browser: a client component importing this file fails the build.
 */
let client: Anthropic | null = null;
let retryClient: Anthropic | null = null;

/** SDK defaults. The retry client is a separate instance so the off path never sees a timeout. */
export const MODEL_TIMEOUT_MS = 45_000;
export const MODEL_MAX_RETRIES = 2;

export function getAnthropicClient(): Anthropic {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  if (modelRetryEnabled()) {
    retryClient ??= new Anthropic({ apiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: MODEL_MAX_RETRIES });
    return retryClient;
  }
  client ??= new Anthropic({ apiKey });
  return client;
}

/** Test seam. */
export function __setAnthropicClient(next: Anthropic | null): void {
  client = next;
  retryClient = next;
}

export { Anthropic };
