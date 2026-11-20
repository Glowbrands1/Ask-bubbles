import "server-only";

import { hasPermission, DEFAULT_PERMISSION_MATRIX } from "@/lib/permissions";
import type { Role } from "@/types";

import {
  asksWhoDeletedAForm,
  deletedFormsEmployee,
  FORM_DELETIONS_MAX,
  formatFormDeletionsBlock,
  formDeletionsNotPermittedBlock,
  formDeletionsUnavailableBlock,
  type FormDeletionRow,
} from "./form-deletions-chat";

/**
 * The FORM DELETION RECORD block for a chat turn (see `form-deletions-chat.ts`): null unless the turn asks who
 * deleted a form; a decline for anyone without Manage users; otherwise the record, newest first.
 */
export async function loadFormDeletionsChatBlock(input: { readonly question: string; readonly role: Role | null }): Promise<string | null> {
  if (!asksWhoDeletedAForm(input.question)) return null;
  if (input.role === null || !hasPermission(DEFAULT_PERMISSION_MATRIX, input.role, "manage_users")) return formDeletionsNotPermittedBlock();
  const employee = deletedFormsEmployee(input.question);
  try {
    return formatFormDeletionsBlock(await readFormDeletions(employee), employee);
  } catch {
    return formDeletionsUnavailableBlock();
  }
}

async function readFormDeletions(employee: string | null): Promise<FormDeletionRow[]> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/server");
  let query = getSupabaseAdmin()
    .from("form_instance_deletions")
    .select("template_name, employee_name, form_date, status, location_name, deleted_by, deleted_by_role, deleted_via, deleted_at");
  // The forms' own employee-name search shape (part of the name, any case); characters the filter syntax reads are dropped.
  const said = (employee ?? "").replace(/[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim();
  if (said) query = query.or(`employee_name.ilike.*${said}*`);
  const { data, error } = await query.order("deleted_at", { ascending: false }).limit(FORM_DELETIONS_MAX);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  const { readUser } = await import("@/lib/admin/user-directory");
  const names = new Map<string, string | null>();
  for (const id of new Set(rows.map((row) => row.deleted_by).filter((id): id is string => typeof id === "string" && id !== ""))) {
    names.set(id, await readUser(id).then((user) => user.displayName).catch(() => null));
  }
  return rows.map((row) => ({
    templateName: (row.template_name as string | null) ?? null,
    employeeName: (row.employee_name as string | null) ?? null,
    formDate: (row.form_date as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    locationName: (row.location_name as string | null) ?? null,
    deletedBy: (row.deleted_by as string | null) ?? null,
    deletedByName: typeof row.deleted_by === "string" ? names.get(row.deleted_by) ?? null : null,
    deletedByRole: (row.deleted_by_role as string | null) ?? null,
    deletedVia: String(row.deleted_via ?? "other"),
    deletedAt: String(row.deleted_at ?? ""),
  }));
}
