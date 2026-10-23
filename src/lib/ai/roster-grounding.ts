import { locationById } from "@/lib/locations";
import {
  displayName,
  matchEmployeeName,
  rosterNameNamedIn,
  type RosterEmployee,
} from "@/lib/forms/employee-match";

/**
 * A name is an employee only when the scoped Woven roster says so.
 *
 * An exact full name is used. A close spelling is used only when one person
 * is that close, and the directory's spelling is what is kept. Two close
 * people are a question, and the question names each person's store. A word
 * or a topic that nobody on the roster is close to is not a name.
 */

export interface GroundedEmployee {
  readonly name: string;
  readonly employeeId: string | null;
  readonly title: string | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly needsChoice: boolean;
  readonly candidates: readonly GroundedCandidate[];
}

export interface GroundedCandidate {
  readonly employeeId: string;
  readonly name: string;
  readonly title: string | null;
  readonly locationIds: readonly string[];
  readonly locationNames: readonly string[];
}

function places(employee: RosterEmployee): { ids: string[]; names: string[] } {
  const ids = [...employee.locationIds];
  const names = ids.map((id) => locationById(id)?.name).filter((name): name is string => Boolean(name));
  return { ids, names };
}

function fromEmployee(employee: RosterEmployee, needsChoice: boolean, candidates: GroundedCandidate[]): GroundedEmployee {
  const place = places(employee);
  const only = place.ids.length === 1 ? place.ids[0]! : null;
  return {
    name: displayName(employee),
    employeeId: employee.id,
    title: employee.positionName?.trim() || null,
    locationId: only,
    locationName: only ? (locationById(only)?.name ?? null) : null,
    needsChoice,
    candidates,
  };
}

function candidateOf(employee: RosterEmployee): GroundedCandidate {
  const place = places(employee);
  return {
    employeeId: employee.id,
    name: displayName(employee),
    title: employee.positionName?.trim() || null,
    locationIds: place.ids,
    locationNames: place.names,
  };
}

/** Two- and three-word windows, so a sentence can be checked without treating every word as a name. */
function windows(text: string): string[] {
  const words = text
    .replace(/[^\p{L}\p{N}'’.-]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
  const found: string[] = [];
  for (let size = 3; size >= 2; size -= 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      found.push(words.slice(index, index + size).join(" "));
    }
  }
  return found;
}

export function groundEmployee(text: string, roster: readonly RosterEmployee[]): GroundedEmployee | null {
  if (roster.length === 0) return null;
  const named = rosterNameNamedIn(text, roster);
  if (named) {
    const exact = matchEmployeeName(named, roster);
    if (exact.kind === "exact") return fromEmployee(exact.employee, false, [candidateOf(exact.employee)]);
  }

  let choice: GroundedCandidate[] | null = null;
  for (const phrase of windows(text)) {
    const match = matchEmployeeName(phrase, roster);
    if (match.kind === "exact") return fromEmployee(match.employee, false, [candidateOf(match.employee)]);
    if (match.kind === "confirm" && match.candidates.length === 1) {
      return fromEmployee(match.candidates[0]!.employee, false, [candidateOf(match.candidates[0]!.employee)]);
    }
    if (match.kind === "confirm" && match.candidates.length > 1 && !choice) {
      choice = match.candidates.map((candidate) => candidateOf(candidate.employee));
    }
  }
  if (!choice) return null;
  return {
    name: "",
    employeeId: null,
    title: null,
    locationId: null,
    locationName: null,
    needsChoice: true,
    candidates: choice,
  };
}

/** The manager's later words pick one of the people already offered. */
export function chooseRememberedCandidate(
  text: string,
  candidates: readonly GroundedCandidate[],
): GroundedCandidate | null {
  if (candidates.length === 0) return null;
  const said = text.toLowerCase();
  const byStore = candidates.filter((candidate) =>
    candidate.locationNames.some((name) => name.length > 3 && said.includes(name.toLowerCase())),
  );
  if (byStore.length === 1) return byStore[0]!;
  const byName = candidates.filter((candidate) => said.includes(candidate.name.toLowerCase()));
  if (byName.length === 1) return byName[0]!;
  return null;
}

/** The question names each person's store, so two people with one name can be told apart. */
export function duplicateNamePrompt(typed: string, candidates: readonly GroundedCandidate[]): string {
  const lines = candidates.map((candidate, index) => {
    const where = candidate.locationNames.length > 0 ? ` at ${candidate.locationNames.join(", ")}` : "";
    const title = candidate.title ? `, ${candidate.title}` : "";
    return `${index + 1}. ${candidate.name}${title}${where}`;
  });
  return `More than one person matches ${typed}. Which store?\n${lines.join("\n")}`;
}
