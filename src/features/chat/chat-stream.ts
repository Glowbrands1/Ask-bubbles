import { AiError } from "@/lib/ai/errors";
import type { AskResponse, ClientAskRequest } from "@/lib/ai/types";

/**
 * Reads a server-sent event from one blank-line-separated block.
 * Used by the streaming ask, and tested without a network call.
 */
export function parseSseBlock(block: string): { event: string; data: unknown } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * POST /api/chat with the stream header. The flag is checked by the caller
 * and again by the route. A non-stream error body is still an AiError.
 */
export async function askChatStream(
  request: ClientAskRequest,
  onSnapshot: (text: string) => void,
): Promise<AskResponse> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-chat-stream": "1" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new AiError(
      "model_failed",
      "Ask Bubbles could not be reached. Check your connection and try again.",
      503,
      [],
    );
  }

  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      missing?: string[];
    };
    if (!response.ok) {
      throw new AiError(
        (payload.code as AiError["code"]) ?? "model_failed",
        payload.error ?? "Ask Bubbles could not answer that right now.",
        response.status,
        payload.missing ?? [],
      );
    }
    return payload as AskResponse;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new AiError("model_failed", "Ask Bubbles could not answer that right now.", 502);
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: AskResponse | null = null;
  while (true) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const parsed = parseSseBlock(block);
      if (!parsed || !parsed.data || typeof parsed.data !== "object") continue;
      const data = parsed.data as { text?: unknown; error?: unknown; code?: unknown; missing?: unknown };
      if (parsed.event === "delta" && typeof data.text === "string") onSnapshot(data.text);
      if (parsed.event === "done") donePayload = parsed.data as AskResponse;
      if (parsed.event === "error") {
        throw new AiError(
          (typeof data.code === "string" ? data.code : "model_failed") as AiError["code"],
          typeof data.error === "string" ? data.error : "Ask Bubbles could not answer that right now.",
          response.ok ? 502 : response.status,
          Array.isArray(data.missing) ? data.missing.filter((item) => typeof item === "string") : [],
        );
      }
    }
  }
  if (!donePayload) {
    throw new AiError("model_failed", "Ask Bubbles could not answer that right now.", 502);
  }
  return donePayload;
}
