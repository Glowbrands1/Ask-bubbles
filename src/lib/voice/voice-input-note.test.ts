import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { finishChatTrace, openChatTrace } from "@/lib/ai/chat-trace";
import { __setSupabaseAdmin } from "@/lib/supabase/server";

import { noteVoiceInput, runWithVoiceInput, voiceInputFields } from "./voice-input-note";

const TRACE = "0e7d9c1a-2b3c-4d5e-8f90-a1b2c3d4e5f6";

describe("the chat's voice fields (VOICE_INPUT_ENABLED)", () => {
  it("accepts inputMode 'voice' only, a UUID trace id and a boolean", () => {
    expect(voiceInputFields({ inputMode: "voice", voiceTraceId: TRACE, voiceEdited: true })).toEqual({ inputMode: "voice", voiceTraceId: TRACE, voiceEdited: true });
    expect(voiceInputFields({ inputMode: "typed", voiceTraceId: TRACE, voiceEdited: true })).toBeNull();
    expect(voiceInputFields({ inputMode: "voice", voiceTraceId: "not-a-uuid", voiceEdited: true })).toBeNull();
    expect(voiceInputFields({ inputMode: "voice", voiceTraceId: TRACE, voiceEdited: "yes" })).toBeNull();
    expect(voiceInputFields({})).toBeNull();
    expect(voiceInputFields(null)).toBeNull();
  });

  it("the chat trace row carries slots.voice_input = { trace_id, edited }, and nothing when typed", async () => {
    const rows: Record<string, unknown>[] = [];
    __setSupabaseAdmin({ from: () => ({ insert: async (row: Record<string, unknown>) => (rows.push(row), { error: null }) }) } as never);
    const draft = () => openChatTrace({ conversationId: "conv_x", messageId: "msg_x", userId: "user-ada", originalQuery: "q", formInProgress: false });
    await runWithVoiceInput({ trace_id: TRACE, edited: false }, () => finishChatTrace(draft(), async () => "answer"));
    await finishChatTrace(draft(), async () => "answer");
    await vi.waitFor(() => expect(rows).toHaveLength(2));
    expect((rows[0].slots as Record<string, unknown>).voice_input).toEqual({ trace_id: TRACE, edited: false });
    expect((rows[1].slots as Record<string, unknown> | null)?.voice_input).toBeUndefined();
    __setSupabaseAdmin(null);
  });

  it("noteVoiceInput with nothing does nothing", () => {
    expect(() => noteVoiceInput(null)).not.toThrow();
  });
});
