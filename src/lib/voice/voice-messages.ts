/**
 * EVERY SENTENCE VOICE SAYS (VOICE_INPUT_ENABLED), shared by the route and the four boxes' mic. Never a blank and never
 * "No answer was produced". The monthly budget sentence is the chat's own (`MONTHLY_BUDGET_REPLY`, from the spend guard).
 */
export const VOICE_MESSAGES = {
  micBlocked: "Your microphone is blocked. Allow it in your browser or phone settings, or type your message.",
  nothingHeard: "I did not hear anything. Check your microphone and try again.",
  tooLong: "That recording was too long. Keep it under 60 seconds.",
  badAudio: "I could not use that recording. Try again, or type your message.",
  userDay: "You have used today's voice limit. Type your message instead.",
  perMinute: (seconds: number) => `Try again in ${Math.max(1, Math.ceil(seconds))} seconds.`,
  storeDay: "Your store has used today's voice limit. Type your message instead.",
  companyDay: "Voice is paused for today. Type your message instead.",
  busy: "Voice is busy. Try again in a few seconds, or type your message.",
  timeout: "Voice took too long. Your recording was not saved. Try again, or type your message.",
  unavailable: "Voice is not available right now. Please type your message.",
} as const;

/** The notice shown before first use. */
export const VOICE_NOTICE =
  "Voice turns your speech into text using AssemblyAI, a speech service. Your recording is sent to them, including any names you say, and the names of the people and stores you work with may be sent as spelling hints. We do not keep the recording. After you press Send, the text is stored like a typed message. Check the words before you send.";

/** The line under the box while voice is on. */
export const VOICE_HINT = "Voice sends your recording to AssemblyAI to make text.";

/** After a transcript lands in the box. */
export const VOICE_CHECK = "Check the words, then press Send";

export type VoiceMimeKind = "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/wav";

/** What the first bytes say: WebM 1A 45 DF A3, MP4 "ftyp" at offset 4, Ogg "OggS", WAV "RIFF". */
export function sniffMime(bytes: Uint8Array): VoiceMimeKind | null {
  const at = (offset: number, ...expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte);
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return "audio/webm";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return "audio/mp4";
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return "audio/ogg";
  if (at(0, 0x52, 0x49, 0x46, 0x46)) return "audio/wav";
  return null;
}
