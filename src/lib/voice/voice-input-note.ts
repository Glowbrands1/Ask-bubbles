import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A CHAT TURN WHOSE TEXT CAME FROM THE MIC (VOICE_INPUT_ENABLED).
 *
 * `/api/chat` accepts `inputMode: "voice"`, `voiceTraceId` and `voiceEdited`, and runs the turn inside this note; the
 * chat trace row then carries `slots.voice_input = { trace_id, edited }` (`ai/chat-trace.ts`), whichever path wrote the
 * row. That is all it does: the note changes no decision, is never a reason to skip the agent loop, and is read by
 * nothing else.
 */
export interface VoiceInputNote {
  readonly trace_id: string;
  readonly edited: boolean;
}

const storage = new AsyncLocalStorage<VoiceInputNote>();

export function runWithVoiceInput<T>(note: VoiceInputNote | null, run: () => T): T {
  return note ? storage.run(note, run) : run();
}

/** The rest of this request runs with the note (the chat route parses its body inside its own handler). */
export function noteVoiceInput(note: VoiceInputNote | null): void {
  if (note) storage.enterWith(note);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The three fields, validated: `inputMode` only "voice", `voiceTraceId` a UUID, `voiceEdited` a boolean. Else null. */
export function voiceInputFields(body: { inputMode?: unknown; voiceTraceId?: unknown; voiceEdited?: unknown } | null | undefined): {
  inputMode: "voice";
  voiceTraceId: string;
  voiceEdited: boolean;
} | null {
  if (!body || body.inputMode !== "voice") return null;
  if (typeof body.voiceTraceId !== "string" || !UUID.test(body.voiceTraceId)) return null;
  if (typeof body.voiceEdited !== "boolean") return null;
  return { inputMode: "voice", voiceTraceId: body.voiceTraceId, voiceEdited: body.voiceEdited };
}

export function voiceInputNote(): VoiceInputNote | undefined {
  return storage.getStore();
}
