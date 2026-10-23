import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { ConfirmedFormFields } from "./form-field-state";
import { formStateFromRow, type StoredFormState } from "./form-state";

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
