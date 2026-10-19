import "server-only";

/**
 * ============================================================================
 * WOVEN_TERMINATION_ENFORCEMENT — the ONE switch that lets Woven disable an account
 * ============================================================================
 *
 *   unset / empty / "off"   (default) nothing is ever disabled. The Access
 *                           Preview and shadow mode behave exactly as before.
 *   "on"                    each successful scheduled directory sync may
 *                           DISABLE the Ask Bubbles account (and ban + revoke
 *                           the auth sessions) of an employee Woven calls
 *                           Terminated — see `terminate.ts` for every condition.
 *
 * FAILS CLOSED. Only the exact word "on" (any case, surrounding spaces ignored)
 * enables it. "true", "1", "yes", "apply" or a typo are NOT "on": they are
 * reported as a problem and treated as off, so a misconfiguration can never
 * switch enforcement on.
 *
 * INDEPENDENT OF WOVEN_ACCESS_MODE, which still has no apply value
 * ("off" | "shadow"). This switch enables exactly one capability and nothing
 * else: no account is created, invited, re-roled, re-scoped or re-enabled by it.
 *
 *   WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS=<id>,<id>   (optional)
 *     While set, only these Woven EmployeeIDs may be disabled — a controlled
 *     first batch. A malformed list turns enforcement OFF. Unset: every
 *     eligible employee.
 */

export const WOVEN_TERMINATION_ENFORCEMENT_ENV = "WOVEN_TERMINATION_ENFORCEMENT";
export const WOVEN_TERMINATION_EMPLOYEE_IDS_ENV = "WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS";

export interface TerminationEnforcementConfig {
  enabled: boolean;
  /** null: every eligible employee. A list: only these EmployeeIDs. */
  employeeAllowlist: string[] | null;
  problem: string | null;
}

const OFF = (problem: string | null): TerminationEnforcementConfig => ({ enabled: false, employeeAllowlist: null, problem });
const EMPLOYEE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export function readTerminationEnforcement(env: Record<string, string | undefined> = process.env): TerminationEnforcementConfig {
  const raw = (env[WOVEN_TERMINATION_ENFORCEMENT_ENV] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "off") return OFF(null);
  if (raw !== "on") return OFF(`${WOVEN_TERMINATION_ENFORCEMENT_ENV} must be "on" or "off". It was treated as off.`);

  const ids = (env[WOVEN_TERMINATION_EMPLOYEE_IDS_ENV] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (ids.some((id) => !EMPLOYEE_ID.test(id))) {
    return OFF(`${WOVEN_TERMINATION_EMPLOYEE_IDS_ENV} must be a comma-separated list of Woven EmployeeIDs. Enforcement was treated as off.`);
  }
  return { enabled: true, employeeAllowlist: ids.length > 0 ? [...new Set(ids)] : null, problem: null };
}
