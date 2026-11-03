/**
 * ============================================================================
 * DIRECTORY ROWS THAT ARE NOT PEOPLE — A REVIEWED LIST OF WOVEN EMPLOYEE IDS
 * ============================================================================
 *
 * ROSTER_STORE_SCOPED_ENABLED (master plan step 1, 3 Nov 2026; same mechanism
 * in both apps). Each Buff City Soap store has a shared Woven login — "Dodge
 * Account", "Kearney Account" — that Woven lists as an active "Team Member Full
 * Time" with a hire date. No column tells it apart from a person, and its name
 * is two ordinary words ("Dodge" is a store, "Account" a surname to the
 * directory), so it was offered as an employee and matched as a name.
 *
 * The only reliable mark is the Woven employee id, so that is what this list
 * holds: one reviewed entry per login — the Woven id (`employee_access_directory
 * .external_employee_id`) and why it is not a person. Never names or phrases.
 * Read from the directory on 3 Nov 2026 (read-only); Pau reviews it in the
 * pull request. A new store login is added here by hand, in a reviewed change.
 *
 * NO DATABASE TABLE AND NO MIGRATION, by the plan: the directory stays the
 * Woven sync's, untouched.
 */
export interface NonPersonRow {
  /** `employee_access_directory.external_employee_id` — the Woven employee id. */
  readonly wovenEmployeeId: string;
  readonly reason: string;
}

export const ROSTER_NON_PERSON: readonly NonPersonRow[] = [
  { wovenEmployeeId: "bdfea352-5805-42e9-983d-1000568a662e", reason: "Shared store login (Bellevue Account), not a person" },
  { wovenEmployeeId: "52ef98ab-0dd6-4091-a6cc-00cac13234ef", reason: "Shared store login (Dawley Farms Account), not a person" },
  { wovenEmployeeId: "25edf0b1-bb48-4b95-a7d5-f76d8be1dd13", reason: "Shared store login (Dodge Account), not a person" },
  { wovenEmployeeId: "82dcec44-9e78-4b3f-8899-c89966c89a41", reason: "Shared store login (Grand Island Account), not a person" },
  { wovenEmployeeId: "abb7e0f4-eb59-4903-b352-2d0ba216a962", reason: "Shared store login (Kearney Account), not a person" },
  { wovenEmployeeId: "9680245c-314b-4203-a81e-e708b26ccf72", reason: "Shared store login (Lee's Summit Account), not a person" },
  { wovenEmployeeId: "73036fd2-be5e-4c0c-b7f7-b62a2ccf2727", reason: "Shared store login (Sioux Falls Account), not a person" },
];

const NON_PERSON_IDS: ReadonlySet<string> = new Set(ROSTER_NON_PERSON.map((row) => row.wovenEmployeeId));

/** True for a directory row the reviewed list says is not a person. */
export function isNonPersonWovenId(wovenEmployeeId: string | null | undefined): boolean {
  return typeof wovenEmployeeId === "string" && NON_PERSON_IDS.has(wovenEmployeeId);
}
