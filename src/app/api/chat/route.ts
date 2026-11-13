import { NextResponse } from "next/server";
import { noteSpendUser } from "@/lib/ai/spend-meter";
import { withSpendMeter } from "@/lib/ai/spend-meter-run";

import { withSwitchAfterCreate } from "@/lib/ai/form-type-switch";
import { withCorrectionNotDropped, withProposalNameCorrection } from "@/lib/forms/proposal-name-correction";
import { answerQuestion } from "@/lib/ai/server-ask";
import { modelSpendGuard } from "@/lib/ai/spend-guard";
import { isQuestionNotForm } from "@/lib/ai/question-not-form";
import {
  assertLiveMode,
  assertNoConfigurationProblems,
  assertWithinRateLimit,
  errorResponse,
} from "@/lib/api/respond";
import {
  LIMITS,
  optionalEnum,
  optionalString,
  parseHistory,
  parseJsonBody,
  requireChatQuestion,
  requireString,
} from "@/lib/api/validation";
import { authorizeRequest } from "@/lib/auth/server";
import { closeTurn, openTurn } from "@/lib/analytics/record";
import { logTurnEvent } from "@/lib/analytics/telemetry";
import {
  classifyChatTurn,
  classifyTurnKind,
  isActivitySurface,
} from "@/lib/analytics/taxonomy";
import { activeKnowledgeCorpus } from "@/lib/knowledge/corpus";
import { CONTINUATION_KEY_MAX } from "@/lib/forms/proposal-continuation";
import { answersWhichFormOnFile, mayAskToReopen } from "@/lib/forms/reopen-cue";
import { parseChatReportContext } from "@/lib/reporting/report-context";
import { businessToday } from "@/lib/business-date";
import {
  chatLongMessageEnabled,
  draftActionsEnabled,
  formEditHonestReplyEnabled,
  claimGuardEnabled,
  nameCorrectionWordsEnabled,
  listPolicyIsEditEnabled,
  policyChangeRestOfTurnEnabled,
  openFormNoSelectionEnabled,
  personGuardEnabled,
  fieldLabelNotAQuestionEnabled,
  possessivePlaceNotPersonEnabled,
  writeUpLeadNotAccountEnabled,
  formNameFromRosterEnabled,
  offRosterConfirmEnabled,
  offRosterPlaceAnswerEnabled,
  resentRequestIsYesEnabled,
  cardPlanMatchesCreateEnabled,
  answerTurnLevelEnabled,
  cardCheckedAgainstWordsEnabled,
  terminationCardTidyEnabled,
  humanRepliesEnabled,
  closeSpellingMatchEnabled,
  offRosterAskBeforeCardEnabled,
  whatHappenedNoCreateEnabled,
  oneFormEachPersonEnabled,
  outlineOnOpenProposalEnabled,
  groupWordsNotANameEnabled,
  createFromConversationPointsToCardEnabled,
  cardNamesEmployeeEnabled,
  exitLetterAddresseeEnabled,
  letterGreetingNotNameEnabled,
  pastedReviewNotAccountEnabled,
  templateOutlineFieldsEnabled,
  exitFormDateFromTerminationEnabled,
  metricGuardEnabled,
  refusalNoRepeatEnabled,
  titleNotSpeakersManagerEnabled,
  newRequestOwnTurnsEnabled,
  addressAsksWhoEnabled,
  leadFullSentenceEnabled,
  formsBelowNeedsFormsEnabled,
  formEditPlainWordsEnabled,
  formEditSourceTurnEnabled,
  formsGuideEnabled,
  pastedTemplateFieldsToOpenDraftEnabled,
  payrollDeductAmountFieldEnabled,
  questionNotFormEnabled,
  sameFormCopyEnabled,
  sameFormCopyNewPersonEnabled,
  teamCardNotProductEnabled,
  noSelectionOnOpenCardEnabled,
  sameRequestOtherPersonEnabled,
  staffPickerBareAnswerEnabled,
  wholeTeamCoachingEnabled,
  sameAskNoRepeatEnabled,
  newRequestOpenDraftEnabled,
  copyOpenFormForPersonEnabled,
  coachingForEveryoneEnabled,
  staffPickerEnabled,
  chatResponseStreamEnabled,
  formPatchReducerEnabled,
  formPatchReaderFixesEnabled,
  formReplyFromDiffEnabled,
  formEditToolInStreamEnabled,
  formEditNoopGuardEnabled,
  nearMissQuestionRulesEnabled,
  formNameOffRosterAskEnabled,
  reopenByAnyOpenVerbEnabled,
  accountBeforeRequestEnabled,
  emptyReplyGuardEnabled,
  addedDetailKeptEnabled,
  lateOpeningNeedsOpeningEnabled,
} from "@/lib/config/chat-quality-flags";
import { streamWhenSlow } from "@/lib/api/streamed-response";
import { finalReplyWithoutMarkers } from "@/lib/ai/source-note";
import { LONG_MESSAGE_LIMIT } from "@/lib/chat/message-limit";
import { emptyReplyError, isEmptyReply } from "@/lib/ai/empty-reply";
import { isClientConversationId } from "@/lib/chat/client-ids";
import type { AskRequest, AskResponse } from "@/lib/ai/types";
import type { AnswerMode, ChatMessage } from "@/types";

/**
 * POST /api/chat
 *
 * The only place Claude is ever called. The browser sends a question; this
 * handler retrieves company knowledge, builds the grounding context, calls
 * Claude and maps the result back to an AskResponse with real citations.
 *
 * ANTHROPIC_API_KEY and the Supabase keys are read here, on the server, and never
 * cross the boundary in either direction.
 *
 * Guard order: mode, then configuration, then authorization, then rate limit,
 * then validation. Authorization comes before the rate limit so an unauthorized
 * caller cannot consume another caller's budget, and both come before any work
 * that spends money at an external vendor.
 */
export const runtime = "nodejs";
/*
 * A LONG ANSWER IS NOT CUT OFF AT 30 SECONDS (QA, live, 1 Nov 2026). With no
 * export the platform's default stopped this route at 30 s: in 7 days 10
 * managers got "could not produce an answer" while the answer finished on the
 * server seconds later, paid for and thrown away. The same ceiling the draft
 * route uses; the model calls inside it are bounded on their own.
 */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MODES: AnswerMode[] = ["quick", "standard", "detailed"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SPEND_GUARD_ALL_CALLS_ENABLED: this route's Claude calls are counted (`ai/spend-meter.ts`). Off, as before. */
export async function POST(request: Request) {
  // CHAT_RESPONSE_STREAM_ENABLED: a slow answer is streamed so nothing cuts it off at 30 s. See `api/streamed-response.ts`.
  if (chatResponseStreamEnabled()) return streamWhenSlow(() => withSpendMeter("chat", () => postChat(request)));
  return withSpendMeter("chat", () => postChat(request));
}

async function postChat(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "ask_questions");
    noteSpendUser(context.identity.subject);
    assertWithinRateLimit(request, "chat");

    const body = await parseJsonBody<AskRequest>(request);

    const askedAt = Date.now();

    /*
     * =====================================================================
     * THE TURN IS OPENED BEFORE THE MODEL IS CALLED
     * =====================================================================
     *
     * IT USED TO BE RECORDED AFTERWARDS, bounded at 1500ms so a slow write
     * could never delay an answer. That produced the defect this ordering
     * exists to remove: on a cold serverless instance the first Supabase call
     * pays client construction, DNS and TLS before its insert, lost the race,
     * and the route answered with no turn on it — so the feedback control had
     * nothing to attach to and the gate released. A fully working, entirely
     * untracked conversation, on the first question of a session only.
     *
     * Opening first inverts every part of that:
     *
     *   the write's latency lands in the "thinking" phase, ahead of a
     *   multi-second model call, where one cold round trip is invisible
     *
     *   a write that cannot happen refuses the request BEFORE any money is
     *   spent at Anthropic, so nothing is lost — no answer was made
     *
     *   once an answer exists its turn already exists, which turns "a
     *   successful answer with no rateable turn" from a state the code tries
     *   to avoid into one it cannot reach
     *
     * THE CATEGORY HERE IS PROVISIONAL, and honestly so: three of the four
     * rungs of the evidence ladder are facts about the ANSWER, which does not
     * exist yet. What the request already knows — that a report was attached,
     * and the question itself, read transiently — is passed now, and
     * `closeTurn` replaces it once the answer can speak for itself. A turn
     * whose close is lost therefore still carries a reasonable topic rather
     * than `unclassified`.
     *
     * NO TEXT IS PERSISTED, on exactly the terms it was before. The question
     * goes to two classifiers as an argument, is matched against fixed tables
     * in memory, and is discarded when this handler returns. What is written
     * is enum values.
     */
    const surface = isActivitySurface(body.surface) ? body.surface : null;

    const turnId = await openTurn({
      feature: "chat",
      category: classifyChatTurn({
        /* Unknowable before the answer — see above. */
        proposedTemplateKey: null,
        offeredFormChoices: false,
        hadReportContext: body.reportContext !== undefined && body.reportContext !== null,
        citedCategories: [],
        question: body.question ?? null,
      }),
      turnKind: classifyTurnKind(body.question ?? null),
      surface,
      actorId: context.identity.subject,
      actorRole: context.identity.role,
      scope: context.identity.scope,
    });

    /*
     * THE ACTOR TRAVELS SEPARATELY FROM THE BODY, AND THAT SEPARATION IS THE
     * POINT.
     *
     * A form proposal has to know two things a caller must never be able to
     * assert about itself: which role is asking, and which locations they are
     * assigned to. Both come from `authorizeRequest` — a validated session and
     * `app_users` — and neither is read from `body`, which is why they are a
     * second argument rather than two more fields on `AskRequest`.
     */
    /*
     * MODEL_CALL_DAILY_CAP_ENABLED / MONTHLY_BUDGET_GUARD_ENABLED: over a spend
     * limit, one plain sentence and no model call. Before every step below,
     * since each of them can call the model. See `ai/spend-guard.ts`.
     */
    const capped = await modelSpendGuard({ userId: context.identity.subject, role: context.identity.role });
    if (capped) {
      await closeTurn(turnId, { category: "unclassified", succeeded: true, latencyMs: Date.now() - askedAt });
      return NextResponse.json({ ...finalReplyWithoutMarkers(capped), turnId });
    }

    let answer;
    // TEMPLATE_OUTLINE_FIELDS_ENABLED: the parsed turn the closing note reads (never the raw body's question).
    let outlineTurn: { question: string; instanceId: string } | null = null;
    try {
      let asked = parseAskRequest(body);
      if (asked.activeFormInstanceId) outlineTurn = { question: asked.question, instanceId: asked.activeFormInstanceId };
      /*
       * EXIT_LETTER_ADDRESSEE_ENABLED (ported from the sibling app: QA's live test there, 9 Nov 2026): a letter to the
       * employee, signed "Sincerely,\n<C>\nDistrict Manager", is read without that sign-off in this turn and the
       * manager's earlier ones, so the signer is never offered as the form's person nor her title taken
       * (`ai/letter-signer.ts`). The stored messages, and the draft, keep the whole letter.
       */
      /*
       * LETTER_GREETING_NOT_NAME_ENABLED: a letter's "Dear <A>," is read as "<A>," — the salutation is no part of the
       * name (`ai/letter-signer.ts`), so the roster finds <A>. The stored messages, and the draft, keep the letter.
       */
      if (exitLetterAddresseeEnabled() || letterGreetingNotNameEnabled()) {
        const { withoutLetterGreeting, withoutLetterSigner } = await import("@/lib/ai/letter-signer");
        const read = (text: string) => {
          const greeted = withoutLetterGreeting(text);
          return exitLetterAddresseeEnabled() ? withoutLetterSigner({ question: greeted }) : greeted;
        };
        asked = {
          ...asked,
          question: read(asked.question),
          history: asked.history.map((turn) => (turn.role === "user" && typeof turn.content === "string" ? { ...turn, content: read(turn.content) } : turn)),
        };
      }
      // OUTLINE_ON_OPEN_PROPOSAL_ENABLED: a pasted outline on an open proposal is no account (`lib/forms/outline-on-proposal.ts`).
      let outlineOnProposal: { readonly requestId?: string; readonly outlinePeople?: readonly string[] } | null = null;
      if (outlineOnOpenProposalEnabled()) {
        const read = (await import("@/lib/forms/outline-on-proposal")).withoutOutlineTurns(asked);
        if (read) {
          asked = read.asked;
          outlineOnProposal = read.outline
            ? { ...(read.requestId ? { requestId: read.requestId } : {}), ...(read.outlinePeople ? { outlinePeople: read.outlinePeople } : {}) }
            : null;
        }
      }
      /*
       * PASTED_REVIEW_NOT_ACCOUNT_ENABLED (Pau's sf-s22, port): a reviewer's notes pasted into a turn ("Please make the
       * following edits …") are read only for the manager's words before them, in this turn and the earlier ones, so
       * no reader takes them as the account, the form or the date (`ai/pasted-review.ts`). The stored messages keep them.
       */
      if (pastedReviewNotAccountEnabled()) {
        const { withoutPastedReview } = await import("@/lib/ai/pasted-review");
        asked = {
          ...asked,
          question: withoutPastedReview(asked.question),
          history: asked.history.map((turn) => (turn.role === "user" && typeof turn.content === "string" ? { ...turn, content: withoutPastedReview(turn.content) } : turn)),
        };
      }
      // RESENT_REQUEST_IS_YES_ENABLED: the same request again while "Is this for <name>?" waits is a yes (`lib/forms/resent-request-is-yes.ts`).
      if (resentRequestIsYesEnabled()) {
        asked = (await import("@/lib/forms/resent-request-is-yes")).withResentRequestAsYes(asked) ?? asked;
      }
      // ANSWER_TURN_LEVEL_ENABLED: a level said at the end of the answer to the app's own question is this form's (`lib/forms/answer-turn-level.ts`).
      if (answerTurnLevelEnabled()) {
        asked = (await import("@/lib/forms/answer-turn-level")).withAnswerTurnLevel(asked) ?? asked;
      }
      /*
       * OFF_ROSTER_CONFIRM_ENABLED: "use <name>" (or "yes") to the offer for a person not in Woven is read as the
       * manager's turn that typed the name, and the name is kept on the card as typed (`forms/off-roster-confirm.ts`).
       */
      /*
       * OFF_ROSTER_PLACE_ANSWER_ENABLED (port from the sibling app's 37b live bug): a place-only reply to the open "use
       * <C>" offer is never a person: the card is drafted again from the turn that typed the name, and after the turn
       * the name is held and the offer asked again (`forms/off-roster-place-answer.ts`).
       */
      let placeAnswer: import("@/lib/forms/off-roster-place-answer").PlaceAnswer | null = null;
      if (offRosterPlaceAnswerEnabled()) {
        const places = await import("@/lib/forms/off-roster-place-answer");
        const found = places.placeAnswerOf(asked.question, asked.history, context.identity.scope);
        const typed = found ? places.placeAnswerTurn(found, asked.history) : null;
        if (found && typed) {
          placeAnswer = found;
          asked = { ...asked, question: typed };
        }
      }
      if (offRosterConfirmEnabled()) {
        const taken = (await import("@/lib/forms/off-roster-confirm")).withOffRosterAnswer(asked);
        if (taken) {
          asked = taken.request;
          (await import("@/lib/forms/off-roster-store")).enterAcceptedOffRoster(taken.accepted);
        }
      }
      /*
       * ONE_FORM_EACH_PERSON_ENABLED: "a coaching form for <A>, <B>, and <C> for …" is asked as <A>'s request alone, and
       * "yes" to the "**Next:**" line as the next person's, a new request; the line is added after the answer
       * (`forms/one-form-each.ts`).
       */
      let eachQueue: import("@/lib/forms/one-form-each").Queue | null = null;
      if (oneFormEachPersonEnabled()) {
        const each = (await import("@/lib/forms/one-form-each")).beforeTurn(asked);
        if (each) {
          eachQueue = each.queue;
          asked = { ...asked, question: each.question, ...(each.fresh ? { continueProposalTemplateKey: undefined } : {}) };
        }
      }
      /*
       * SAME_FORM_COPY_NEW_PERSON_ENABLED: "can you create the same draft that
       * we did with <C> by changing the name and position?" with <C>'s own form
       * open — asked who the new form is for, nothing written, no card. The
       * turn after it that names one roster person is read as the request for
       * that person's form, and the card carries the form to copy from. See
       * `lib/forms/same-form-copy.ts`. After OFF_ROSTER_CONFIRM, on the same request (as the sibling app, #575).
       */
      const newPersonCopy =
        sameFormCopyEnabled() && sameFormCopyNewPersonEnabled()
          ? await (await import("@/lib/forms/same-form-copy")).newPersonCopyTurn({
              request,
              question: asked.question,
              activeInstanceId: asked.activeFormInstanceId,
              pendingFromInstanceId: asked.pendingCopyFromInstanceId,
            })
          : null;
      if (newPersonCopy && "answer" in newPersonCopy) {
        await closeTurn(turnId, { category: "unclassified", succeeded: true, latencyMs: Date.now() - askedAt });
        return NextResponse.json({ ...finalReplyWithoutMarkers(newPersonCopy.answer), turnId });
      }
      if (newPersonCopy) {
        asked = {
          ...asked,
          question: newPersonCopy.question,
          activeFormInstanceId: undefined,
          continueProposalTemplateKey: newPersonCopy.source.templateKey,
        };
      }
      let sameRequestOther: import("@/lib/forms/same-request-other-person").SameRequestTurn | null = null;
      const sameRequest = sameRequestOtherPersonEnabled() && !newPersonCopy ? await import("@/lib/forms/same-request-other-person") : null;
      // Only a turn of that shape reads the roster, and never for long (`sameRequestKind` leaves "the same coaching form for <B>" to the copy path).
      if (sameRequest && sameRequest.sameRequestKind(asked.question)) {
        const { sameRequestForOtherPerson } = sameRequest;
        const { loadScopedRoster } = await import("@/lib/forms/employee-roster");
        const roster = await Promise.race([
          loadScopedRoster(context.identity.scope).catch(() => []),
          new Promise<[]>((resolve) => setTimeout(() => resolve([]), 1_500)),
        ]);
        const other = sameRequestForOtherPerson({
          question: asked.question,
          history: asked.history,
          roster,
          continueTemplateKey: asked.continueProposalTemplateKey,
          formOpen: Boolean(asked.activeFormInstanceId),
        });
        if (other) {
          sameRequestOther = other;
          asked = {
            ...asked,
            question: other.question,
            history: asked.history.slice(0, other.historyBefore),
            activeFormInstanceId: undefined,
            continueProposalTemplateKey: undefined,
          };
        }
      }
      // FORM_NAME_FROM_ROSTER_ENABLED, part 2: every name reader of the turn reads this message's request slot (`lib/forms/request-slot.ts`).
      if (formNameFromRosterEnabled()) (await import("@/lib/forms/request-message-store")).enterRequestMessage(asked.question);
      // METRIC_GUARD_ENABLED, FORM_NAME off: only the metric guards read the message (`request-slot.ts` metricMessage).
      else if (metricGuardEnabled()) (await import("@/lib/forms/request-message-store")).enterMetricMessage(asked.question);
      // FIELD_LABEL_NOT_A_QUESTION_ENABLED: the manager's earlier turns, so an earlier "no notice given" still holds on the exit card (`lib/forms/exit-facts.ts`).
      if (fieldLabelNotAQuestionEnabled()) {
        (await import("@/lib/forms/request-message-store")).enterEarlierManagerTurns(
          asked.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
        );
      }
      // NEAR_MISS_QUESTION_RULES_ENABLED (after the FORM_NAME / METRIC_GUARD pair above, never between them — QA's round-6
      // gate, 8 Nov 2026: there it took that `else` and the metric guards stopped reading the message): the card on screen, so a near-miss never replaces it (`lib/forms/near-miss-question-rules.ts`).
      if (nearMissQuestionRulesEnabled()) {
        const onScreen = (await import("@/lib/forms/near-miss-question-rules")).cardEmployee(asked);
        if (onScreen) (await import("@/lib/forms/request-message-store")).enterCardOnScreen(onScreen);
      }
      /*
       * PERSON_GUARD_ENABLED: the actor's roster, for the rule that somebody on
       * it is always a person. One directory read per turn, only with the flag
       * on. See `lib/forms/person-guard.ts`.
       */
      if (personGuardEnabled()) {
        const [{ loadScopedRoster }, { enterPersonRoster }] = await Promise.all([
          import("@/lib/forms/employee-roster"),
          import("@/lib/forms/person-roster-store"),
        ]);
        // Never holds the turn up: no roster in 1.5 s and the guard runs without it.
        const roster = await Promise.race([
          loadScopedRoster(context.identity.scope).catch(() => []),
          new Promise<[]>((resolve) => setTimeout(() => resolve([]), 1_500)),
        ]);
        const names = roster.map((person) => `${person.preferredFirstName?.trim() || person.firstName} ${person.lastName}`);
        // FORM_NAME_FROM_ROSTER_ENABLED: a person with a preferred name is also known by the legal one.
        // OFF_ROSTER_ASK_BEFORE_CARD_ENABLED too (the switch-on's gate, 9 Nov 2026): "create a CA for tamsin wexley", the legal
        // name of the roster's "Tammy Wexley", was asked about as a name not on the roster (`lib/forms/off-roster-ask.ts`).
        if (formNameFromRosterEnabled() || offRosterAskBeforeCardEnabled()) {
          for (const person of roster) {
            if (person.preferredFirstName?.trim() && person.preferredFirstName.trim() !== person.firstName.trim()) {
              names.push(`${person.firstName} ${person.lastName}`);
            }
          }
        }
        enterPersonRoster(names);
        // FORM_NAME_OFF_ROSTER_ASK_ENABLED: the scope's level, so a name not on the roster is held for a store manager only (`lib/forms/roster-scope.ts`).
        // The manager's own turns too, so a full name typed on an earlier turn is still the manager's (the sibling app's #741 eval).
        if (formNameOffRosterAskEnabled()) {
          const managerTurns = [...asked.history.filter((turn) => turn.role === "user").map((turn) => String(turn.content ?? "")), asked.question];
          (await import("@/lib/forms/person-roster-store")).enterRosterScope(context.identity.scope?.level ?? "", managerTurns);
        }
        /*
         * FORM_NAME_FROM_ROSTER_ENABLED: does this message name somebody on the
         * roster (exact or close, or a roster first name typed in lowercase)?
         * Every name reader of the turn reads the same answer — the intent
         * slots read the employee before the card is proposed.
         */
        if (formNameFromRosterEnabled() && roster.length > 0) {
          const { enterRosterAnchor, messageAnchoredOnRoster } = await import("@/lib/forms/roster-anchor-store");
          enterRosterAnchor(messageAnchoredOnRoster(asked.question, roster));
        }
      }
      /*
       * "DELETE THAT DRAFT", "SAME INCIDENT" (ported from the sibling app, QA F8).
       * Ahead of every open-form path: the revision path read "delete that
       * draft" as a change and said "I haven't changed…". Deletes a draft only
       * under the forms API's own DELETE rules; "same incident" opens the form
       * on file; "different incident" is asked as a new form for that person.
       * Null for anything else, and off unless DRAFT_ACTIONS_ENABLED. See
       * `lib/forms/chat-draft-actions.ts`.
       */
      const draftAction = draftActionsEnabled()
        ? await (await import("@/lib/forms/chat-draft-actions")).draftActionForTurn({
            request,
            question: asked.question,
            history: asked.history,
            today: asked.context.todayIso,
            activeInstanceId: asked.activeFormInstanceId,
            continuingTemplateKey: asked.continueProposalTemplateKey,
          })
        : null;
      /*
       * STAFF_PICKER_ENABLED: "a coaching form for my whole staff" — no card
       * for everyone: which location, then its staff by name and position,
       * then one person at a time. No model call. See `lib/forms/staff-picker.ts`.
       */
      // STAFF_PICKER_BARE_ANSWER_ENABLED: with a draft open, only a turn that is nothing but "for whole staff".
      const bareWholeStaff =
        staffPickerBareAnswerEnabled() &&
        Boolean(asked.activeFormInstanceId) &&
        (await import("@/lib/forms/staff-picker")).isBareWholeStaff(asked.question);
      // WHOLE_TEAM_COACHING_ENABLED: "earlier you made a coaching form for all team members" is about the past — what to do, not a refusal.
      const pastTeam =
        wholeTeamCoachingEnabled() && !draftAction && (await import("@/lib/forms/whole-team-coaching")).pastTeamStatement(asked.question)
          ? (await import("@/lib/forms/staff-picker")).staffPickerAnswer((await import("@/lib/forms/whole-team-coaching")).pastTeamReply())
          : null;
      /*
       * COACHING_FOR_EVERYONE_ENABLED: "create this coaching form for everyone
       * on my team", with a Coaching draft open — one confirmation listing
       * who, then one draft each. No model call. See
       * `lib/forms/coaching-for-everyone.ts`.
       */
      const everyone =
        coachingForEveryoneEnabled() && !draftAction
          ? await (await import("@/lib/forms/coaching-for-everyone")).coachingForEveryoneTurn({
              request,
              question: asked.question,
              history: asked.history,
              activeInstanceId: asked.activeFormInstanceId,
            })
          : null;
      const staffPick =
        everyone ??
        pastTeam ??
        // Never with a draft open: there a turn is about that draft (independent review, 31 Oct 2026).
        (staffPickerEnabled() && !draftAction && (!asked.activeFormInstanceId || bareWholeStaff) && !(asked.activeFormCandidateIds?.length)
          ? await (await import("@/lib/forms/staff-picker")).staffPickerTurn({
              question: asked.question,
              history: asked.history,
              continuing: Boolean(asked.continueProposalTemplateKey) || bareWholeStaff,
              templateKey: asked.continueProposalTemplateKey ?? null,
              scope: context.identity.scope,
              role: context.identity.role,
            })
          : null);
      const draftAnswer = (draftAction && "answer" in draftAction ? draftAction.answer : null) ?? staffPick;
      /*
       * Either way the open form is not corrected or revised by this turn: it
       * was answered above, or a new incident is a new form.
       */
      // FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED: "change to coaching" after the form was created starts the other form; the created one is left as it is.
      /*
       * WHOLE_TEAM_COACHING_ENABLED: a whole-team coaching request is the team
       * card, the same with or without a draft open — handed to the intake as
       * a request of its own, with the store already named. See
       * `lib/forms/whole-team-coaching.ts`.
       */
      const team =
        wholeTeamCoachingEnabled() && !draftAction && !staffPick
          ? await (async () => {
              const wtc = await import("@/lib/forms/whole-team-coaching");
              const staff = await import("@/lib/forms/staff-picker");
              const open =
                asked.activeFormInstanceId && staff.isBareWholeStaff(asked.question)
                  ? await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, asked.activeFormInstanceId)
                  : null;
              return wtc.wholeTeamRequest({
                question: asked.question,
                history: asked.history,
                continuingTemplateKey: asked.continueProposalTemplateKey,
                openTemplateName: open?.templateName ?? null,
                draftOpen: Boolean(asked.activeFormInstanceId),
              });
            })()
          : null;
      /*
       * NEW_REQUEST_OPEN_DRAFT_ENABLED: with her draft open, "make me a CA for
       * <her> for <a new incident>" is a new card — never written into the open
       * draft (QA live check, 3 Nov 2026). See `lib/forms/new-request-open-draft.ts`.
       */
      const newRequestOpen =
        !draftAction && !staffPick && !team && asked.activeFormInstanceId && newRequestOpenDraftEnabled()
          ? (await import("@/lib/forms/new-request-open-draft")).newRequestForOpenDraft({
              question: asked.question,
              history: asked.history,
              employeeName: (await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, asked.activeFormInstanceId))
                ?.employeeName,
            })
          : false;
      /*
       * COPY_OPEN_FORM_FOR_PERSON_ENABLED: with <A>'s form open, "copy this form for <B>" is <B>'s request for the
       * open template, never the open intake carried on (`lib/forms/copy-open-form-for.ts`).
       */
      const copyFor =
        copyOpenFormForPersonEnabled() && !draftAction && !staffPick && !team && !newRequestOpen && asked.activeFormInstanceId
          ? await (async () => {
              const open = await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, asked.activeFormInstanceId!);
              if (!open) return null;
              let actor: Awaited<ReturnType<typeof import("@/lib/forms/access").authorizeForms>>;
              try {
                actor = await (await import("@/lib/forms/access")).authorizeForms(request, "ask_questions");
              } catch {
                return null;
              }
              let roster: Awaited<ReturnType<typeof import("@/lib/forms/employee-roster").loadScopedRoster>>;
              try {
                roster = await (await import("@/lib/forms/employee-roster")).loadScopedRoster(actor.scope);
              } catch {
                return null;
              }
              return (await import("@/lib/forms/copy-open-form-for")).copyOpenFormFor({
                question: asked.question,
                openTemplateName: open.templateName,
                openEmployeeName: open.employeeName,
                roster,
              });
            })()
          : null;
      // PROPOSAL_NAME_CORRECTION_ENABLED: "fix her last name …" on a card not yet created. See `lib/forms/proposal-name-correction.ts`.
      const parsed = withProposalNameCorrection(withSwitchAfterCreate(
        draftAction || staffPick || newRequestOpen || copyFor
          ? {
              ...asked,
              ...(draftAction && "question" in draftAction ? { question: draftAction.question } : {}),
              ...(copyFor ? { question: copyFor } : {}),
              activeFormInstanceId: undefined,
              activeFormCandidateIds: undefined,
            }
          : team
            ? {
                ...asked,
                question: team.question,
                history: team.history,
                activeFormInstanceId: undefined,
                activeFormCandidateIds: undefined,
                continueProposalTemplateKey: undefined,
              }
            : asked,
      ));
      /*
       * A CORRECTION TO A FORM THIS CONVERSATION ALREADY CREATED — "change the
       * date to yesterday". Tried first, and only where the browser named such
       * a form; `correctActiveForm` re-authorizes the instance and returns null
       * for anything that is not a correction, so every other turn is answered
       * exactly as before. Ahead of the revision below because "change" is
       * also a revision verb, and a header line is not a drafted field. See
       * `lib/forms/chat-correction.ts`.
       */
      /*
       * A QUESTION IS ANSWERED, NEVER WRITTEN INTO THE OPEN FORM ("what policy
       * does that fall under?"). It skips the correction, policy, redraft,
       * revision and which-form paths below; the answer still knows the form
       * is open. See `lib/ai/question-not-form.ts`. Behind
       * QUESTION_NOT_FORM_ENABLED.
       */
      // LIST_POLICY_IS_EDIT_ENABLED: "please list the policy" with a form open is an edit (EDIT_POLICY_ASK), never a question.
      const listPolicyEdit =
        listPolicyIsEditEnabled() && (await import("@/lib/ai/list-policy-ask")).listPolicyIsEdit(parsed.question, Boolean(parsed.activeFormInstanceId));
      /*
       * "WHAT IS A CA?", "DIFFERENCE BETWEEN COACHING AND CA", "WHICH FORMS CAN
       * I CREATE HERE?" — answered from the published templates and the role
       * matrix, and like any question never written into an open form. Null
       * for every other sentence, and off unless FORMS_GUIDE_ENABLED. See
       * `lib/forms/forms-guide.ts`.
       */
      const formsGuide =
        formsGuideEnabled() && !draftAnswer
          ? await (await import("@/lib/forms/forms-guide-answer")).answerFormsGuide({
              question: parsed.question,
              role: context.identity.role,
            })
          : null;
      const askedQuestion =
        Boolean(formsGuide) || (!listPolicyEdit && questionNotFormEnabled() && isQuestionNotForm(parsed.question, parsed.history));
      /*
       * STEP B (FORM_PATCH_REDUCER_ENABLED + FORM_REPLY_FROM_DIFF_ENABLED): the
       * open form as saved before this turn, so the reply about it can come
       * from what really changed. See `lib/forms/form-snapshot.ts`.
       */
      const formBefore =
        formPatchReducerEnabled() && formReplyFromDiffEnabled() && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/form-snapshot")).snapshotForm(parsed.activeFormInstanceId, request)
          : null;
      /*
       * FORM_EDIT_SOURCE_TURN_ENABLED: the open form as saved before this turn
       * (a plain read), so the reply can say whether this turn changed it, and
       * a turn of hers it did not write is carried back as `unwritten`. See
       * `sourceTurn` in `lib/forms/form-content-turn.ts`.
       */
      const sourceBefore =
        formEditSourceTurnEnabled() && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/form-noop-reply")).formBeforeTurn(parsed.activeFormInstanceId, request)
          : null;
      // Which content reader answered: the manager's own words ("turn"), or a turn she referred back to ("earlier").
      let contentRead: "turn" | "earlier" | null = null;
      // NAME_CORRECTION_WORDS_ENABLED: the open draft, for "fix her last name …". See `lib/forms/name-correction-words.ts`.
      const nameFix =
        nameCorrectionWordsEnabled() && parsed.activeFormInstanceId
          ? await (async () => {
              const open = await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, parsed.activeFormInstanceId!);
              const question = (await import("@/lib/forms/name-correction-words")).nameCorrectionQuestion(parsed.question, open?.employeeName ?? null);
              return question && open ? { question, open } : null;
            })()
          : null;
      /*
       * FORM_PATCH_READER_FIXES_ENABLED (QA's latency ask, 7 Nov 2026): the Step B reading is started now, so
       * its model call runs while the steps below do; the patch turn takes it only if its input is the same.
       * A name correction the app's own reader recognised ("fix her last name, it is …") goes to the
       * correction path without a reading (QA's re-run: those turns paid for both).
       */
      if (formPatchReaderFixesEnabled() && !formEditToolInStreamEnabled() && !askedQuestion && !nameFix && parsed.activeFormInstanceId) {
        (await import("@/lib/forms/form-patch-turn")).startPatchReading({
          request,
          instanceId: parsed.activeFormInstanceId,
          question: parsed.question,
          history: parsed.history,
          today: parsed.context.todayIso,
        });
      }
      const correction = parsed.activeFormInstanceId && !askedQuestion
        ? await (await import("@/lib/forms/chat-correction")).correctActiveForm({
            request,
            instanceId: parsed.activeFormInstanceId,
            // NAME_CORRECTION_WORDS_ENABLED: "fix her last name …" is read as "change her name to …". See `lib/forms/name-correction-words.ts`.
            question: nameFix?.question ?? parsed.question,
            today: parsed.context.todayIso,
            history: parsed.history,
          })
        : null;
      /*
       * "ADD THE ATTENDANCE POLICY TO THIS FORM" — a manual section named,
       * added, swapped or removed on the Direct policy line of the form that
       * is open. The manual's own words, found by its own heading; no model
       * writes them. Null for anything else. See `lib/forms/chat-policy-change.ts`.
       */
      const policyChangeOnly =
        !correction && !askedQuestion && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/chat-policy-change")).changeActiveFormPolicy({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
            })
          : null;
      // POLICY_CHANGE_REST_OF_TURN_ENABLED: the rest of the same message is not dropped. See `lib/forms/policy-rest-of-turn.ts`.
      const policyChange =
        policyChangeOnly && policyChangeRestOfTurnEnabled()
          ? await (await import("@/lib/forms/policy-rest-of-turn")).withRestOfPolicyTurn({
              request,
              policyChange: policyChangeOnly,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
            })
          : policyChangeOnly;
      /*
       * "HERE'S WHAT HAPPENED" after a Corrective Action Form was created from
       * a name alone — the form on screen is redrafted from it, citation
       * included. Null for anything else. See `lib/forms/chat-redraft.ts`.
       *
       * BEFORE THE REVISION, now that a Corrective Action Form can be revised
       * in place: it answers only where Ask Bubbles' draft wrote nothing, and
       * there a whole draft from the account — citation and all — is what the
       * manager needs, not one field revised.
       */
      /*
       * FORM_EDIT_TOOL_IN_STREAM_ENABLED (Step 3): with a draft open and a turn
       * that is not a correction or a policy change (a question too, Pau's
       * ruling A3), the ordinary
       * answering call is made HERE, offered the `edit_form` tool. A tool edit
       * that was written is this turn's reply (the saved diff), in the
       * redraft's place so no path below runs; otherwise the paths below run
       * as before and, if none answers, this call's answer is the answer. One
       * model call: nothing is sent back. Off, nothing here runs. See
       * `lib/forms/form-edit-tool.ts`.
       */
      const chatActor = {
        role: context.identity.role,
        scope: context.identity.scope,
        subject: context.identity.subject,
        verified: context.identity.verified,
      };
      const formEditTool =
        formEditToolInStreamEnabled() && !correction && !nameFix && !policyChange && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/form-edit-tool")).prepareFormEditTool({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
              /*
               * Pau's ruling A3 (4 Nov 2026): offered on any turn with a draft
               * open, question-phrased turns included. The existing question
               * reading goes into the trace only; it no longer decides the offer.
               */
              gate: (await import("@/lib/ai/question-not-form")).readQuestion(parsed.question, parsed.history),
              scope: context.identity.scope,
            })
          : null;
      /*
       * FORM_EDIT_NOOP_GUARD_ENABLED (Step 4): on a turn the edit tool is
       * offered, the open form as saved before the tool or the old chain
       * writes, so the reply about it is the saved diff. See
       * `lib/forms/form-noop-reply.ts`.
       */
      const noopBefore =
        formEditNoopGuardEnabled() && formEditTool?.turn.offer
          ? await (await import("@/lib/forms/form-noop-reply")).formBeforeTurn(parsed.activeFormInstanceId!, request)
          : null;
      /*
       * A failed main call (a model or configuration error) is no offer: the
       * paths below answer the turn as with the flag off, and the last
       * fallback makes its own call (ported from the sibling app, 4 Nov 2026).
       */
      const toolMain = formEditTool?.turn.offer
        ? await answerQuestion(
            {
              ...parsed,
              openForm: await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, parsed.activeFormInstanceId!),
              formEditTool: formEditTool.turn,
            },
            chatActor,
            { memoryOwnerId: context.identity.subject },
          ).catch(() => {
            formEditTool.turn.failed();
            return null;
          })
        : null;
      const toolEdit = formEditTool?.edited() ?? null;
      /*
       * FORM_PATCH_REDUCER_ENABLED: the turn on the open draft, read once as a
       * patch and merged by code; the reply is the realized diff. Null — the
       * paths below run as before — for a turn not about this form, a blank
       * Corrective Action Form, or any fallback. See `lib/forms/form-patch-turn.ts`.
       * FORM_EDIT_TOOL_IN_STREAM_ENABLED: skipped; the tool reads the turn instead.
       */
      const patchTurn =
        formPatchReducerEnabled() && !formEditToolInStreamEnabled() && !correction && !askedQuestion && !policyChange && !(formPatchReaderFixesEnabled() && nameFix) && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/form-patch-turn")).patchActiveForm({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
            })
          : null;
      const redraft = toolEdit ?? patchTurn ?? (
        !correction && !askedQuestion && !policyChange && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/chat-redraft")).redraftActiveForm({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
              savedPayrollAmount: await savedPayrollAmountFor(context.identity.subject, body.conversationId),
            })
          : null);
      /*
       * "CHANGE THE SUMMARY TO …", "CHANGE IT TO A WRITTEN WARNING" on a form
       * this conversation created — the open record, revised in place, rather
       * than a new form drafted from scratch. `reviseActiveForm` re-authorizes
       * the instance and returns null for anything that is not a revision, so
       * every other turn is answered as normal. Imported on demand: a turn with
       * no open form does not pay to load the forms write path. See
       * `lib/forms/chat-revision.ts`.
       */
      /*
       * SAME_FORM_COPY_ENABLED: "create the same draft that we did with <name>"
       * with the other person's draft open — that named form's content, copied
       * onto the open one. Null unless a form of this manager's is named. See
       * `lib/forms/same-form-copy.ts`.
       */
      const sameCopy =
        sameFormCopyEnabled() && !correction && !askedQuestion && !policyChange && !redraft && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/same-form-copy")).copyIntoOpenForm({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
            })
          : null;
      const separateDocument =
        !sameCopy && !correction && !askedQuestion && !policyChange && !redraft && parsed.activeFormInstanceId
          ? await separateFormRequested(parsed.question)
          : false;
      const askedRevisionRead =
        !sameCopy && !correction && !askedQuestion && !policyChange && !redraft && !separateDocument && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/chat-revision")).reviseActiveForm({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
            })
          : null;
      /*
       * PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT_ENABLED (ported from the sibling app; its round-25 live test of sf-s21): a
       * pasted labelled template the revision changed nothing for ("I haven't changed the … — everything on it is as
       * it was.") goes on to the open-draft path, which places its sections (`lib/forms/open-draft-turn.ts`).
       */
      const askedRevision =
        askedRevisionRead &&
        pastedTemplateFieldsToOpenDraftEnabled() &&
        (await import("@/lib/forms/pasted-template-fields")).looksLikePastedTemplate(parsed.question) &&
        (await import("@/lib/forms/pasted-template-fields")).revisionChangedNothing(askedRevisionRead.content)
          ? null
          : askedRevisionRead;
      /*
       * FORM_EDIT_PLAIN_WORDS_ENABLED: "this is what i am wanting to coach on:
       * …", "make that update", "update the draft with these details" — said
       * for the open Coaching Form in words the revision does not read as an
       * edit. Rewritten into one it does, and revised by the same path. See
       * `lib/forms/form-content-turn.ts`.
       */
      const plainRevision =
        askedRevision ??
        (formEditPlainWordsEnabled() && !sameCopy && !correction && !policyChange && !redraft && !separateDocument && parsed.activeFormInstanceId
          ? await (async () => {
              const open = await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, parsed.activeFormInstanceId!);
              if (!open || open.status !== "draft") return null;
              const content = await import("@/lib/forms/form-content-turn");
              const rewritten = content.formContentRevision({
                question: parsed.question,
                history: parsed.history,
                templateName: open.templateName,
                employeeName: open.employeeName,
                instanceId: parsed.activeFormInstanceId,
              });
              if (!rewritten) return null;
              contentRead = rewritten.source;
              const revised = await (await import("@/lib/forms/chat-revision")).reviseActiveForm({
                request,
                instanceId: parsed.activeFormInstanceId!,
                question: rewritten.question,
                history: rewritten.history,
                today: parsed.context.todayIso,
              });
              /*
               * Read as content for the form and still nothing written: said
               * so (FORM_EDIT_HONEST_REPLY_ENABLED), never the unrelated
               * ordinary answer the turn would otherwise fall through to.
               */
              if (!revised && formEditHonestReplyEnabled()) {
                return {
                  content: content.notWrittenReply(open.templateName, open.employeeName),
                  citations: [],
                  coverage: "not_applicable" as const,
                };
              }
              return revised;
            })()
          : null);
      /*
       * OPEN_DRAFT_KEEPS_TURNS_ENABLED: with a draft open, a turn about it that
       * no path above read is content for that draft — never a new card. See
       * `lib/forms/open-draft-turn.ts`.
       */
      const revision =
        plainRevision ??
        (!sameCopy && !correction && !askedQuestion && !policyChange && !redraft && !separateDocument && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/open-draft-turn")).openDraftTurn({
              request,
              instanceId: parsed.activeFormInstanceId,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
            })
          : null);
      /*
       * Two forms from one message, and a correction that names neither: ask
       * which, change nothing. See `askWhichFormToCorrect`.
       */
      const which =
        !correction && !askedQuestion && !revision && !parsed.activeFormInstanceId && (parsed.activeFormCandidateIds?.length ?? 0) > 1
          ? await (await import("@/lib/forms/chat-correction")).askWhichFormToCorrect({
              request,
              instanceIds: parsed.activeFormCandidateIds!,
              question: parsed.question,
            })
          : null;
      /*
       * "CHANGE EXIT FOR JORDAN SMITH" — a form already on file, asked for by
       * name and employee: found among the forms this actor may see and put
       * in the thread, a finalized one as a new draft of it. Last of the form
       * paths, so a correction to the open form is always made as one. Loaded
       * only for a turn with an edit or show verb (`mayAskToReopen`), and null
       * for any sentence that does not ask to edit or see an existing form.
       * See `lib/forms/chat-reopen.ts`.
       */
      const reopened =
        !sameCopy && !draftAnswer && !formsGuide && !correction && !policyChange && !redraft && !revision && !which && (mayAskToReopen(parsed.question, reopenByAnyOpenVerbEnabled()) || (reopenByAnyOpenVerbEnabled() && answersWhichFormOnFile(parsed.history)))
          ? await (await import("@/lib/forms/chat-reopen")).reopenRequestedForm({
              request,
              question: parsed.question,
              history: parsed.history,
              today: parsed.context.todayIso,
              activeInstanceId: parsed.activeFormInstanceId,
              continuingTemplateKey: parsed.continueProposalTemplateKey,
              // REOPEN_NOT_OPEN_FORM_ENABLED: the form open when the turn arrived, read only by that flag.
              openWhenAsked: asked.activeFormInstanceId,
            })
          : null;
      /*
       * AN ORDINARY ANSWER STILL KNOWS THE FORM IS THERE. Without this it was
       * told no card ever comes with an answer, and said "no form has been
       * created yet" beside the draft on screen. Read with "view"
       * authorization; null for an id that fails. See
       * `lib/forms/open-form-summary.ts`.
       */
      const openForm =
        !sameCopy && !correction && !policyChange && !redraft && !revision && !reopened && parsed.activeFormInstanceId
          ? await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, parsed.activeFormInstanceId)
          : null;
      let toolNothing: Awaited<ReturnType<typeof answerQuestion>> | null = null;
      // The ordinary answer, when no path above answered (FORM_EDIT_SOURCE_TURN_ENABLED reads it).
      let ordinaryAnswer: AskResponse | null = null;
      answer =
        draftAnswer ??
        formsGuide ??
        correction ??
        // A name correction this form does not take in chat: said plainly, never a model's "updated".
        (nameFix && !correction ? (await import("@/lib/forms/name-correction-words")).nameNotCorrectedReply(nameFix.open, nameFix.question) : null) ??
        policyChange ??
        redraft ??
        sameCopy ??
        revision ??
        which ??
        reopened ??
        // FORM_EDIT_TOOL_IN_STREAM_ENABLED: the tool was called and wrote nothing — said so, never the model's text.
        (toolNothing = formEditTool?.calledWithoutEdit() ? (await import("@/lib/forms/form-edit-tool")).nothingChangedAnswer() : null) ??
        toolMain ??
        (ordinaryAnswer = await answerQuestion(
          // FORM_EDIT_TOOL_IN_STREAM_ENABLED: a turn the tool was not offered on carries only its trace.
          { ...parsed, openForm, ...(formEditTool && !formEditTool.turn.offer ? { formEditTool: formEditTool.turn } : {}) },
          {
            role: context.identity.role,
            scope: context.identity.scope,
            subject: context.identity.subject,
            verified: context.identity.verified,
          },
          /*
           * WHOSE EARLIER CONVERSATIONS BUBBLES MAY RECALL: the validated
           * session's, and only ever theirs. See `chat/person-memory-store.ts`.
           */
          { memoryOwnerId: context.identity.subject },
        ));
      /*
       * FORM_EDIT_NOOP_GUARD_ENABLED (Step 4): the tool was offered and handed
       * the turn off (not called, refused, or nothing to change) — the old
       * chain's reply about the form is the saved diff, one "Updated:" line
       * per real change, or "I didn't change anything on the form. Tell me
       * which part to change and what it should say." A copy that wrote
       * nothing and claims nothing (its "replace them?") is kept. The tool's
       * own edit is already the diff (`form-edit-tool.ts`).
       */
      const handedOff: AskResponse = answer;
      if (noopBefore && !toolEdit && [redraft, sameCopy, revision, toolNothing].some((path) => path !== null && path === handedOff)) {
        answer = await (await import("@/lib/forms/form-noop-reply")).replyFromSavedDiff({
          request,
          before: noopBefore,
          answer: handedOff,
          keepUnchanged: handedOff === sameCopy && !handedOff.formUpdate,
        });
      }
      /*
       * FORM_REPLY_FROM_DIFF_ENABLED: a correction, policy, redraft, copy or
       * revision reply that claims a change (`formUpdate`) is checked against
       * the saved form, read again. A true claim keeps the path's reply, word
       * for word; a false one is replaced by what really changed. No claim, no
       * change to the reply. A patch turn's reply already is the diff. See
       * `checkedClaim` in `lib/forms/form-snapshot.ts` and
       * `docs/step-b-reply-rewrites.md`.
       */
      if (
        formBefore &&
        formReplyFromDiffEnabled() &&
        !draftAnswer &&
        !patchTurn &&
        !toolEdit &&
        [correction, policyChange, redraft, sameCopy, revision].includes(answer) &&
        answer.formUpdate?.instanceId === formBefore.instanceId
      ) {
        const snapshot = await import("@/lib/forms/form-snapshot");
        const formAfter = await snapshot.snapshotForm(formBefore.instanceId, request);
        if (formAfter) answer = snapshot.checkedClaim(answer, formBefore, formAfter);
      }
      /*
       * FORM_EDIT_SOURCE_TURN_ENABLED: did this turn change the open form (read
       * again, compared with `sourceBefore`)? If it did not, the manager's turn
       * a content path took and did not write is `unwritten` (a turn about the
       * form itself is not); an earlier one still pending is carried forward.
       * And an ordinary answer, with her words still not on the draft, is
       * replaced by a reply built from the saved state — never left to the
       * claim guard's list of phrasings ("It should update automatically — no
       * copy-and-paste needed").
       */
      let formReply: AskResponse["formReply"] | undefined;
      let unwrittenAnswered = false;
      if (sourceBefore && parsed.activeFormInstanceId) {
        const content = await import("@/lib/forms/form-content-turn");
        const after = await (await import("@/lib/forms/form-noop-reply")).formBeforeTurn(parsed.activeFormInstanceId, request);
        const { snapshotDiff } = await import("@/lib/forms/form-snapshot");
        const changed = !after || snapshotDiff(sourceBefore, after).length > 0;
        const pending = content.pendingUnwritten(parsed.history, parsed.activeFormInstanceId);
        const ownTurn = contentRead === "turn" || (!plainRevision && revision !== null);
        const unwritten = changed ? null : ((ownTurn ? content.unwrittenTurn(parsed.question) : null) ?? pending);
        const ordinary = answer === ordinaryAnswer || (toolMain !== null && answer === toolMain);
        formReply = { instanceId: parsed.activeFormInstanceId, ...(unwritten ? { unwritten } : {}) };
        // #480 gate: a question about reopening the form, or an acknowledgement, is answered as asked, never as "not on the form".
        if (!changed && pending && ordinary && !answer.formUpdate && sourceBefore.status === "draft" && !content.notContentForTheForm(parsed.question)) {
          const open = await (await import("@/lib/forms/open-form-summary")).describeOpenForm(request, parsed.activeFormInstanceId);
          if (open && open.status === "draft") {
            answer = {
              ...answer,
              content: content.unwrittenReply({
                unwritten: pending,
                templateName: open.templateName,
                employeeName: open.employeeName,
                canWrite: /\bcoaching\b/i.test(open.templateName),
                citedAnswer: answer.citations.length > 0 ? answer.content : null,
              }),
            };
            unwrittenAnswered = true;
          }
        }
        // #480 gate: an ordinary answer that changed nothing is marked as one, so a later "these details" may mean it.
        if (ordinary && !unwrittenAnswered && !changed && !answer.formUpdate) formReply = { ...formReply, answer: true };
      }
      // NEW_REQUEST_OWN_TURNS_ENABLED: a new request for the same person is drafted from its own turns. See `lib/forms/new-request-turns.ts`.
      if (newRequestOwnTurnsEnabled() && answer.formProposal) {
        answer = (await import("@/lib/forms/new-request-turns")).withOwnRequestTurns(answer, [
          ...parsed.history,
          { id: parsed.questionMessageId, role: "user", content: asked.question },
        ]);
      }
      // ADDRESS_ASKS_WHO_ENABLED: "Corrective action for 123 Main Street" with no card asks who it is for (`lib/forms/address-asks-who.ts`).
      if (addressAsksWhoEnabled() && !parsed.activeFormInstanceId)
        answer = (await import("@/lib/forms/address-asks-who")).withAddressFormAsk(answer, asked.question);
      // SAME_ASK_NO_REPEAT_ENABLED: a card still waiting never repeats the last reply word for word (`lib/forms/reply-guards.ts`).
      if (sameAskNoRepeatEnabled()) answer = (await import("@/lib/forms/reply-guards")).withoutRepeatedAsk(answer, asked.history);
      // REFUSAL_NO_REPEAT_ENABLED, TITLE_NOT_SPEAKERS_MANAGER_ENABLED: see `lib/forms/reply-guards.ts`.
      if (refusalNoRepeatEnabled() || titleNotSpeakersManagerEnabled()) {
        const guards = await import("@/lib/forms/reply-guards");
        answer = guards.withoutRepeatedRefusal(answer, parsed.history);
        answer = guards.withoutSpeakersManagerTitle(answer, [
          ...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
          asked.question,
        ]);
      }
      // PERSON_GUARD_ENABLED: whichever reader named the card's employee, a name that is not a person never stays on it.
      // TEAM_CARD_NOT_PRODUCT_ENABLED: a team coaching card's "Spray Tan Kits" is the topic, not a person (`lib/forms/team-card-not-product.ts`).
      if (teamCardNotProductEnabled() && answer.formProposal?.employeeName) {
        const { loadScopedRoster } = await import("@/lib/forms/employee-roster");
        answer = (await import("@/lib/forms/team-card-not-product")).withTeamCardNotProduct(answer, {
          turns: [
            ...parsed.history.filter((turn) => turn.role === "user").map((turn) => ({ id: turn.id, content: String(turn.content ?? "") })),
            { id: parsed.questionMessageId, content: parsed.question },
          ],
          roster: await loadScopedRoster(context.identity.scope).catch(() => []),
        });
      }
      if (personGuardEnabled()) answer = (await import("@/lib/forms/person-guard")).withPersonOnCard(answer);
      // POSSESSIVE_PLACE_NOT_PERSON_ENABLED: "Lee's Summit Plaza" never puts "Lee" on the card (`lib/forms/possessive-place.ts`).
      if (possessivePlaceNotPersonEnabled()) {
        answer = (await import("@/lib/forms/possessive-place")).withPossessivePlaceNotPerson(answer, [
          ...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
          asked.question,
        ]);
      }
      // WRITE_UP_LEAD_NOT_ACCOUNT_ENABLED: "write up <employee> for cell phone use" gives the Issue "Cell phone use" (`lib/forms/write-up-lead.ts`).
      if (writeUpLeadNotAccountEnabled()) answer = (await import("@/lib/forms/write-up-lead")).withWriteUpLeadNotAccount(answer);
      // EXIT_FORM_DATE_FROM_TERMINATION_ENABLED: a stated "terminated, effective <date>" dates the exit card (`lib/forms/exit-form-date.ts`).
      if (exitFormDateFromTerminationEnabled()) {
        answer = (await import("@/lib/forms/exit-form-date")).withExitFormDateFromTermination(
          answer,
          [...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content), asked.question],
          businessToday(),
        );
      }
      // GROUP_WORDS_NOT_A_NAME_ENABLED: "the same form for multiple employees" asks which employees (`lib/forms/group-words-ask.ts`).
      if (groupWordsNotANameEnabled()) {
        answer = (await import("@/lib/forms/group-words-ask")).withGroupWordsAsk(answer, [
          ...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
          asked.question,
        ]);
      }
      // TYPO_FULL_NAME_TO_ROSTER_ENABLED: the level said after "Is this for <name>?" is the card's (`lib/forms/confirmed-name-level.ts`).
      answer = (await import("@/lib/forms/confirmed-name-level")).withConfirmedNameLevel(answer, parsed.history, asked.question);
      // PROPOSAL_NAME_CORRECTION_ENABLED: an off-roster "change her name to …" on the card asks which, never kept silently.
      answer = withCorrectionNotDropped(answer, parsed);
      // CLOSE_SPELLING_MATCH_ENABLED: a policy named close to a manual heading, not confidently, is asked "Did you mean …?" (`lib/forms/close-policy-ask.ts`).
      if (closeSpellingMatchEnabled()) {
        answer = await (await import("@/lib/forms/close-policy-ask")).withClosePolicyQuestion(answer, async () => {
          const { SupabaseKnowledgeProvider } = await import("@/lib/knowledge/providers/supabase");
          const { ACTIVE_BRAND } = await import("@/lib/brand");
          const manual = await new SupabaseKnowledgeProvider().fetchOfficialPolicyManual(ACTIVE_BRAND.knowledgeScopeId);
          return manual.ok ? manual.chunks : null;
        }, [...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content), asked.question].join("\n"));
      }
      // CARD_PLAN_MATCHES_CREATE_ENABLED: an Attendance CA's card shows the plan Create will save (`lib/forms/card-plan-matches-create.ts`).
      if (cardPlanMatchesCreateEnabled()) {
        answer = (await import("@/lib/forms/card-plan-matches-create")).withCardPlanAsCreate(answer, [
          ...parsed.history.filter((turn) => turn.role === "user").map((turn) => turn.content),
          asked.question,
        ].join("\n\n"));
      }
      // TERMINATION_CARD_TIDY_ENABLED: an Issue that is only a hedge about terminating is the account (`lib/ai/termination-card-tidy.ts`).
      if (terminationCardTidyEnabled()) {
        answer = (await import("@/lib/ai/termination-card-tidy")).withIssueNotTerminationHedge(answer, asked.question);
      }
      // CARD_CHECKED_AGAINST_WORDS_ENABLED: the card is checked against the manager's own words before it is shown (`lib/forms/card-checked-against-words.ts`).
      if (cardCheckedAgainstWordsEnabled() && answer.formProposal) {
        const { loadScopedRoster } = await import("@/lib/forms/employee-roster");
        const { callFormPatchModel } = await import("@/lib/forms/form-patch-call");
        answer = await (await import("@/lib/forms/card-checked-against-words")).withCardCheckedAgainstWords(
          answer,
          {
            turns: [...parsed.history.filter((turn) => turn.role === "user").map((turn) => String(turn.content ?? "")), asked.question],
            roster: await loadScopedRoster(context.identity.scope).catch(() => []),
          },
          callFormPatchModel,
        );
      }
      // OUTLINE_ON_OPEN_PROPOSAL_ENABLED: the outline turn's reply says the outline is kept as her form's layout.
      if (outlineOnProposal) {
        answer = (await import("@/lib/forms/outline-on-proposal")).withOutlineKeptNote(answer, {
          outlineTurnId: parsed.questionMessageId,
          requestId: outlineOnProposal.requestId,
          outlinePeople: outlineOnProposal.outlinePeople,
        });
      }
      // NEAR_MISS_QUESTION_RULES_ENABLED: "no, …" to "Is this for <name>?" never gets a card for that name, nor the question again.
      if (nearMissQuestionRulesEnabled()) answer = (await import("@/lib/forms/near-miss-question-rules")).withoutTurnedDownName(answer, asked);
      /*
       * FORM_EDIT_HONEST_REPLY_ENABLED: the ordinary answer, with a form open,
       * changed nothing — so it never says it updated the form. See
       * `honestFormReply` in `lib/forms/form-content-turn.ts`.
       */
      if (
        (formEditHonestReplyEnabled() || claimGuardEnabled()) &&
        parsed.activeFormInstanceId &&
        !draftAnswer && !correction && !policyChange && !redraft && !revision && !which && !reopened &&
        !answer.formUpdate
        // FORM_PATCH_REDUCER_ENABLED: a patch turn's reply is already the realized diff.
        && !patchTurn
        // FORM_EDIT_SOURCE_TURN_ENABLED: already the reply from the saved state.
        && !unwrittenAnswered
      ) {
        const honest = (await import("@/lib/forms/form-content-turn")).honestFormReply(answer.content, formEditPlainWordsEnabled());
        if (honest) answer = { ...answer, content: honest };
      }
      /*
       * OPEN_FORM_NO_SELECTION_ENABLED: with a draft open, no form selection —
       * its heading ("Based on what you've described, I can prepare:") was all
       * the manager saw, under a reply about the open draft.
       */
      if (openFormNoSelectionEnabled() && parsed.activeFormInstanceId && answer.formSelection) {
        const { formSelection: _dropped, ...rest } = answer;
        void _dropped;
        answer = { ...rest, content: rest.content.replace(/\n*Based on what you've described, I can prepare:\s*$/, "").trimEnd() };
      }
      // ADDED_DETAIL_KEPT_ENABLED: "can you have it include that …" stays in the card's turns and shows on the card (`lib/forms/added-detail-kept.ts`).
      if (addedDetailKeptEnabled() && answer.formProposal) {
        answer = (await import("@/lib/forms/added-detail-kept")).withAddedDetailKept(answer, [
          ...parsed.history,
          { id: parsed.questionMessageId, role: "user", content: asked.question },
        ]);
      }
      // NO_SELECTION_ON_OPEN_CARD_ENABLED: the card on screen is the form; no "I can prepare:" choice offering it again.
      if (noSelectionOnOpenCardEnabled()) {
        answer = (await import("@/lib/forms/no-selection-on-open-card")).withoutSelectionOnOpenCard(answer, parsed.continueProposalTemplateKey);
      }
      // LATE_OPENING_NEEDS_OPENING_ENABLED: a closing account is never cited as Late Opening (`lib/forms/late-opening-needs-opening.ts`).
      if (lateOpeningNeedsOpeningEnabled() && answer.formProposal) {
        const cited = new Set(answer.formProposal.sourceMessageIds);
        answer = (await import("@/lib/forms/late-opening-needs-opening")).withLateOpeningNeedsOpening(answer, [
          ...parsed.history.filter((turn) => turn.role === "user" && turn.id && cited.has(turn.id)).map((turn) => String(turn.content)),
          asked.question,
        ]);
      }
      // LEAD_FULL_SENTENCE_ENABLED: a reply never ends at "I can prepare:" (`lib/forms/lead-full-sentence.ts`).
      if (leadFullSentenceEnabled()) answer = (await import("@/lib/forms/lead-full-sentence")).withLeadFullSentence(answer);
      // FORM_EDIT_SOURCE_TURN_ENABLED: every reply with a form open says so; the browser sends it back with the history.
      if (formReply) answer = { ...answer, formReply };
      // ACCOUNT_BEFORE_REQUEST_ENABLED: the account given before the request is handed to the draft (`lib/forms/account-before-request.ts`).
      if (accountBeforeRequestEnabled() && answer.formProposal) {
        answer = (await import("@/lib/forms/account-before-request")).withAccountBeforeRequest(answer, [
          ...parsed.history,
          { id: parsed.questionMessageId, role: "user", content: asked.question },
        ]);
      }
      // OFF_ROSTER_ASK_BEFORE_CARD_ENABLED: a store manager's card for a full name not on their roster is asked about once, before the card (`lib/forms/off-roster-ask.ts`).
      // WHAT_HAPPENED_NO_CREATE_ENABLED: while the reply asks what happened, the card offers no Create (`lib/forms/what-happened-no-create.ts`).
      if (whatHappenedNoCreateEnabled()) answer = (await import("@/lib/forms/what-happened-no-create")).withNoCreateWhileAsking(answer, { question: asked.question, history: parsed.history });
      if (offRosterAskBeforeCardEnabled()) {
        answer = (await import("@/lib/forms/off-roster-ask")).withOffRosterAskBeforeCard(answer, { scope: context.identity.scope, history: parsed.history, question: asked.question });
      }
      // OFF_ROSTER_PLACE_ANSWER_ENABLED: the place answered the offer; the name is held and the offer asked again (`forms/off-roster-place-answer.ts`).
      if (placeAnswer) answer = (await import("@/lib/forms/off-roster-place-answer")).withPlaceAnswer(answer, placeAnswer, context.identity.scope);
      // CREATE_FROM_CONVERSATION_POINTS_TO_CARD_ENABLED: "Create a form from this conversation." keeps the re-read card; only the reply points to Create (`ai/card-meta-turn.ts`).
      if (createFromConversationPointsToCardEnabled()) answer = (await import("@/lib/ai/card-meta-turn")).withPressCreateReply(answer, asked);
      // ONE_FORM_EACH_PERSON_ENABLED / CARD_NAMES_EMPLOYEE_ENABLED: the people still to do, and the card's employee named (`forms/one-form-each.ts`).
      if (oneFormEachPersonEnabled() || cardNamesEmployeeEnabled()) {
        const each = await import("@/lib/forms/one-form-each");
        answer = each.withCardNamingEmployee(each.afterTurn(answer, eachQueue));
      }
      // SAME_FORM_COPY_NEW_PERSON_ENABLED: the named person's card carries the form to copy from.
      if (newPersonCopy) {
        answer = (await import("@/lib/forms/same-form-copy")).withCopyFrom(answer, newPersonCopy.source, newPersonCopy.name);
      }
      // SAME_REQUEST_OTHER_PERSON_ENABLED: <B>'s card says what of the earlier request it carries.
      if (sameRequestOther) answer = (await import("@/lib/forms/same-request-other-person")).withSameRequestNote(answer, sameRequestOther);
      /*
       * HUMAN_REPLIES_ENABLED (QA's ruling (b), 12 Nov 2026; rebuilt from the sibling app's S#898): a later card turn for the
       * same form and employee says what changed instead of the opener's long tail; every other card line and the card
       * are untouched. Last, so it reads the reply every step above built. Off, unchanged.
       */
      if (humanRepliesEnabled()) {
        answer = (await import("@/lib/ai/human-replies")).humanizeFormReply(answer, {
          history: parsed.history,
          question: parsed.question,
          today: parsed.context.todayIso,
        });
      }
      /*
       * NEVER A BLANK ANSWER (EMPTY_REPLY_GUARD_ENABLED). An answer with no
       * prose and no card is a failure, said as one: the turn closes as failed
       * below and the thread shows an error card, not an empty bubble.
       */
      if (emptyReplyGuardEnabled() && isEmptyReply(answer)) throw emptyReplyError();
    } catch (error) {
      /*
       * A FAILED ANSWER IS STILL A RECORDED TURN, closed as a failure. The row
       * is already open, and leaving it reading "succeeded" would make the
       * answer rate on the dashboard flattering rather than honest.
       */
      await closeTurn(turnId, {
        category: "unclassified",
        succeeded: false,
        latencyMs: Date.now() - askedAt,
      });
      throw error;
    }

    /*
     * THE EVIDENCE LADDER, now that the answer can speak, strongest first —
     * see `classifyChatTurn`:
     *   1. the template the answer proposed          (a fact about the answer)
     *   2. an attached report                        (a fact about the request)
     *   3. the knowledge categories it cited         (authoritative metadata on
     *                                                 the documents themselves)
     *   4. the question, read transiently            (only when 1-3 found none)
     */
    await closeTurn(turnId, {
      category: classifyChatTurn({
        proposedTemplateKey: answer.formProposal?.templateKey ?? null,
        offeredFormChoices: answer.formSelection !== undefined,
        hadReportContext: body.reportContext !== undefined && body.reportContext !== null,
        citedCategories: answer.citations.map((citation) => citation.category),
        question: body.question ?? null,
      }),
      succeeded: true,
      latencyMs: Date.now() - askedAt,
    });

    /*
     * `turnId` is always present here — `openTurn` throws rather than returning
     * nothing — so the answer is unconditionally rateable. The event below is
     * unreachable under this lifecycle and is kept as a tripwire: if a later
     * change ever reintroduces the gap, it is one log search rather than one
     * reproduction.
     */
    if (!turnId) {
      logTurnEvent("turn.answer.missing_turn", { surface, where: "api/chat" });
    }

    /*
     * TEMPLATE_OUTLINE_FIELDS_ENABLED (Pau's sf-s21, QA's ruling; port): "the Must see behaviors and not the standard of
     * conduct" on a form that still cites Standards of Conduct is answered with why (`lib/forms/template-outline.ts`).
     */
    if (templateOutlineFieldsEnabled() && outlineTurn) {
      const { question: outlineQuestion, instanceId: outlineInstanceId } = outlineTurn;
      const outline = await import("@/lib/forms/template-outline");
      const loaded = await (await import("@/lib/forms/instance-scope"))
        .authorizeInstance(request, outlineInstanceId, "view")
        .then((authorized) => authorized.loaded)
        .catch(() => null);
      const value = (key: string) => loaded?.values.find((row) => row.fieldKey === key)?.value ?? "";
      const note = loaded
        ? outline.policyKeptNote({ question: outlineQuestion, policyViolated: value("policy_violated"), policyLanguage: value("policy_language") })
        : null;
      if (note) answer = { ...answer, content: outline.withPolicyKeptNote(answer.content, note) };
    }
    // FINAL_REPLY_MARKER_GUARD_ENABLED: no bare source tag reaches the manager, whatever path answered. See `ai/source-note.ts`.
    // FORMS_BELOW_NEEDS_FORMS_ENABLED: "… one of the forms below." only with forms below it (`lib/forms/lead-full-sentence.ts`).
    if (formsBelowNeedsFormsEnabled()) answer = (await import("@/lib/forms/lead-full-sentence")).withFormsBelowOnlyWithForms(answer);
    return NextResponse.json({ ...finalReplyWithoutMarkers(answer), turnId });
  } catch (error) {
    return errorResponse(error, "POST /api/chat");
  }
}

/** Validates and bounds everything that arrived from the browser. */
function parseAskRequest(body: Partial<AskRequest>): AskRequest {
  const context = body.context;

  return {
    /*
     * CHAT_LONG_MESSAGE_ENABLED raises the limit to 12,000 characters, says
     * how long a refused message is, and refuses an overlong history turn
     * instead of slicing it. Text is refused, never cut. Off, the 4,000
     * check, its wording and the history slice are unchanged.
     */
    question: chatLongMessageEnabled()
      ? requireChatQuestion(body.question, LONG_MESSAGE_LIMIT)
      : requireString(body.question, "A question", LIMITS.question),
    mode: optionalEnum<AnswerMode>(body.mode, MODES, "standard"),
    // FORM_EDIT_SOURCE_TURN_ENABLED: each turn keeps its `card` and `formReply` markers (`sourceTurn`).
    history: parseHistory(body.history, { refuseOverlong: chatLongMessageEnabled(), markers: formEditSourceTurnEnabled() }) as ChatMessage[],
    questionMessageId: optionalString(body.questionMessageId, LIMITS.messageId) || undefined,
    /*
     * A TEMPLATE KEY, BOUNDED, AND NOTHING ELSE. It says which kind of form the
     * last assistant turn offered, so answering "Sarah Test" to "who is this
     * for?" continues that proposal instead of becoming a knowledge query. Every
     * fact on the resulting proposal is still re-derived from the manager's own
     * turns, and the key is revalidated against the published library and the
     * actor's permission.
     */
    continueProposalTemplateKey:
      optionalString(body.continueProposalTemplateKey, CONTINUATION_KEY_MAX) || undefined,
    // An id and nothing more; malformed ones are dropped rather than looked up.
    activeFormInstanceId: UUID.test(String(body.activeFormInstanceId ?? ""))
      ? String(body.activeFormInstanceId)
      : undefined,
    // Ids and nothing more, at most six; malformed ones are dropped.
    activeFormCandidateIds: Array.isArray(body.activeFormCandidateIds)
      ? body.activeFormCandidateIds
          .slice(0, 6)
          .map((id: unknown) => String(id ?? ""))
          .filter((id: string) => UUID.test(id))
      : undefined,
    // SAME_FORM_COPY_NEW_PERSON_ENABLED: an id and nothing more, re-checked before it is used.
    pendingCopyFromInstanceId: UUID.test(String(body.pendingCopyFromInstanceId ?? ""))
      ? String(body.pendingCopyFromInstanceId)
      : undefined,
    // A `conv_*` id and nothing more; anything else is dropped. See `AskRequest`.
    conversationId: isClientConversationId(String(body.conversationId ?? ""))
      ? String(body.conversationId)
      : undefined,
    /*
     * THE MOST IMPORTANT OF THE SIX. Chat retrieves knowledge without the
     * caller naming a document, so a caller-chosen corpus here turns a question
     * into a search of another company's policies — with the answer quoting
     * them back. Answer mode, history, context and RAG semantics are unchanged;
     * only the corpus authority moved.
     */
    scopeId: activeKnowledgeCorpus(),
    /*
     * THE REPORT THE MANAGER WAS LOOKING AT, AS POINTERS.
     *
     * `parseChatReportContext` bounds and trims every field and returns null
     * unless the family is one of the five, so a malformed link selects nothing
     * rather than briefing on a guessed report. There is no field in the shape
     * through which a FIGURE could travel — the server re-reads the report — so
     * unlike the corpus above this one is safe to take from the body: the worst
     * a forged context can do is name rows the reader could already open the
     * dashboard to see, and `view_reports` is not what gates this route.
     *
     * Which is worth saying out loud, because it IS a real limitation and it is
     * the reporting read layer's rather than this route's: reads are not
     * narrowed per person's area, so everyone who reaches Chat sees the same
     * delivery the dashboards show them. That gap is recorded at length in
     * `api/reporting/sales-totals/analyze/route.ts` and is unchanged here.
     */
    reportContext: parseChatReportContext(body.reportContext),
    /*
     * REPORTING ONLY. It reaches the analytics row and nothing else — see the
     * field's own note on `AskRequest`. Validated here so a bad value becomes
     * null rather than travelling further as a string.
     */
    surface: isActivitySurface(body.surface) ? body.surface : null,
    attachedDocumentIds: Array.isArray(body.attachedDocumentIds)
      ? body.attachedDocumentIds
          .filter((id): id is string => typeof id === "string")
          .slice(0, LIMITS.documentIds)
      : undefined,
    context: {
      userName: optionalString(context?.userName, LIMITS.personName, "Manager"),
      locationName: optionalString(
        context?.locationName,
        LIMITS.personName,
        "your store",
      ),
      /*
       * WHAT DAY IT IS COMES FROM THE SERVER, IN THE BUSINESS TIMEZONE.
       *
       * Two corrections live in this one line.
       *
       * IT USED TO PREFER THE CALLER'S `todayIso`, and the browser sent
       * `DEMO_ANCHOR.slice(0, 10)` — a frozen prototype date. So the prompt
       * opened with "Today is 2026-08-26" for as long as that constant stood,
       * and every freshness judgement Bubbles could have made was made against a
       * day that had already passed. What day it is is a fact the server knows
       * and a client can only assert: the same argument as the corpus above,
       * one field down.
       *
       * AND IT USED TO BE UTC, which is the wrong ruler for "today" in a
       * business that operates in US zones. At 8pm Eastern the UTC date has
       * already rolled over, so a report covering yesterday would be described
       * as two days behind for the whole evening — every evening. `businessToday`
       * is the app's one answer to this, already used by follow-up dates and the
       * Overview, and reusing it is what keeps the product from holding two
       * opinions about what day it is.
       *
       * THE STORED PERIOD IS STILL AUTHORITATIVE. This decides only what
       * "today" means for the freshness comparison; which period a figure comes
       * from is read from the report, and no clock can move it.
       */
      todayIso: businessToday(),
    },
  };
}

/**
 * The amount chat_form_state already holds for this conversation. Null when
 * the amount field is off, or when nothing was stored. A redraft passes it
 * through so the figure is not lost when the new notes do not repeat it.
 */
async function savedPayrollAmountFor(userId: string | undefined, conversationId: unknown): Promise<string | null> {
  if (!payrollDeductAmountFieldEnabled() || !userId || typeof conversationId !== "string" || conversationId === "") {
    return null;
  }
  const { loadFormState } = await import("@/lib/ai/form-state-store");
  return (await loadFormState(userId, conversationId))?.payrollAmount ?? null;
}

/** A second document stays off the open form's revision path. Off, this is false. */
async function separateFormRequested(question: string): Promise<boolean> {
  const { secondFormEnabled } = await import("@/lib/config/chat-quality-flags");
  if (!secondFormEnabled()) return false;
  const { wantsSeparateDocument } = await import("@/lib/ai/second-form");
  return wantsSeparateDocument(question);
}
