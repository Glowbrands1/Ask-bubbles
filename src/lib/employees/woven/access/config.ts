import "server-only";

import { isApplyCapability, SIBLING_ONLY_CAPABILITIES, type ApplyCapability } from "./types";

/**
 * ============================================================================
 * WOVEN_ACCESS_MODE — what the access sync may do beyond the preview
 * ============================================================================
 *
 *   off     (default) the Access Preview calculates and shows the plan;
 *           nothing is recorded and nothing is applied.
 *   shadow  as off, AND each successful scheduled directory sync records the
 *           plan in `employee_access_runs` / `employee_access_actions`
 *           (result = shadow). Nothing is applied.
 *   apply   each successful scheduled directory sync runs the apply step
 *           (`apply.ts`) — but only the capabilities named in
 *           WOVEN_ACCESS_APPLY_ACTIONS, and, while
 *           WOVEN_ACCESS_APPLY_EMPLOYEE_IDS is set, only for those Woven
 *           EmployeeIDs. Every row of the plan is recorded; what was not
 *           applied is recorded as planned or skipped.
 *
 * ONE CAPABILITY IN ASK BUBBLES: DISABLE_TERMINATED (owner, 28 Nov 2026: "make
 * this automatic for both sunny and bubble"). Woven's own Terminated status
 * disables the account and revokes it at the authentication layer (ban +
 * every session). Ported from the sibling app's account lifecycle.
 *
 * NOT PORTED: the sibling's CREATE_USER, SEND_INVITE and LINK_EXISTING. Naming
 * any of them — or anything else, UPDATE_ROLE and UPDATE_PRIMARY_LOCATION
 * included — refuses the configuration: it is reported as a problem and the
 * mode falls back to OFF. A misconfiguration must never widen what runs, and
 * an operator who asked for invitations must not be told they are running.
 * Ask Bubbles' own invitation and new-hire flows are not touched by this mode.
 *
 *   WOVEN_ACCESS_MODE=apply
 *   WOVEN_ACCESS_APPLY_ACTIONS=DISABLE_TERMINATED
 *   WOVEN_ACCESS_APPLY_EMPLOYEE_IDS=<id>,<id>     (optional; unset = everyone)
 *
 * `apply` with no capability listed applies nothing.
 */

export const WOVEN_ACCESS_MODE_ENV = "WOVEN_ACCESS_MODE";
export const WOVEN_ACCESS_APPLY_ACTIONS_ENV = "WOVEN_ACCESS_APPLY_ACTIONS";
export const WOVEN_ACCESS_APPLY_EMPLOYEE_IDS_ENV = "WOVEN_ACCESS_APPLY_EMPLOYEE_IDS";

export type WovenAccessMode = "off" | "shadow" | "apply";

export interface WovenAccessConfig {
  mode: WovenAccessMode;
  /** Only meaningful in apply mode. Empty: nothing is applied. */
  applyActions: ApplyCapability[];
  /** null: every eligible employee. A list: only these EmployeeIDs. */
  employeeAllowlist: string[] | null;
  problem: string | null;
}

const OFF = (problem: string | null): WovenAccessConfig => ({ mode: "off", applyActions: [], employeeAllowlist: null, problem });
const list = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
const EMPLOYEE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export function readWovenAccessConfig(env: Record<string, string | undefined> = process.env): WovenAccessConfig {
  const raw = (env[WOVEN_ACCESS_MODE_ENV] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "off") return OFF(null);
  if (raw === "shadow") return { mode: "shadow", applyActions: [], employeeAllowlist: null, problem: null };
  if (raw !== "apply") {
    return OFF(`${WOVEN_ACCESS_MODE_ENV} must be "off", "shadow" or "apply". It was treated as off.`);
  }

  const actions = list(env[WOVEN_ACCESS_APPLY_ACTIONS_ENV]).map((a) => a.toUpperCase());
  const refused = actions.filter((a) => !isApplyCapability(a));
  if (refused.length > 0) {
    const siblingOnly = refused.filter((a) => (SIBLING_ONLY_CAPABILITIES as readonly string[]).includes(a));
    return OFF(
      `${WOVEN_ACCESS_APPLY_ACTIONS_ENV} may name only DISABLE_TERMINATED; ${refused.join(", ")} is not applied by this sync` +
        (siblingOnly.length > 0 ? ` (${siblingOnly.join(", ")}: not available in Ask Bubbles)` : "") +
        ". Access mode was treated as off.",
    );
  }

  const ids = list(env[WOVEN_ACCESS_APPLY_EMPLOYEE_IDS_ENV]);
  if (ids.some((id) => !EMPLOYEE_ID.test(id))) {
    return OFF(`${WOVEN_ACCESS_APPLY_EMPLOYEE_IDS_ENV} must be a comma-separated list of Woven EmployeeIDs. Access mode was treated as off.`);
  }

  return {
    mode: "apply",
    applyActions: [...new Set(actions)] as ApplyCapability[],
    employeeAllowlist: ids.length > 0 ? [...new Set(ids)] : null,
    problem: null,
  };
}

/** The mode alone, for callers that only display it. */
export function readWovenAccessMode(env: Record<string, string | undefined> = process.env): { mode: WovenAccessMode; problem: string | null } {
  const { mode, problem } = readWovenAccessConfig(env);
  return { mode, problem };
}
