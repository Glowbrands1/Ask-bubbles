import "server-only";

import { fewShotExamplesEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATIONS } from "@/lib/locations";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { formatFewShot, type RatedExchange } from "./feedback-eval";

/**
 * Similar 5-star exchanges, redacted, for the system prompt.
 *
 * The flag is off: nothing is read and the prompt is unchanged. A missing
 * table, or a trace with no question, leaves the prompt unchanged. The
 * answer text is never selected.
 */

export async function loadFewShotBlock(question: string): Promise<string | null> {
  if (!fewShotExamplesEnabled()) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("assistant_feedback")
      .select("rating, comment, client_message_id")
      .eq("rating", 5)
      .is("hidden_at", null)
      .limit(50);
    if (error || !data) return null;
    const ids = data
      .map((row) => (typeof row.client_message_id === "string" ? row.client_message_id : null))
      .filter((id): id is string => Boolean(id));
    const byMessage = new Map<string, string>();
    if (ids.length > 0) {
      const found = await supabase.from("chat_traces").select("message_id, original_query").in("message_id", ids);
      if (!found.error && found.data) {
        for (const row of found.data) {
          if (typeof row.message_id === "string" && typeof row.original_query === "string" && row.original_query.trim()) {
            byMessage.set(row.message_id, row.original_query);
          }
        }
      }
    }
    const exchanges: RatedExchange[] = [];
    for (const row of data) {
      const messageId = typeof row.client_message_id === "string" ? row.client_message_id : null;
      const asked = messageId ? byMessage.get(messageId) : null;
      if (!asked) continue;
      exchanges.push({
        rating: 5,
        question: asked,
        comment: typeof row.comment === "string" ? row.comment : null,
      });
    }
    return formatFewShot(question, exchanges, COMPANY_LOCATIONS.map((store) => store.name));
  } catch {
    return null;
  }
}
