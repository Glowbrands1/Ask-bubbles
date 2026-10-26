import "server-only";

import { trigramSimilarity } from "@/lib/ai/intake-augment";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { pickCrossChatOpenDraft, type CrossChatDraftRow } from "./cross-chat-draft";
import { draftsFromChat, keepSameChat, type SameChat } from "./draft-same-chat";
import { sameIncident as sameIncidentKey } from "./incident-key";
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
  /** DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED: only a draft this chat made. See `draft-same-chat.ts`. */
  readonly sameChat?: SameChat;
  readonly now?: Date;
}

/**
 * An open draft for the same employee, template, and incident date, from
 * any chat. A different date does not match. The card-id match stays in the
 * route and runs first.
 *
 * WHOSE DRAFT. With DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED off (the default),
 * any manager's draft counts. With it on, the route passes `ownDraftsOnly`
 * and `createdBy`: the query reads only that manager's drafts and the picker
 * checks each row's creator again, so one manager's create is never handed
 * another manager's draft (QA, 25 Oct 2026). Without `createdBy` it finds
 * nothing.
 */
export async function findCrossChatOpenDraft(input: {
  readonly templateKey: string;
  readonly employeeName: string;
  readonly formDate: string;
  /** DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED: only a draft this chat made. */
  readonly sameChat?: SameChat;
  /** DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED: only a draft `createdBy` made. */
  readonly ownDraftsOnly?: boolean;
  readonly createdBy?: string;
}): Promise<InstanceRow | null> {
  try {
    if (input.ownDraftsOnly && !input.createdBy) return null;
    const supabase = getSupabaseAdmin();
    const { data: template, error: templateError } = await supabase
      .from("form_templates")
      .select("id")
      .eq("key", input.templateKey)
      .maybeSingle();
    if (templateError || !template) return null;
    let query = supabase
      .from("form_instances")
      .select("id, employee_name, created_at, form_date, status, created_by")
      .eq("template_id", template.id)
      .eq("status", "draft")
      .eq("form_date", input.formDate)
      .order("created_at", { ascending: false })
      .limit(25);
    if (input.ownDraftsOnly && input.createdBy) query = query.eq("created_by", input.createdBy);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return null;
    const read: CrossChatDraftRow[] = (
      data as {
        id?: unknown;
        employee_name?: unknown;
        created_at?: unknown;
        form_date?: unknown;
        status?: unknown;
        created_by?: unknown;
      }[]
    ).map((row) => ({
      id: String(row.id),
      templateKey: input.templateKey,
      employeeName: String(row.employee_name ?? ""),
      formDate: typeof row.form_date === "string" ? row.form_date : null,
      status: String(row.status ?? ""),
      createdAt: String(row.created_at ?? ""),
      createdBy: typeof row.created_by === "string" ? row.created_by : undefined,
    }));
    const rows = await keepSameChat(read, input.sameChat);
    const id = pickCrossChatOpenDraft(rows, input);
    if (!id) return null;
    const loaded = await loadInstance(id);
    return loaded?.instance.status === "draft" ? loaded.instance : null;
  } catch {
    return null;
  }
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
    const incidents = data as { instance_id?: unknown; incident_key?: unknown }[];
    const mine = input.sameChat
      ? await draftsFromChat(
          incidents.map((row) => String(row.instance_id)),
          input.sameChat.conversationKey,
        )
      : null;
    const match = incidents.find(
      (row) =>
        typeof row.incident_key === "string" &&
        sameIncidentKey(row.incident_key, input.incidentKey) &&
        (!mine || mine.has(String(row.instance_id))),
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

export interface AccountResentRow {
  readonly id: string;
  readonly employeeName: string;
  readonly locationId: string | null;
  readonly createdAt: string;
  readonly narrative?: string | null;
  readonly formDate?: string | null;
}

export interface AccountResentWanted {
  readonly employeeName: string;
  readonly locationId: string | null;
  readonly incident?: string | null;
  readonly formDate?: string | null;
}

export function sameEmployee(left: string, right: string): boolean {
  return left.trim().replace(/\s+/g, " ").toLowerCase() === right.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Whether two accounts are the same incident. An empty draft narrative is
 * not the same incident.
 */
export function sameIncidentNarrative(wanted: string, narrative: string): boolean {
  const left = wanted.trim();
  const right = narrative.trim();
  if (!left || !right) return false;
  if (trigramSimilarity(left, right) >= 0.42) return true;
  const words = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 5),
    );
  const a = words(left);
  const b = words(right);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.5;
}

/** The newest draft that is the same person, form, store, and incident. */
export function pickResentDraft(rows: readonly AccountResentRow[], wanted: AccountResentWanted): string | null {
  const matches = rows.filter((row) => {
    if (!sameEmployee(row.employeeName, wanted.employeeName)) return false;
    if ((row.locationId ?? null) !== (wanted.locationId ?? null)) return false;
    if (wanted.incident == null) return true;
    if (wanted.formDate && row.formDate && wanted.formDate !== row.formDate) return false;
    return sameIncidentNarrative(wanted.incident, row.narrative ?? "");
  });
  if (matches.length === 0) return null;
  const newest = [...matches].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]!;
  return newest.id;
}

const NARRATIVE_FIELD = /coaching_details|follow_up_observation|what_happened|incident|description|narrative|details|policy_language/i;

/**
 * A resent assistant draft for the same incident, read from the form itself.
 * The card-id match is separate and stays first. A missing table returns null.
 */
export async function findAccountResentDraft(input: {
  readonly templateKey: string;
  readonly employeeName: string;
  readonly createdBy: string;
  readonly locationId: string | null;
  readonly incident?: string | null;
  readonly formDate?: string | null;
  /** DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED: only a draft this chat made. */
  readonly sameChat?: SameChat;
  readonly now?: Date;
}): Promise<InstanceRow | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: template, error: templateError } = await supabase
      .from("form_templates")
      .select("id")
      .eq("key", input.templateKey)
      .maybeSingle();
    if (templateError || !template) return null;
    const since = new Date((input.now ?? new Date()).getTime() - DUPLICATE_DRAFT_WINDOW_HOURS * 3_600_000);
    const { data, error } = await supabase
      .from("form_instances")
      .select("id, employee_name, location_id, created_at, form_date")
      .eq("template_id", template.id)
      .eq("created_by", input.createdBy)
      .eq("source", "assistant")
      .eq("status", "draft")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !Array.isArray(data)) return null;
    let rows: AccountResentRow[] = (
      data as { id: unknown; employee_name: unknown; location_id: unknown; created_at: unknown; form_date: unknown }[]
    ).map((row) => ({
      id: String(row.id),
      employeeName: String(row.employee_name ?? ""),
      locationId: (row.location_id as string | null) ?? null,
      createdAt: String(row.created_at ?? ""),
      formDate: typeof row.form_date === "string" ? row.form_date : null,
    }));
    rows = await keepSameChat(rows, input.sameChat);
    if (input.incident != null) {
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return null;
      const { data: values, error: valuesError } = await supabase
        .from("form_instance_values")
        .select("instance_id, field_key, value")
        .in("instance_id", ids);
      if (valuesError || !Array.isArray(values)) return null;
      const narrative = new Map<string, string>();
      for (const row of values) {
        const key = String(row.field_key ?? "");
        const value = String(row.value ?? "").trim();
        if (!value || !NARRATIVE_FIELD.test(key)) continue;
        const id = String(row.instance_id);
        narrative.set(id, [narrative.get(id), value].filter(Boolean).join("\n"));
      }
      rows = rows.map((row) => ({ ...row, narrative: narrative.get(row.id) ?? "" }));
    }
    const id = pickResentDraft(rows, input);
    if (!id) return null;
    const loaded = await loadInstance(id);
    return loaded?.instance.status === "draft" ? loaded.instance : null;
  } catch {
    return null;
  }
}
