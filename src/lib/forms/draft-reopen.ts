import "server-only";

import { trigramSimilarity } from "@/lib/ai/intake-augment";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import type { FormsActor } from "./access";
import { pickCrossChatOpenDraft, type CrossChatDraftRow } from "./cross-chat-draft";
import { sameIncident as sameIncidentKey } from "./incident-key";
import { actorMaySeeInstance } from "./instance-scope";
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
  /** The caller. A draft is reused only if they may open it — see `reusableDraft`. */
  readonly actor: FormsActor;
  readonly now?: Date;
}

/**
 * A draft the create route may hand back instead of filing a new one: still
 * a draft, the caller's own, and one the caller may open now under the rule
 * the instance GET applies (`actorMaySeeInstance`, which keeps the caller's
 * own form only while their scope still covers its store). Otherwise the
 * card points at a form whose next read is a 404, and a new chat finds the
 * same draft again (ported from the sibling app, conv_mvh1m29j25aig2n).
 */
function reusableDraft(instance: InstanceRow | undefined, actor: FormsActor, createdBy: string): InstanceRow | null {
  if (!instance || instance.status !== "draft" || instance.createdBy !== createdBy) return null;
  return actorMaySeeInstance(actor, instance) ? instance : null;
}

/**
 * An open draft for the same employee, template, and incident date, from
 * any chat. A different date does not match. The card-id match stays in the
 * route and runs first. Only the caller's own draft, at a store they may
 * still open — see `reusableDraft`.
 */
export async function findCrossChatOpenDraft(input: {
  readonly templateKey: string;
  readonly employeeName: string;
  readonly formDate: string;
  readonly createdBy: string;
  readonly actor: FormsActor;
}): Promise<InstanceRow | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: template, error: templateError } = await supabase
      .from("form_templates")
      .select("id")
      .eq("key", input.templateKey)
      .maybeSingle();
    if (templateError || !template) return null;
    const { data, error } = await supabase
      .from("form_instances")
      .select("id, employee_name, created_at, form_date, status, created_by")
      .eq("template_id", template.id)
      .eq("created_by", input.createdBy)
      .eq("status", "draft")
      .eq("form_date", input.formDate)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error || !Array.isArray(data)) return null;
    const rows: CrossChatDraftRow[] = (
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
    let remaining = rows;
    for (let id = pickCrossChatOpenDraft(remaining, input); id; id = pickCrossChatOpenDraft(remaining, input)) {
      const reusable = reusableDraft((await loadInstance(id))?.instance, input.actor, input.createdBy);
      if (reusable) return reusable;
      const skipped = id;
      remaining = remaining.filter((row) => row.id !== skipped);
    }
    return null;
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
    const matches = (data as { instance_id?: unknown; incident_key?: unknown }[]).filter(
      (row) => typeof row.incident_key === "string" && sameIncidentKey(row.incident_key, input.incidentKey),
    );
    for (const match of matches) {
      if (typeof match.instance_id !== "string") continue;
      const reusable = reusableDraft((await loadInstance(match.instance_id))?.instance, input.actor, input.createdBy);
      if (reusable) return reusable;
    }
    return null;
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
