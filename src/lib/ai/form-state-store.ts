import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { ConfirmedFormFields } from "./form-field-state";
import { formStateFromRow, parseFormState, type ConversationFormState, type StoredFormState } from "./form-state";

/**
 * chat_form_state, service role only. A missing table (the migration has
 * not been applied) is treated as no stored state, and the turn continues
 * on the conversation text alone.
 */

export async function loadConversationFormState(input: {
  readonly userId: string;
  readonly conversationId: string;
}): Promise<StoredFormState | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("chat_form_state")
      .select("fields, incident_key")
      .eq("user_id", input.userId)
      .eq("conversation_id", input.conversationId)
      .maybeSingle();
    if (error || !data) return null;
    return formStateFromRow(data);
  } catch {
    return null;
  }
}

export async function saveConversationFormState(input: {
  readonly userId: string;
  readonly conversationId: string;
  readonly fields: ConfirmedFormFields;
  readonly incidentKey: string | null;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from("chat_form_state").upsert(
      {
        user_id: input.userId,
        conversation_id: input.conversationId,
        fields: input.fields,
        incident_key: input.incidentKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );
  } catch {
    // The answer does not depend on the write.
  }
}

export async function loadFormState(userId: string, conversationId: string): Promise<ConversationFormState | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("chat_form_state")
      .select("state")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error || !data) return null;
    return parseFormState(data.state);
  } catch {
    return null;
  }
}

export async function saveFormState(userId: string, conversationId: string, state: ConversationFormState): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin().from("chat_form_state").upsert(
      {
        user_id: userId,
        conversation_id: conversationId,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,conversation_id" },
    );
    if (error) return;
  } catch {
    // The migration has not been applied. The turn keeps the answer it has.
  }
}
