import { titleOfTheEmployeeEnabled } from "@/lib/config/chat-quality-flags";
import { displayName, normalizeTypedName, type RosterEmployee } from "@/lib/forms/employee-match";
import { titleNamesAnotherPerson } from "@/lib/forms/title-of-another-person";

import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * THE CARD'S POSITION IS THE EMPLOYEE'S — TITLE_OF_THE_EMPLOYEE_ENABLED
 * ============================================================================
 *
 * QA, 5 Nov 2026, R2 (a store manager's production chat): one employee's
 * story named their district manager in passing ("When <employee> spoke with
 * District manager <name> …"), and the card's Position was "District Manager".
 * The card is built where the title the manager stated wins over Woven's
 * (a protected step); this runs after it, on the finished card.
 *
 * When every place the manager's turns write the card's title it stands beside
 * another named person (`forms/title-of-another-person.ts`), the title is that
 * person's: the card takes the employee's own position from the roster this
 * manager may see, or none, and a "**Position:** <title>" line in the reply
 * follows. Default off: the response as built.
 */
export async function withTitleOfTheEmployee(
  response: AskResponse,
  request: Pick<AskRequest, "question" | "history">,
  roster: () => Promise<readonly RosterEmployee[]>,
): Promise<AskResponse> {
  if (!titleOfTheEmployeeEnabled()) return response;
  const card = response.formProposal;
  const role = card?.employeeRole?.trim();
  if (!card || !role || !card.employeeName || card.subject === "team") return response;
  const said = [...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content), request.question].join("\n");
  if (!titleNamesAnotherPerson(said, role, card.employeeName)) return response;
  const wanted = normalizeTypedName(card.employeeName);
  const own = (await roster()).find((person) => normalizeTypedName(displayName(person)) === wanted)?.positionName?.trim() || null;
  const content = own
    ? response.content.split(`**Position:** ${role}`).join(`**Position:** ${own}`)
    : response.content;
  return {
    ...response,
    content,
    formProposal: { ...card, employeeRole: own, employeeRoleSource: own ? "woven" : null },
  };
}
