import { fullPositionTitleEnabled } from "@/lib/config/chat-quality-flags";
import { isCompanyPositionTitle } from "@/lib/forms/staff-picker";

import { titleInWords } from "./title-in-words";
import type { AskRequest, AskResponse } from "./types";

/**
 * ============================================================================
 * THE WHOLE TYPED POSITION — FULL_POSITION_TITLE_ENABLED
 * ============================================================================
 *
 * QA task A, 6 Nov 2026: an exit form typed as lines, "<name>\nTeam Member
 * Part Time \n<store>\n…", made the card's Position "Team Member". The title
 * reader matches the shorter title inside the longer one (a protected step);
 * this runs after it, on the finished card.
 *
 * With the flag on, when the whole of a line the manager typed — or the rest
 * of a "Position: …" line — is one of the company's position names
 * (`forms/staff-picker.ts`, `isCompanyPositionTitle`) and holds the title the
 * card read, the card's Position is that whole position, and the reply's
 * "**Position:**" / "**Job Title:**" line follows. A title with other words
 * after it ("Team Member Weekends Only") is not a position name and stays as
 * read. Only a title the manager stated is changed, never Woven's. Default
 * off: the response as built.
 */

const LABEL = /^(?:job\s+title|position|title|role)\s*(?:is|was|:|-)\s*/i;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "team member part time" → "Team Member Part Time"; a typed capital stays. */
function capitalised(title: string): string {
  return title.replace(/(^|\s)(\p{Ll})/gu, (_, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

/** The typed lines whose whole text (or the rest after a "Position:" label) is one of the company's positions. */
export function typedPositionTitles(turns: readonly string[]): string[] {
  const found: string[] = [];
  for (const turn of turns) {
    for (const raw of turn.split("\n")) {
      const line = raw
        .replace(/^\s*[-*•]\s+/, "")
        .trim()
        .replace(/[.,;:!?]+$/, "")
        .trim()
        .replace(/\s+/g, " ");
      const title = line.replace(LABEL, "");
      if (title !== "" && isCompanyPositionTitle(title)) found.push(capitalised(title));
    }
  }
  return found;
}

/** The whole company position the manager typed that holds `role` and is longer than it, or null. */
export function fullPositionTitle(turns: readonly string[], role: string): string | null {
  const longer = typedPositionTitles(turns).filter((title) => title.toLowerCase() !== role.trim().toLowerCase() && titleInWords(role, title));
  return longer.at(-1) ?? null;
}

export function withFullPositionTitle(response: AskResponse, request: Pick<AskRequest, "question" | "history">): AskResponse {
  if (!fullPositionTitleEnabled()) return response;
  const card = response.formProposal;
  const role = card?.employeeRole?.trim();
  if (!card || !role || !card.employeeName || card.subject === "team" || card.employeeRoleSource === "woven") return response;
  const said = [...(request.history ?? []).filter((turn) => turn.role === "user").map((turn) => turn.content), request.question];
  const full = fullPositionTitle(said, role);
  if (!full) return response;
  // The reply's own line for the title, as the card had it ("**Job Title:** Team Member"), not a longer title already there.
  const line = new RegExp(`(\\*\\*(?:Position|Job Title):\\*\\* )${escaped(role)}(?![\\p{L}'’-]|[^\\S\\n]+\\p{Lu})`, "gu");
  return {
    ...response,
    content: response.content.replace(line, `$1${full}`),
    formProposal: { ...card, employeeRole: full, employeeRoleSource: "manager" },
  };
}
