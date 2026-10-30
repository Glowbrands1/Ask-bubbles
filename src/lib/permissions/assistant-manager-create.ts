import type { Permission, Role } from "@/types";

/**
 * ============================================================================
 * NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED — ONE FLAG, BOTH HALVES
 * ============================================================================
 *
 * Pau, 30 Oct 2026: "Chrisanna is logged into Ask Bubbles, but unable to
 * create coaching forms. Is this a restricted function for AGM's? I believe
 * Ella had the same issue. can u fix this pls have Assistant general manager
 * ability to create forms but not see form from madeline, curt, paulyne,
 * marissa coleen and other admin".
 *
 * Pau then: "also they should only be able to see their OWN forms", "yes all
 * forms but they can only see their own forms in the form register or form
 * monitoring", and of NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED: "lift the
 * block".
 *
 * With the flag on, the Assistant Manager (1) may create the forms in
 * `ASSISTANT_MANAGER_CREATES`, (2) keeps the Forms Register even with the ASD
 * flag on, and (3) sees only the forms they created, everywhere. The three
 * never ship apart: one flag decides them. Read at build time (NEXT_PUBLIC_),
 * so the browser's permission check and the server's agree, like
 * `asd-no-form-monitoring.ts`. Off, as before.
 */
export function assistantManagerCreateEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED;
  return typeof raw === "string" && ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * What the Assistant Manager may create with the flag on (Pau, 30 Oct 2026:
 * "yes all forms"): the location manager's create set — not the performance
 * plans (EPPs), and nothing that manages records, templates or people.
 */
export const ASSISTANT_MANAGER_CREATES: readonly Permission[] = [
  "create_forms",
  "create_coaching_form",
  "create_corrective_action",
  "create_policy_review",
  "create_hiring_form",
  "create_exit_form",
  "create_employment_change_form",
];

/**
 * Pau, 30 Oct 2026: "they can only see their own forms in the form register or
 * form monitoring". With the flag on, an Assistant Manager sees a form only if
 * they created it — in every list, count, badge and chat look-up, and the
 * record itself by id.
 */
export function hiddenFromAssistantManager(
  reader: { id: string; role: Role | null },
  instance: { createdBy: string },
): boolean {
  if (!assistantManagerCreateEnabled() || reader.role !== "assistant_manager") return false;
  return instance.createdBy !== reader.id;
}
