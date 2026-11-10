import "server-only";

import { fewShotExamplesEnabled, fewShotTurnJoinEnabled } from "@/lib/config/chat-quality-flags";
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
    // FEWSHOT_TURN_JOIN_ENABLED: the rated answer's own turn, as the sibling app reads it.
    if (fewShotTurnJoinEnabled()) {
      return formatFewShot(question, await ratedExchangesByTurn(supabase), COMPANY_LOCATIONS.map((store) => store.name));
    }
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

/*
 * FEWSHOT_TURN_JOIN_ENABLED (QA, 10 Nov 2026). With FEWSHOT_EXAMPLES on, no rated exchange was ever found here: the
 * loader matched `assistant_feedback.client_message_id` to `chat_traces.message_id`, and in production 0 of 14 ratings
 * since traces began match (all 9 five-star ratings do join their answer through `activity_event_id` =
 * `chat_messages.turn_id`). With the flag on, a 5-star rating is read as the sibling app reads it: its turn's assistant
 * message in `chat_messages`, and the question is the manager's message just before it in the same conversation. The
 * answer text is never selected. Off, the old join, as before.
 */
type Admin = ReturnType<typeof getSupabaseAdmin>;

async function ratedExchangesByTurn(supabase: Admin): Promise<RatedExchange[]> {
  const { data: ratings, error } = await supabase
    .from("assistant_feedback")
    .select("rating, comment, activity_event_id")
    .eq("rating", 5)
    .is("hidden_at", null)
    .limit(50);
  if (error || !ratings || ratings.length === 0) return [];
  const turnIds = ratings
    .map((row) => (typeof row.activity_event_id === "string" ? row.activity_event_id : null))
    .filter((id): id is string => Boolean(id));
  if (turnIds.length === 0) return [];
  const { data: answers, error: answerError } = await supabase
    .from("chat_messages")
    .select("conversation_id, position, role, turn_id")
    .in("turn_id", turnIds)
    .eq("role", "assistant");
  if (answerError || !answers || answers.length === 0) return [];
  const conversations = [...new Set(answers.map((row) => String(row.conversation_id)))];
  const { data: asked, error: askedError } = await supabase
    .from("chat_messages")
    .select("conversation_id, position, role, content")
    .in("conversation_id", conversations)
    .eq("role", "user");
  if (askedError || !asked) return [];
  const commentByTurn = new Map(ratings.map((row) => [String(row.activity_event_id), typeof row.comment === "string" ? row.comment : null]));
  const exchanges: RatedExchange[] = [];
  for (const answer of answers) {
    const before = asked
      .filter((row) => String(row.conversation_id) === String(answer.conversation_id) && Number(row.position) < Number(answer.position))
      .sort((a, b) => Number(b.position) - Number(a.position))[0];
    const question = typeof before?.content === "string" ? before.content.trim() : "";
    if (!question) continue;
    exchanges.push({ rating: 5, question, comment: commentByTurn.get(String(answer.turn_id)) ?? null });
  }
  return exchanges;
}
