import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { sameIncident } from "./incident-key";
import { DUPLICATE_DRAFT_WINDOW_HOURS, loadInstance, type InstanceRow } from "./instances";

/**
 * A resent create for the same incident.
 *
 * The card-id match stays where it is. This runs only when
 * DRAFT_DEDUPE_ENABLED is on. A different incident — another date, or a
 * different account of what happened — is not a resend, even for the same
 * employee and store.
 */

export interface ResentDraftWanted {
  readonly templateKey: string;
  readonly employeeName: string;
  readonly createdBy: string;
  readonly incidentKey: string;
  readonly now?: Date;
}

export async function findResentDraft(input: ResentDraftWanted): Promise<InstanceRow | null> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date((input.now ?? new Date()).getTime() - DUPLICATE_DRAFT_WINDOW_HOURS * 3_600_000);
    const { data, error } = await supabase
      .from("chat_form_incidents")
      .select("instance_id, incident_key, created_at")
      .eq("user_id", input.createdBy)
      .eq("template_key", input.templateKey)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !Array.isArray(data)) return null;
    const match = (data as { instance_id?: unknown; incident_key?: unknown }[]).find(
      (row) => typeof row.incident_key === "string" && sameIncident(row.incident_key, input.incidentKey),
    );
    if (!match || typeof match.instance_id !== "string") return null;
    const loaded = await loadInstance(match.instance_id);
    return loaded?.instance.status === "draft" ? loaded.instance : null;
  } catch {
    return null;
  }
}

export async function rememberDraftIncident(input: {
  readonly instanceId: string;
  readonly userId: string;
  readonly templateKey: string;
  readonly employeeName: string;
  readonly incidentKey: string;
}): Promise<void> {
  try {
    await getSupabaseAdmin().from("chat_form_incidents").upsert(
      {
        instance_id: input.instanceId,
        user_id: input.userId,
        template_key: input.templateKey,
        employee_name: input.employeeName,
        incident_key: input.incidentKey,
      },
      { onConflict: "instance_id" },
    );
  } catch {
    // The create already succeeded. Remembering the incident is best-effort.
  }
}
