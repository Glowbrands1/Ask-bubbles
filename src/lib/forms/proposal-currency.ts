import "server-only";

import { firstNameSuggestAccepted } from "@/lib/ai/first-name-suggest";
import { firstNameSuggestEnabled, partialNameCardCurrentEnabled, severalFormsStayCurrentEnabled } from "@/lib/config/chat-quality-flags";

import { acceptedNameSuggestions } from "./employee-match";
import { isQuestion } from "./employment-change";
import { employeeState, managerContext, samePerson } from "./proposal";
import { isPayrollAnswer } from "./payroll-words";
import { answersToOpenQuestions } from "./question-answers";
import { readFormRequests } from "./form-requests";
import { stateCodePlaceContext } from "./state-code-place";
import { detectTemplateIntent } from "./template-intent";
import type { ChatMessage } from "@/types";

/**
 * ============================================================================
 * AN OLD CARD MUST NEVER FILE A FORM FOR THE WRONG PERSON
 * ============================================================================
 *
 * Production QA, 30 September 2026: after the manager corrected the employee,
 * the card from BEFORE the correction was still on screen with its Create
 * button. The chat now marks such a card superseded and offers nothing on it
 * (`isProposalSuperseded`), but a card lives in browser storage and a button
 * the browser hides is not a guarantee. So creation checks again, here, what
 * the CONVERSATION now says — read by the same code that made the proposal:
 *
 *   THE EMPLOYEE   re-resolved from the manager's own turns with
 *                  `employeeState`. A different person, two people, or a person
 *                  the manager has since said it is NOT for — refused.
 *   THE FORM       the most recent form the manager ASKED FOR in a statement
 *                  (a question such as "is there a transfer form?" asks for
 *                  nothing). A different form — refused.
 *
 * WHAT THIS IS NOT. It is not an authorization check; the template's own
 * permission and the salon scope are enforced by the route as before, and the
 * manual builder may still file for any name typed into it. It answers one
 * question — is this proposal still the one the conversation stands behind? —
 * and where the conversation cannot say (the turns that named the person have
 * scrolled out of the window), it does not refuse on a guess.
 */
export type ProposalCurrency =
  | { current: true }
  /** `resolvedName`: who the conversation names instead, when it names one person. */
  | { current: false; reason: string; resolvedName?: string };

export function checkProposalIsCurrent(input: {
  conversation: readonly { id?: string; role: ChatMessage["role"]; content: string }[];
  templateKey: string;
  employeeName: string;
  /**
   * PREFERRED_NAME_CARD_CURRENT_ENABLED: other names the card's person goes
   * by on the manager's roster ("Kit Dovetail" for Katrin Dovetail), from
   * `preferredNamesOf`. What the conversation typed for one of them is the
   * card's person, and "this isn't for kit dovetail" excludes the card's
   * person; every other check still runs. Empty: as before.
   */
  alsoCalled?: readonly string[];
}): ProposalCurrency {
  // An answer to the position / date / store question is not a name: see `question-answers.ts`.
  const answers = answersToOpenQuestions(input.conversation);
  const turns = input.conversation.filter(
    (message) =>
      message.role === "user" &&
      typeof message.content === "string" &&
      message.content.trim() !== "" &&
      !answers.has(message.content.trim()) &&
      // PAYROLL_TYPO_NOT_A_NAME_ENABLED: "yes payrol ldeduct" answers the payroll question; it names nobody.
      !isPayrollAnswer(message.content),
  );
  const last = turns[turns.length - 1];
  if (!last) return { current: true };

  // An id is provenance only; one the history arrived without is simply absent.
  const prior = turns.slice(0, -1).map((turn) => ({ id: turn.id ?? "", role: turn.role, content: turn.content }));
  /*
   * ONE OF SEVERAL FORMS ASKED FOR IN THE LATEST MESSAGE. "coaching form for
   * Avery and a CA for Jordan" names two people and two forms on purpose; each
   * card is current when the message asked for exactly its form for exactly
   * its person. See `form-requests.ts`.
   */
  const several = readFormRequests(last.content);
  if (several && several.requests.length >= 2) {
    const mine = several.requests.some(
      (request) =>
        request.templateKey === input.templateKey &&
        request.employeeName !== null &&
        samePerson(request.employeeName, input.employeeName),
    );
    return mine
      ? { current: true }
      : {
          current: false,
          reason: "This proposal is out of date: your latest message asked for different forms. Use the newest proposals.",
        };
  }

  /*
   * SEVERAL_FORMS_STAY_CURRENT_ENABLED (audit, 29 Oct 2026): "create a coaching
   * form for Katrin Dovetail and a CA for Rowan Kestrel", then "rowan was late
   * on 10/20" — both cards still on screen, and Katrin's was refused as the
   * conversation "now names more than one person". The message that asked for
   * several forms still stands behind each of its cards while the turns after
   * it name nobody else, exclude nobody on it, and ask for no form.
   */
  if (severalFormsStayCurrentEnabled() && severalStillStand(turns, input)) return { current: true };

  const context = managerContext(prior, { id: last.id, content: last.content });
  let state = employeeState(context);
  // STATE_CODE_NOT_A_PERSON_ENABLED: "at Dodge, NE" is a place; the turns are read again without it.
  const placed = stateCodePlaceContext(context, state.resolution);
  if (placed) state = employeeState(placed);
  const { resolution, excluded } = state;

  if (resolution.kind === "ambiguous") {
    return {
      current: false,
      reason: `This proposal is out of date: the conversation now names more than one person (${resolution.candidates.join(", ")}). Tell Bubbles which one the form is for, then use the newest proposal.`,
    };
  }
  /*
   * "KATLIN" ANSWERED WITH "YES" TO "DID YOU MEAN KAITLYN SMITH?" is still the
   * same person: the manager chose the directory's spelling for what they
   * typed. Only a name they ACCEPTED in this conversation counts — see
   * `acceptedNameSuggestions`. The proposal path re-checked it against the
   * actor's scoped roster before the card ever offered it.
   */
  /*
   * FIRST_NAME_SUGGEST_ENABLED: a name accepted from "Is this for **…**?" /
   * "Did you mean …" covers what the manager typed for it — "katrin dov",
   * "katrin dovtail", "kit dov", "ashby": every word the conversation reads
   * begins a word of the accepted name, or the manager had already typed it
   * when they answered. A later turn naming somebody else is still a
   * correction.
   */
  /*
   * "This isn't for katrin dovetail" after "katrin dov" was accepted: the
   * manager excluded the card's own person, so neither acceptance below may
   * let the card through (audit, 29 Oct 2026). Only with those paths on.
   */
  if (
    (firstNameSuggestEnabled() || partialNameCardCurrentEnabled()) &&
    excluded.some((not) => samePerson(not, input.employeeName) || typedFor(not, input.employeeName))
  ) {
    return {
      current: false,
      reason: `This proposal is out of date: you said the form is not for ${input.employeeName}. Tell Bubbles who it is for.`,
    };
  }
  const alsoCalled = input.alsoCalled ?? [];
  if (excluded.some((not) => alsoCalled.some((name) => samePerson(not, name) || typedFor(not, name)))) {
    return {
      current: false,
      reason: `This proposal is out of date: you said the form is not for ${input.employeeName}. Tell Bubbles who it is for.`,
    };
  }
  const suggested = firstNameSuggestAccepted(input.conversation).some(
    ({ name, answeredAt }) =>
      name.trim().toLowerCase() === input.employeeName.trim().toLowerCase() &&
      resolution.kind === "resolved" &&
      (typedFor(resolution.employeeName, name) || typedBy(input.conversation.slice(0, answeredAt + 1), resolution.employeeName)),
  );
  /*
   * PARTIAL_NAME_CARD_CURRENT_ENABLED: the AI reader filled "katrin dov" as
   * the roster's Katrin Dovetail, with no question asked; the card is still
   * the person the manager typed.
   */
  const partial =
    partialNameCardCurrentEnabled() && resolution.kind === "resolved" && typedFor(resolution.employeeName, input.employeeName);
  const preferred = resolution.kind === "resolved" && alsoCalled.some((name) => typedFor(resolution.employeeName, name));
  const accepted = suggested || partial || preferred || acceptedNameSuggestions(input.conversation).some(
    (name) => name.trim().toLowerCase() === input.employeeName.trim().toLowerCase(),
  );
  if (
    resolution.kind === "resolved" &&
    !samePerson(resolution.employeeName, input.employeeName) &&
    !accepted
  ) {
    return {
      current: false,
      reason: `This proposal is out of date: the conversation now says the form is for ${resolution.employeeName}, not ${input.employeeName}. Use the newest proposal.`,
      resolvedName: resolution.employeeName,
    };
  }
  if (resolution.kind === "missing" && excluded.some((not) => samePerson(not, input.employeeName))) {
    return {
      current: false,
      reason: `This proposal is out of date: you said the form is not for ${input.employeeName}. Tell Bubbles who it is for.`,
    };
  }

  for (const message of [...context.messages].reverse()) {
    if (isQuestion(message.content)) continue;
    const intent = detectTemplateIntent(message.content);
    const asked =
      intent.kind === "explicit"
        ? intent.templateKey
        : intent.kind === "corrective_action" && intent.requestedCreation
          ? "dpoa"
          : null;
    if (asked === null) continue;
    if (asked !== input.templateKey) {
      return {
        current: false,
        reason: "This proposal is out of date: the conversation has since asked for a different form. Use the newest proposal.",
      };
    }
    break;
  }

  return { current: true };
}

function severalStillStand(
  turns: readonly { id?: string; content: string }[],
  input: { templateKey: string; employeeName: string; alsoCalled?: readonly string[] },
): boolean {
  const cardPerson = (name: string) =>
    samePerson(name, input.employeeName) || (input.alsoCalled ?? []).some((other) => samePerson(name, other));
  for (let at = turns.length - 2; at >= 0; at -= 1) {
    const several = readFormRequests(turns[at]!.content);
    if (!several || several.requests.length < 2) continue;
    const named = several.requests.flatMap((request) => (request.employeeName ? [request.employeeName] : []));
    const mine = several.requests.some(
      (request) => request.templateKey === input.templateKey && request.employeeName !== null && cardPerson(request.employeeName),
    );
    if (!mine) return false;
    const later = turns.slice(at + 1);
    if (later.some((turn) => asksForAForm(turn.content))) return false;
    const onTheRequest = (name: string) => named.some((one) => samePerson(one, name) || typedFor(name, one));
    const latest = later.at(-1)!;
    const { resolution, excluded } = employeeState(
      managerContext(
        later.slice(0, -1).map((turn) => ({ id: turn.id ?? "", role: "user" as const, content: turn.content })),
        { id: latest.id, content: latest.content },
      ),
    );
    if (excluded.some((not) => cardPerson(not) || typedFor(not, input.employeeName))) return false;
    if (resolution.kind === "resolved") return onTheRequest(resolution.employeeName);
    if (resolution.kind === "ambiguous") return resolution.candidates.every(onTheRequest);
    return true;
  }
  return false;
}

function asksForAForm(content: string): boolean {
  if (isQuestion(content)) return false;
  const intent = detectTemplateIntent(content);
  return intent.kind === "explicit" || (intent.kind === "corrective_action" && intent.requestedCreation);
}

/** A manager turn up to the answer already said `typed`. */
function typedBy(turns: readonly { readonly role: string; readonly content: string }[], typed: string): boolean {
  const plain = (text: string) => ` ${(text.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? []).join(" ")} `;
  const said = plain(typed);
  return said.trim().length > 0 && turns.some((turn) => turn.role === "user" && plain(turn.content).includes(said));
}

/** Every word of `typed` begins a word of `name`: "katrin dov" and "ashby" were typed for Katrin Dovetail and Quinn Ashby. */
function typedFor(typed: string, name: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
  const full = words(name);
  const said = words(typed);
  return said.length > 0 && said.every((word) => word.length >= 2 && full.some((part) => part.startsWith(word)));
}
