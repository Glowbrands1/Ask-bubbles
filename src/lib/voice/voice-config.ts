import { envFlag } from "@/lib/config/chat-quality-flags";
import { isDemoMode } from "@/lib/config/runtime";

/**
 * WHO MAY USE VOICE (VOICE_INPUT_ENABLED, default off; the owner, 27 Nov 2026).
 *
 * Voice is a way to fill a text box, and only for the pilot list: the server variable `VOICE_INPUT_USERS`, a comma
 * list of emails (never NEXT_PUBLIC_, never in the repository, never logged, never sent to the browser), compared with
 * the VERIFIED signed-in email ignoring case and surrounding spaces. Empty or missing means nobody.
 * A single "*" means everyone signed in (the owner, 27 Nov 2026: "roll out the mic to all pls, all users + all apps").
 *
 * Off in every one of these cases: the flag off, demo mode, no `ASSEMBLYAI_API_KEY`, no email, an email not listed.
 * The email always comes from the server session (`authorizeRequest`, `pageIdentity()`, `l10Viewer()`), never from a
 * request body or a header the browser sends. The browser only ever learns yes or no.
 */
export function voiceInputEnabledFor({ email }: { email: string | null | undefined }): boolean {
  if (!envFlag("VOICE_INPUT_ENABLED")) return false;
  if (isDemoMode()) return false;
  if (!voiceProviderKey()) return false;
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return false;
  const list = voicePilotEmails();
  return list.includes("*") || list.includes(wanted);
}

/** The server key, or null. Never logged, never returned. */
export function voiceProviderKey(): string | null {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  return key ? key : null;
}

function voicePilotEmails(): string[] {
  return (process.env.VOICE_INPUT_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}
