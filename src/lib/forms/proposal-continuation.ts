import type { ChatFormInstanceRef, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * ANSWERING BUBBLES'S QUESTION IS PART OF THE SAME REQUEST
 * ============================================================================
 *
 *   Manager: "Build me a coaching form for that."
 *   Bubbles:   "I don't yet know who this form is about..."
 *   Manager: "Sarah Test"
 *
 * That third turn was routed into ordinary retrieval: `detectTemplateIntent`
 * saw no form words in "Sarah Test" and returned `none`, so the manager
 * answered a direct question and got a knowledge-base answer about a person's
 * name. The proposal they were building silently ended.
 *
 * ============================================================================
 * A HINT, NOT A STATE MACHINE — AND EXPLICITLY NOT THE OLD ONE
 * ============================================================================
 *
 * The prototype solved this with `pendingFormTemplateId` / `pendingFormValues`:
 * a bag of half-filled HR values parked on an assistant turn in browser storage
 * and read back on the next one, where anything still missing became a default.
 * That is not what this is, and the difference is the whole point.
 *
 * THIS CARRIES A TEMPLATE KEY. Nothing else. No employee, no location, no topic,
 * no field value, no status the server would trust. It says only "the last
 * thing Bubbles offered was a form of this kind" — and every fact on the
 * resulting proposal is re-derived from the manager's own turns, exactly as it
 * would be on a first request.
 *
 * ============================================================================
 * WHY A TAMPERED HINT GAINS NOTHING
 * ============================================================================
 *
 * It arrives from browser-local IndexedDB, so treat it as chosen by the caller.
 * The server then resolves it against the published, active library, requires a
 * published current version, and applies the TEMPLATE'S OWN permission to the
 * authenticated identity — the identical path a typed request takes. So the
 * most a forged hint can do is produce a proposal the caller could have
 * produced by typing the template's name, which creates nothing and authorizes
 * nothing.
 *
 * The server narrows it further: a hint is only honoured when the current turn
 * actually reads as INTAKE — an employee name, or a statement of what
 * happened, when, or what it is about (see `continuesIntake` in
 * `lib/ai/form-proposal.ts`). Without that gate, "what is the tardiness
 * policy?" typed after a proposal would be swallowed by the form flow instead
 * of being answered.
 */

/**
 * ============================================================================
 * WHAT THE RIGHT RAIL'S "CREATE A FORM FROM THIS CONVERSATION" SENDS
 * ============================================================================
 *
 * A REQUEST, NOT A COMMAND. The button used to be a `<Link href="/forms/create">`
 * — it navigated away from the conversation the manager was in the middle of,
 * to a builder where they retyped the employee and the incident they had just
 * finished describing.
 *
 * So it now sends this through the ORDINARY send path, and everything the typed
 * flow already does happens unchanged: the bounded manager context, the
 * template-intent read, the continuation hint, the authorized template list,
 * the permission check. The button is a trigger; Chat stays the orchestrator.
 *
 * DELIBERATELY AMBIGUOUS WORDING. `detectTemplateIntent` reads this as "a form,
 * unspecified", so with nothing established the server asks WHICH form and
 * lists the ones this manager may actually create. Defaulting to a coaching
 * form because a coaching form is the common case is the exact failure this
 * workstream removed.
 *
 * Where the conversation HAS established a template — an open proposal on the
 * last assistant turn — the continuation hint carries it and the server
 * continues that one instead of asking again.
 */
export const CREATE_FORM_FROM_CONVERSATION = "Create a form from this conversation.";

export interface ProposalContinuation {
  /** Revalidated server-side against the published library. Never trusted. */
  templateKey: string;
}

/** Bounded like every other caller-supplied string. */
export const CONTINUATION_KEY_MAX = 64;

/**
 * How many plain answers may sit between an open proposal and the turn that
 * continues it. Bounded, so an intake the manager walked away from does not
 * come back an hour later — and the server still continues only a turn that
 * reads as intake, so a question typed meanwhile is still answered.
 */
export const CONTINUATION_ANSWER_LOOKBACK = 3;

/**
 * The manager ending the intake in their own words: "never mind", "cancel
 * that", "no form", "forget the form".
 */
const ENDS_INTAKE =
  /\b(?:never\s*mind|nevermind|cancel(?:\s+(?:it|that|this|the\s+form))?|forget\s+(?:it|that|the\s+form|about\s+it)|no\s+form|(?:don'?t|dont|do\s+not)\s+(?:want|need|make|create|start|draft|file|do|open)\s+(?:a|an|the|this|that|any)?\s*(?:form|paperwork|one)|(?:don'?t|dont|do\s+not)\s+(?:make|create|start|draft|file)\s+(?:it|that|this)|no\s+need\s+for\s+(?:a|the)\s+form|(?:skip|drop|hold\s+off\s+on)\s+(?:the|this|that)\s+form|not\s+(?:doing|filing|making)\s+(?:a|the)\s+form|stop\s+(?:it|that|this|the\s+form))\b/i;

export function endsIntake(text: string): boolean {
  return ENDS_INTAKE.test(text);
}

/**
 * The open proposal the next turn would be continuing, if there is one.
 *
 * ============================================================================
 * AN ADVICE ANSWER DOES NOT END AN UNFINISHED INTAKE
 * ============================================================================
 *
 * VERIFIED IN PRODUCTION QA, 30 September 2026. This used to read ONLY the
 * last assistant turn, so the moment one reply in an intake went to the
 * grounded path — "employee: avery testperson" read as nobody, say — the
 * Coaching intake was gone, and "I already said Avery Testperson", typed
 * twice more, could never bring the card back.
 *
 * So the walk looks past plain answers, up to `CONTINUATION_ANSWER_LOOKBACK`
 * of them, to the proposal the manager was building. It still STOPS at:
 *
 *   - a proposal that became a real form (`formInstanceRef`) — finished;
 *   - a form picker — the manager was asked WHICH form, so none is open;
 *   - a failed turn — nothing to continue from what nobody saw;
 *   - the manager ending it: "never mind", "no form", "cancel".
 *
 * What this carries is unchanged: a TEMPLATE KEY, revalidated on the server,
 * and every fact re-derived from the manager's own turns.
 */
export function continuationFor(messages: ChatMessage[]): ProposalContinuation | null {
  let answers = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user") {
      if (!message.error && endsIntake(message.content)) return null;
      continue;
    }
    if (message.role !== "assistant") continue;
    if (message.error) return null;
    if (message.formInstanceRef) return null;
    /*
     * SEVERAL CARDS ARE NOT ONE INTAKE. A reply after "coaching form for Avery
     * and a CA for Jordan" could be about either, so it continues neither:
     * each card is created and edited on its own.
     */
    if ((message.formProposals?.length ?? 0) > 1) return null;
    if (message.formProposal) return { templateKey: message.formProposal.templateKey };
    if (message.formSelection) return null;
    answers += 1;
    if (answers > CONTINUATION_ANSWER_LOOKBACK) return null;
  }
  return null;
}

/**
 * ============================================================================
 * AN OLDER CARD IS SUPERSEDED BY A NEWER ONE
 * ============================================================================
 *
 * Production QA found the card from before a correction still on screen, with
 * its Create button, after the manager had corrected the employee — so the
 * record could be filed against the person they had just said it was not for.
 *
 * A proposal that was never created is superseded once any LATER assistant
 * turn carries a different proposal: that one is what the conversation now
 * says. The older card stays readable and offers nothing. The server checks
 * the same thing again at creation — see `lib/forms/proposal-currency.ts` —
 * because a card in browser storage is not proof of anything.
 */
export function isProposalSuperseded(messages: readonly ChatMessage[], proposalId: string): boolean {
  const index = messages.findIndex((message) =>
    proposalsOf(message).some((proposal) => proposal.proposalId === proposalId),
  );
  if (index < 0) return false;
  if (instanceRefFor(messages[index]!, proposalId)) return false;
  // A sibling card in the SAME message is not newer; only a later turn's card is.
  return messages
    .slice(index + 1)
    .some(
      (message) =>
        message.role === "assistant" &&
        !message.error &&
        proposalsOf(message).some((proposal) => proposal.proposalId !== proposalId),
    );
}

/** Every proposal a message carries: one card, or one per form it was asked for. */
export function proposalsOf(message: Pick<ChatMessage, "formProposal" | "formProposals">): ChatFormProposal[] {
  if (message.formProposals && message.formProposals.length > 0) return message.formProposals;
  return message.formProposal ? [message.formProposal] : [];
}

/**
 * The form created from ONE card of a message, or null.
 *
 * A single-card message keeps its pointer in `formInstanceRef`, as it always
 * has; a message with several cards keeps one per proposal in
 * `formInstanceRefs`, so creating one card never marks its sibling created.
 */
export function instanceRefFor(
  message: Pick<ChatMessage, "formProposal" | "formProposals" | "formInstanceRef" | "formInstanceRefs">,
  proposalId: string,
): ChatFormInstanceRef | null {
  const several = (message.formProposals?.length ?? 0) > 1;
  const listed = message.formInstanceRefs?.find((ref) => ref.proposalId === proposalId);
  if (listed) return listed;
  if (!message.formInstanceRef) return null;
  if (!several) return message.formInstanceRef;
  return message.formInstanceRef.proposalId === proposalId ? message.formInstanceRef : null;
}

/** Every form created from a message's cards. */
export function instanceRefsOf(
  message: Pick<ChatMessage, "formProposal" | "formProposals" | "formInstanceRef" | "formInstanceRefs">,
): ChatFormInstanceRef[] {
  const refs = [...(message.formInstanceRefs ?? [])];
  if (message.formInstanceRef && !refs.some((ref) => ref.instanceId === message.formInstanceRef!.instanceId)) {
    refs.push(message.formInstanceRef);
  }
  return refs;
}

/**
 * The message once one of its cards became a form. A single card keeps using
 * `formInstanceRef`; several record each card's own pointer.
 */
export function withInstanceRef(message: ChatMessage, reference: ChatFormInstanceRef): Partial<ChatMessage> {
  if ((message.formProposals?.length ?? 0) <= 1) return { formInstanceRef: reference };
  const others = (message.formInstanceRefs ?? []).filter((ref) => ref.proposalId !== reference.proposalId);
  return { formInstanceRefs: [...others, reference] };
}

/**
 * ============================================================================
 * THE FORM A LATER TURN MIGHT CORRECT
 * ============================================================================
 *
 * The most recent form created in this conversation, by instance id — the
 * target of "change the date to yesterday". None once a newer, not yet
 * created proposal is on screen: the manager is talking about that one now,
 * and the continuation above carries it.
 *
 * An id only, revalidated by the server (`correctActiveForm` runs the
 * template's own edit permission and the location scope). A forged one reaches
 * nothing the manager could not already edit in the inline form.
 */
export function activeFormInstanceFor(messages: ChatMessage[], question?: string): string | undefined {
  const candidates = activeFormCandidates(messages);
  if (candidates.length === 1) return candidates[0]!.instanceId;
  if (candidates.length === 0 || !question) return undefined;
  /*
   * SEVERAL FORMS FROM ONE MESSAGE: the correction names whose. "Change
   * Jordan's date to yesterday" is Jordan's form; a correction that names
   * nobody, or both, reaches neither — the server asks which
   * (`activeFormCandidates`), it never guesses.
   */
  const words = new Set((question.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []).map((word) => word.replace(/'s$/, "")));
  const named = candidates.filter((candidate) =>
    (candidate.employeeName ?? "")
      .toLowerCase()
      .split(/\s+/)
      .some((part) => part.length > 1 && words.has(part)),
  );
  return named.length === 1 ? named[0]!.instanceId : undefined;
}

/**
 * The forms a correction could be for: the one form the latest created card
 * became, or every form created from the latest message that carried several.
 * Empty once a newer card that is not yet a form is on screen.
 */
export function activeFormCandidates(
  messages: ChatMessage[],
): { instanceId: string; templateName: string; employeeName: string | null }[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || message.error) continue;
    const refs = instanceRefsOf(message);
    if (refs.length > 0) {
      const proposals = proposalsOf(message);
      return refs.map((ref) => ({
        instanceId: ref.instanceId,
        templateName: ref.templateName,
        employeeName: proposals.find((proposal) => proposal.proposalId === ref.proposalId)?.employeeName ?? null,
      }));
    }
    if (message.formProposal) return [];
  }
  return [];
}
