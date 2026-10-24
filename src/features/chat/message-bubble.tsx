"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FilePlus2, Loader2, RotateCcw, Settings2, UserRound } from "lucide-react";

import { BubbleMark } from "@/components/brand-mark";
import { RichText } from "@/components/rich-text";
import { SourceList } from "@/components/source-list";
import { Badge } from "@/components/ui/badge";
import { LOCATION_LABEL } from "@/lib/brand";
import { locationById } from "@/lib/locations";
import { describeStore } from "@/lib/stores/resolver";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import {
  chatA11yEnabled,
  citationChipsEnabled,
  fieldChecklistEnabled,
  inlineCardEditEnabled,
} from "@/lib/config/chat-ui-flags";
import { ANSWER_MODE_LABEL } from "@/data/answer-modes";
import { Notice } from "@/components/ui/feedback";
import { useSession } from "@/lib/session/session-context";
import { cn } from "@/lib/utils/cn";
import { formatChatTime } from "@/lib/chat/history-time";
import { askerFor, authorFromSession } from "@/lib/chat/message-author";
import { formsFetch } from "@/features/forms/forms-fetch";
import { instanceRefFor, isProposalSuperseded, proposalsOf } from "@/lib/forms/proposal-continuation";
import type { ChatFormInstanceRef, ChatFormProposal, ChatMessage } from "@/types";
import { chatErrorTitle } from "./chat-error";
import { FormPicker } from "./form-picker";
import { logTurnEvent } from "@/lib/analytics/telemetry";
import { DRAFT_FAILED_WARNING, createInlineForm } from "./create-inline-form";
import { CitationChips } from "./citation-chips";
import { FieldChecklist, notesForChecklist } from "./field-checklist";
import { InlineForm, type PrefillState } from "./inline-form";
import { QuickReplies } from "./quick-replies";

export function MessageBubble({
  message,
  conversation,
  onSuggestion,
  onChooseForm,
  consumePickerChoice,
  onRetry,
  onFormCreated,
  onStartAnother,
  ownedBySignedIn = true,
}: {
  message: ChatMessage;
  /**
   * Whether the thread is the signed-in person's own — on their account, or
   * a draft they are typing now. False for a thread that exists only in this
   * shared browser, whose unstamped questions then get a neutral avatar
   * instead of somebody else's initials. See `askerFor`.
   */
  ownedBySignedIn?: boolean;
  /**
   * The turns this message sits among, for resolving a proposal's
   * `sourceMessageIds` back into the manager's own words.
   */
  conversation?: ChatMessage[];
  onSuggestion: (value: string) => void;
  /**
   * Choosing a form CARD, as opposed to a follow-up chip.
   *
   * Separate from `onSuggestion` because the two mean different things to the
   * next turn: a chip is a question, and a card is a decision the manager has
   * already made about which document they want. See `chosenFromPicker`.
   */
  onChooseForm?: (phrase: string) => void;
  /** Reads and clears "the last turn came from a form card". */
  consumePickerChoice?: () => boolean;
  onRetry?: (question: string) => void;
  /** Persists the created form's id onto this message. */
  onFormCreated?: (messageId: string, reference: ChatFormInstanceRef) => void;
  /** Begins a fresh form request in the same thread. Never reuses an instance. */
  onStartAnother?: () => void;
}) {
  const { user, isAdmin, managerDisplayName } = useSession();
  /*
   * BEFORE ANY EARLY RETURN. The lookup is a hook, so it has to run on
   * every render of this component or the hook order changes between
   * the error branch and the normal one.
   */

  if (message.role === "user") {
    const asker = askerFor(message, authorFromSession(user, managerDisplayName), ownedBySignedIn);
    /*
     * ONE SIDE BUBBLED AND ONE SIDE NOT.
     *
     * The Marquee Chat artifact's fifth item, and the reason is scanning rather
     * than decoration: "Bubbles' reply sits directly on the peach ground at a
     * 78-character measure. Only the manager's own message gets a bubble — one
     * side bubbled and one side not is what makes a thread scannable."
     *
     * So the question is a white card on the peach, capped at 44 characters so
     * it stays visibly a question rather than spreading into the width an
     * answer uses. It was the yellow-tinted primary-soft, which put the
     * manager's own typing in the brand's emphasis colour.
     */
    return (
      <div className="flex items-start justify-end gap-3">
        <div className="max-w-[44ch] rounded-[18px] rounded-br-[4px] bg-selected px-4 py-3">
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-selected-foreground">
            {message.content}
          </p>
          <p className="mt-1.5 text-[11px] text-sidebar-muted">
            {formatChatTime(message.createdAt)}
          </p>
        </div>
        {/* The warm neutral, not the grey: the manager's initials on the peach
            ground need a tint that belongs to it. */}
        <span
          title={asker ? asker.name : "Asked on this device — who asked was not recorded"}
          className="mt-0.5 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-bold text-foreground"
        >
          {asker ? asker.initials : <UserRound aria-label="Unknown asker" className="size-3.5" />}
        </span>
      </div>
    );
  }

  // A failed turn is rendered as a failure, never inside an answer bubble.
  // Nothing about it should read as something Bubbles said.
  if (message.error) {
    return <ChatErrorBubble message={message} onRetry={onRetry} isAdmin={isAdmin} />;
  }

  return (
    /*
     * THE ANSWER IS NOT A CARD.
     *
     * It sat in a white bordered bubble with a shadow, the same object as the
     * question above it. The artifact puts it straight on the peach at a
     * 78-character measure — long enough for a policy answer to read as a
     * document and short enough that the eye returns to the right place — and
     * gives the identity line the display face with a yellow mode tag, so
     * "BUBBLES · STANDARD" reads as a byline rather than as a card header.
     */
    <div className="flex gap-3">
      {/*
        THE YELLOW DISC IS THE AVATAR, SO THE SUN INVERTS ONTO IT. Drawn with
        `onDark` the disc and rays are the same yellow as the circle behind
        them and only the lenses survive — the smudge this codebase already hit
        once on the empty state. `onBrand` swaps the two inks.
      */}
      <span className="mt-0.5 grid size-[34px] shrink-0 place-items-center rounded-full bg-surface shadow-soft">
        <BubbleMark className="size-[22px]" />
      </span>
      {/*
        THE ANSWER IS A WHITE CARD on the chat canvas (approved 9 Oct 2026), so
        every word, badge, source and link in it keeps the colours it was
        designed against.
      */}
      <div className="min-w-0 max-w-[78ch] flex-1 rounded-[var(--radius-lg)] rounded-tl-sm bg-surface px-4 py-3.5 shadow-soft sm:px-5 sm:py-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="display text-[16px] text-foreground">Bubbles</span>
            {message.mode ? (
              <span className="rounded-full border border-accent-hover bg-accent-soft px-2 py-[3px] text-[11px] font-bold text-accent-soft-foreground">
                {ANSWER_MODE_LABEL[message.mode]}
              </span>
            ) : null}
            <span className="text-[10px] text-muted-foreground">
              {formatChatTime(message.createdAt)}
            </span>
          </div>

          <RichText content={message.content} />

          {/*
            NO FORM WAS NAMED, so the choices are cards rather than a list in
            the prose above. Choosing one sends the request through the composer
            — the same path a typed request takes.
          */}
          {message.formSelection ? (
            <FormPicker
              selection={message.formSelection}
              onChoose={onChooseForm ?? onSuggestion}
            />
          ) : null}

          {/*
            ONE CARD PER FORM ASKED FOR. "Coaching form for Avery and a CA for
            Jordan" is two proposals with their own ids, people and draft
            sources; each card creates and drafts only its own form, and
            records only its own reference (`instanceRefFor`).
          */}
          {proposalsOf(message).map((proposal, index) => (
            <FormProposalCard
              key={proposal.proposalId}
              proposal={proposal}
              instanceRef={instanceRefFor(message, proposal.proposalId)}
              conversation={conversation ?? []}
              // A picker choice names one form; it can only ever be the first card.
              consumePickerChoice={index === 0 ? consumePickerChoice : undefined}
              onCreated={(reference) => onFormCreated?.(message.id, reference)}
              onStartAnother={onStartAnother}
            />
          ))}
          {fieldChecklistEnabled()
            ? proposalsOf(message).map((proposal) => (
                <FieldChecklist
                  key={`fields-${proposal.proposalId}`}
                  proposal={proposal}
                  notes={notesForChecklist(conversation)}
                />
              ))
            : null}
          {proposalsOf(message).length === 0 && message.formInstanceRef ? (
            /*
              A FORM ALREADY ON FILE, OPENED BY THIS TURN — "edit the exit
              form for Jordan Smith", or the new draft of a finalized one. No
              proposal: the form existed before this answer. The card is the
              same live editor a created form gets.
            */
            <InlineForm
              reference={message.formInstanceRef}
              prefill={OPENED_PREFILL}
              onReplaced={(reference) => onFormCreated?.(message.id, reference)}
              onStartAnother={onStartAnother}
            />
          ) : null}

          {/*
            A CONVERSATION FROM BEFORE PHASE 2.
            Chat lives in the browser's IndexedDB, so a manager can still scroll
            back to a turn carrying a `formHandoff` — a drafted set of field
            values produced by the prototype flow, with the employee, the
            incident and the follow-up date defaulted where nothing had been
            said. It used to render an "Open in Create a Form" button that
            carried those values across.

            THE BUTTON IS GONE AND IS NOT REPLACED. Re-opening one of those
            drafts today would take values that were never facts and put them in
            front of somebody about to file an HR record. The turn stays
            readable as the prose it always was, with a line saying why it no
            longer leads anywhere.
          */}
          {message.formHandoff && !message.formProposal ? (
            <p className="mt-4 rounded-[var(--radius-md)] border border-border bg-surface-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              This draft came from an earlier version of Ask Bubbles, which filled
              in details nobody had given it, so it can no longer be opened. Ask
              Bubbles again to create the form here in the conversation.
            </p>
          ) : null}
        </div>

        {message.coverage === "insufficient" ? (
          <Notice tone="neutral" className="mt-3">
            <span className="font-semibold text-foreground">
              Not covered by the knowledge base
            </span>
            <p className="mt-0.5">
              Bubbles found no company document that answers this, so there are no
              sources to show. Anything above is general guidance, not{" "}
              company policy — check with your manager before acting on it.
            </p>
          </Notice>
        ) : null}

        {/*
          THE DOCUMENTS BEHIND THIS ANSWER, AND EACH ONE OPENS.

          An earlier pass removed this block outright; the current Marquee Chat
          artifact brings it back as a rule and numbered rows rather than as the
          bordered cards that were objected to. It is the SHARED component now —
          see `components/source-list.tsx` — because a near-copy lived on the
          Overview's answer sheet, only that one was clickable, and this one
          having lost its links was a reported regression.
        */}
        {citationChipsEnabled() ? (
          <CitationChips citations={message.citations ?? []} />
        ) : (
          <SourceList citations={message.citations ?? []} className="mt-4" />
        )}

        {message.followUpSuggestions && message.followUpSuggestions.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {message.followUpSuggestions.map((suggestion) => {
              /*
               * ONE CORAL CHIP, AND IT BUILDS THE FORM.
               *
               * The artifact's seventh item: "The follow-up that starts a
               * coaching form is outlined in coral. Everything else stays
               * neutral, so coral still means one thing: act here."
               *
               * OUTLINED, NEVER FILLED. A filled coral chip would be a coral
               * button, and pressing must not look like alarming — the same
               * rule that keeps the alarm bar's own action near-black.
               */
              const buildsForm = /\bform\b/i.test(suggestion);
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSuggestion(suggestion)}
                  className={cn(
                    "rounded-[22px] border bg-surface px-3.5 py-[7px] text-left text-[11.5px] font-bold transition-colors",
                    buildsForm
                      ? "border-measure-data text-measure-flagged-foreground hover:bg-followup-attention-soft"
                      : "border-border-strong text-foreground hover:border-brand-accent",
                  )}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>
        ) : null}

        <QuickReplies proposal={message.formProposal} onSuggestion={onSuggestion} />

        {/*
          NO FEEDBACK PANEL UNDER THE ANSWER, AND THAT IS THE CHANGE.

          One sat here under every answer — "How helpful was this answer? / Give
          feedback / Required before your next question" — and it meant it: the
          composer and every form action were held until a rating arrived. A
          thread of six answers drew six of them.

          Rating is now ONE passive control at the foot of the conversation, in
          `ChatScreen`, and it is the same component saving through the same
          endpoint to the same table. What changed is when somebody is asked:
          only when they choose to be. See `conversation-rating.tsx`.
        */}
      </div>
    </div>
  );
}

/**
 * A form this turn opened rather than created — see `openedFormReference`.
 * Its prefill is long over (or never happened: a revision is a copy), so the
 * editor is told so rather than left guessing from the form's history.
 */
const OPENED_PREFILL: PrefillState = { kind: "complete" };

/**
 * ============================================================================
 * A FORM PROPOSAL — WHAT BUBBLES WOULD CREATE, AND WHAT IT IS STILL MISSING
 * ============================================================================
 *
 * NOTHING HERE IS A FORM. There is no instance, no template version, no field
 * values, no follow-up date, no status. Which is why there is no Create
 * button, no Finalize, no Download PDF and no "start another": confirming a
 * proposal into a record is not built, and a control that looks like it works
 * is worse than an absent one.
 *
 * SO THE CARD IS ALL STATEMENT AND NO ACTION. It says which form, what Bubbles
 * established, and — in the same list, at the same weight — what it could not.
 * A missing value reads as missing rather than as a blank that might fill
 * itself in.
 */
function FormProposalCard({
  proposal,
  instanceRef,
  conversation,
  consumePickerChoice,
  onCreated,
  onStartAnother,
}: {
  proposal: ChatFormProposal;
  instanceRef: ChatFormInstanceRef | null;
  conversation: ChatMessage[];
  /** Reads and clears "this proposal came from a card the manager clicked". */
  consumePickerChoice?: () => boolean;
  onCreated: (reference: ChatFormInstanceRef) => void;
  onStartAnother?: () => void;
}) {
  const { role, user } = useSession();
  const [creating, setCreating] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  /*
   * WHERE BUBBLES'S PREFILL HAS GOT TO, for the editor below.
   *
   * `unknown` is the honest default: a card rendering an `instanceRef` that
   * came back from IndexedDB did not watch that prefill happen and cannot say
   * whether it finished. Only a create in THIS component moves it to `running`.
   */
  const [prefill, setPrefill] = React.useState<PrefillState>({ kind: "unknown" });
  /*
   * THE SAME ID THE PARENT IS BEING ASKED TO PERSIST, KEPT HERE TOO.
   *
   * `onCreated` writes the reference into the conversation, which is what makes
   * it survive a refresh. But the form exists the instant the create returns,
   * whether or not that write lands — and a card that went on offering "Create
   * draft" because a persist failed would let the manager file a second
   * disciplinary record for the same conversation.
   *
   * So the card stops offering the action on its own evidence. The durable copy
   * is still the conversation's; this one just closes the window between them.
   */
  const [created, setCreated] = React.useState<ChatFormInstanceRef | null>(null);
  /*
   * WHICH LOCATION, WHEN THE ACTOR COVERS SEVERAL.
   *
   * Offered by the registered store's name and number, from the roster; only
   * the ids the scope actually proves are offered.
   *
   * Whatever is chosen is re-authorized against the AccessScope by
   * `POST /api/forms/instances`, so an edited list buys nothing.
   */
  const [location, setLocation] = React.useState("");
  const [employeeDraft, setEmployeeDraft] = React.useState(proposal.employeeName ?? "");
  const [dateDraft, setDateDraft] = React.useState(proposal.formDate ?? "");
  const [warningDraft, setWarningDraft] = React.useState(proposal.warningLevel ?? "");
  const [payrollDraft, setPayrollDraft] = React.useState(proposal.payrollDeduct ?? "");
  const cardRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!chatA11yEnabled()) return;
    cardRef.current?.focus();
  }, []);

  /*
   * ==========================================================================
   * ONE FORM PER PROPOSAL, AND THE HONEST LIMIT OF THAT CLAIM
   * ==========================================================================
   *
   * `creating` is checked and set in the same synchronous turn as the click,
   * before any await, so a double-click, an Enter-then-click race, or a
   * pointer-and-keyboard activation cannot both get past it. The button is
   * disabled for the duration too, but the ref is what actually guarantees it:
   * a disabled attribute is applied on the next render, which is one tick too
   * late for a genuine double activation.
   *
   * Once an instance exists the action is not rendered at all, so it cannot be
   * pressed a second time — not even after a refresh, because the reference is
   * stored on the message.
   *
   * WHAT THIS DOES NOT COVER, AND THERE IS NO PRETENDING OTHERWISE: a request
   * that reaches the server and whose RESPONSE is lost. The browser sees a
   * failure, the row exists, and pressing the button again would create a
   * second one. Closing that needs a uniqueness constraint on the proposal id,
   * which needs a migration, which this phase does not have. See
   * docs/chat-phase-3.md.
   */
  const inFlight = React.useRef(false);

  /*
   * ==========================================================================
   * A NEWER PROPOSAL MAKES THIS ONE READ-ONLY
   * ==========================================================================
   *
   * Production QA found the card from before a correction still offering
   * "Create draft" after the manager had corrected the employee — one press
   * would have filed the form for the person they had just said it was not
   * for. Once a later turn carries a different proposal, this card says so
   * and offers nothing; the server refuses it too (`checkProposalIsCurrent`).
   */
  const superseded = isProposalSuperseded(conversation, proposal.proposalId);

  /*
   * ==========================================================================
   * A FORM THE MANAGER PICKED BY NAME DOES NOT ASK THEM TO PICK IT AGAIN
   * ==========================================================================
   *
   * Clicking a form in the picker IS the decision. Coming back with a
   * card that says "Create draft" asks for the same decision a second time,
   * which is the friction this workstream exists to remove.
   *
   * EVERY CONDITION HERE HAS TO HOLD. The turn came from a card
   * (`consumePickerChoice`, which clears itself so a re-render cannot make a
   * second form and the next ordinary turn cannot inherit the intent); the
   * proposal is READY, so the employee and the location are settled; the
   * template supports being created here; no location choice is outstanding; and
   * nothing has been created from this card already. A proposal missing any
   * of that still renders its button and still asks.
   *
   * THE SERVER IS UNCHANGED AND STILL DECIDES. `POST /api/forms/instances`
   * re-resolves the template, re-applies its own permission and re-authorises
   * the location against the AccessScope. This removes a click, not a check.
   */
  React.useEffect(() => {
    if (!consumePickerChoice?.()) return;
    if (superseded) return;
    if (proposal.status !== "ready") return;
    if (!proposal.supportsInlineDraft) return;
    if (proposal.locationResolution === "needs_selection") return;
    if (instanceRef || created) return;
    void create();
    // Runs for this card's first render only; `consumePickerChoice` clears the
    // intent, so the guard cannot fire twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (inFlight.current || superseded) return;
    inFlight.current = true;
    setCreating(true);
    setProblem(null);

    /*
     * Whether the ROW got created, tracked locally because the catch below has
     * to tell two failures apart: one where nothing exists and trying again is
     * right, and one where a real HR record exists and trying again would file
     * a second. `created` state is async and cannot answer this synchronously.
     */
    let rowExists = false;

    try {
      const editsOn = inlineCardEditEnabled();
      const filed: ChatFormProposal = editsOn
        ? {
            ...proposal,
            employeeName: employeeDraft.trim() || null,
            formDate: dateDraft || proposal.formDate,
            warningLevel:
              warningDraft === "verbal" || warningDraft === "written" || warningDraft === "final_warning"
                ? warningDraft
                : proposal.warningLevel,
            payrollDeduct: payrollDraft === "yes" || payrollDraft === "no" ? payrollDraft : proposal.payrollDeduct,
          }
        : proposal;
      const result = await createInlineForm({
        proposal: location ? { ...filed, locationId: location } : filed,
        messages: conversation,
        call: (url, init) => formsFetch(url, role, user.name, init),
        /*
         * SYNCHRONOUS, THE MOMENT THE ROW EXISTS — not after this promise
         * settles. Drafting can run for up to two minutes, and for every
         * second of it a real HR record exists. Persisting it here is what
         * stops the card going on offering "Create draft" over a form that
         * has already been filed.
         */
        onCreated: (reference) => {
          rowExists = true;
          setCreated(reference);
          onCreated(reference);
          /*
           * The row exists and drafting has begun. The editor renders from
           * here on — read-only, saying so — until this settles below.
           */
          setPrefill({ kind: "running" });
        },
      });
      /*
       * SETTLED. `complete` makes the editor re-read the canonical instance, so
       * what appears is what the server stored rather than what the drafting
       * response happened to return.
       */
      if (result.draftWarning) {
        /*
         * THE ROW EXISTS AND THE PREFILL DID NOT. Said on the card, and said in
         * the log too — "Bubbles couldn't prefill the details" is what the manager
         * needs, and which template it happened on is what an operator needs.
         */
        logTurnEvent("form.draft.failed", {
          templateKey: proposal.templateKey,
          where: "FormProposalCard",
          reason: result.draftWarning,
        });
      }
      setPrefill(
        result.draftWarning
          ? { kind: "failed", message: result.draftWarning }
          : { kind: "complete", ...(result.draftNotice ? { notice: result.draftNotice } : {}) },
      );
    } catch (error) {
      const message = (error as Error).message;
      setProblem(message);
      /*
       * WHY THIS IS LOGGED AND NOT JUST SHOWN. The rollout reported "create a
       * form from this conversation" failing, and there was nothing anywhere to
       * say which half of the path gave way — the card showed a sentence to one
       * person on one screen and the server had already answered. `rowExists`
       * tells the two apart, and `reason` is the server's own refusal text,
       * which describes the template or the permission and never the record.
       */
      logTurnEvent("form.create.failed", {
        templateKey: proposal.templateKey,
        where: rowExists ? "FormProposalCard/draft" : "FormProposalCard/create",
        reason: message,
      });
      /*
       * Only a FAILED CREATE releases the guard — the form does not exist, so
       * trying again is right. A create that succeeded never releases it: the
       * row is real, and the card is about to stop offering the action.
       *
       * If the failure came AFTER the row existed, the editor must not be left
       * waiting on a prefill that will never settle.
       */
      if (rowExists) {
        // The row is real. Never release the guard, and never leave the editor
        // waiting on a prefill that will not settle.
        setPrefill({ kind: "failed", message: DRAFT_FAILED_WARNING });
      } else {
        inFlight.current = false;
      }
    } finally {
      setCreating(false);
    }
  }

  const reference = instanceRef ?? created;
  if (reference) {
    return (
      <InlineForm
        reference={reference}
        prefill={prefill}
        onStartAnother={onStartAnother}
        /*
          "Edit as new draft" on a finalized form: the card now points at the
          new draft, persisted on this message the same way the created form
          was (`withInstanceRef`, by this card's proposal id), so a refresh
          reopens the draft rather than the frozen original.
        */
        onReplaced={(next) => {
          setCreated(next);
          onCreated(next);
        }}
      />
    );
  }

  return (
    <div
      ref={cardRef}
      {...(chatA11yEnabled() ? { tabIndex: -1 } : {})}
      className="mt-4 min-w-0 rounded-[var(--radius-md)] border-[1.5px] border-primary bg-surface px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-surface text-muted-foreground">
          <FilePlus2 className="size-3.5" aria-hidden />
        </span>
        <p className="text-[13px] font-semibold text-foreground">{proposal.templateName}</p>
        <Badge tone="outline" size="sm">
          {superseded ? "Superseded — nothing created" : "Proposal — nothing created"}
        </Badge>
      </div>

      {superseded ? (
        <p className="mt-2 text-xs text-muted-foreground">
          The conversation changed after this proposal. Use the newer one below.
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <ProposalRow label="Employee">
          {inlineCardEditEnabled() ? (
            <Input
              aria-label="Employee"
              value={employeeDraft}
              onChange={(event) => setEmployeeDraft(event.target.value)}
              className="h-8 text-xs"
              data-chat-ui="card-edit"
            />
          ) : (
            proposal.employeeName ?? (
              <Missing>Not yet — tell Bubbles who this form is about</Missing>
            )
          )}
        </ProposalRow>
        {proposal.employeeRole || POSITION_FORMS.has(proposal.templateKey) ? (
          <ProposalRow label="Position">
            {proposal.employeeRole ? (
              <>
                {proposal.employeeRole}
                {proposal.employeeRoleSource === "woven" ? (
                  <span className="text-muted-foreground"> · from Woven — tell Bubbles if it has changed</span>
                ) : null}
              </>
            ) : (
              <Missing>Not set — tell Bubbles their position, or fill it in on the form</Missing>
            )}
          </ProposalRow>
        ) : null}
        {proposal.employeeName && proposal.employeeVerification ? (
          <ProposalRow label="Woven">
            {proposal.employeeVerification.status === "verified" ? (
              <span className="text-foreground">
                Verified — {proposal.employeeVerification.title}
                {proposal.employeeVerification.storeMismatch ? " (store differs from the one you named)" : ""}
              </span>
            ) : (
              <Missing>
                {{
                  not_found: "Not verified — no matching employee in Woven",
                  unavailable: "Not verified — Woven records were unavailable",
                  not_checked: "Not verified — unavailable for your account",
                  ambiguous: "Not verified — more than one possible match",
                  no_title: "Not verified — no job title in Woven",
                  stale: "Not verified — Woven record is out of date",
                  not_active: "Not verified — Woven does not list them as employed",
                }[proposal.employeeVerification.reason ?? "unavailable"]}
              </Missing>
            )}
          </ProposalRow>
        ) : null}
        <ProposalRow label={LOCATION_LABEL}>
          {location ? (
            <span className="text-foreground">{storeText(location)}</span>
          ) : proposal.locationResolution === "not_applicable" ? (
            /*
             * NOT A GAP. A global actor is not assigned to a location, and the
             * server permits a form that names none — so this is an answer, and
             * the card says which answer rather than asking a question with
             * nothing to pick from.
             */
            <Missing>Not recorded — your account covers every location</Missing>
          ) : proposal.locationId ? (
            /* The registered store's name and number, resolved from the verified id. */
            <span className="text-foreground">{storeText(proposal.locationId)}</span>
          ) : (
            <Missing>
              {proposal.locationResolution === "needs_selection"
                ? "Not set — say which store this is about"
                : "Not set — Ask Bubbles could not verify one"}
            </Missing>
          )}
        </ProposalRow>
      </dl>

      {inlineCardEditEnabled() ? (
        <div className="mt-3 grid gap-2 text-xs" data-chat-ui="card-edits">
          <Label htmlFor={`date-${proposal.proposalId}`}>Date for the form</Label>
          <Input
            id={`date-${proposal.proposalId}`}
            type="date"
            value={dateDraft}
            onChange={(event) => setDateDraft(event.target.value)}
            className="h-8 text-xs"
          />
          <Label htmlFor={`warning-${proposal.proposalId}`}>Warning</Label>
          <Select
            id={`warning-${proposal.proposalId}`}
            value={warningDraft}
            onChange={(event) => setWarningDraft(event.target.value as typeof warningDraft)}
          >
            <option value="">Not set</option>
            <option value="verbal">Verbal warning</option>
            <option value="written">Written warning</option>
            <option value="final_warning">Final warning</option>
          </Select>
          <Label htmlFor={`payroll-${proposal.proposalId}`}>Is payroll deduct applicable?</Label>
          <Select
            id={`payroll-${proposal.proposalId}`}
            value={payrollDraft}
            onChange={(event) => setPayrollDraft(event.target.value as typeof payrollDraft)}
          >
            <option value="">Not set</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </div>
      ) : null}

      {/*
        THE ONLY CONTROL ON THIS CARD, AND ONLY WHEN IT WORKS.

        `supportsInlineDraft` is set server-side and is true only for a template
        the inline editor supports AND a proposal with nothing missing. A
        proposal still needing the employee or the location gets no button — not a
        disabled one, because the gap is the reason it is not offered, and a
        greyed-out control invites the manager to hunt for what would enable it.

        There is no Finalize, no Download PDF, no Start another and no View in
        the Forms Register. Those are Phase 4, and a dead Finalize would reproduce
        exactly the "Coming later" problem this workstream just removed.
      */}
      {/*
        THE ONE QUESTION THE CARD CAN ANSWER FOR ITSELF. Shown when the location is
        still open and the choices are known: a manager assigned to several
        locations who has not named one of them, or one who named a location outside
        their assignment (then even a single-location manager confirms their own
        rather than having it substituted silently). Only their own locations are
        offered, and the server re-authorizes whichever is picked.
      */}
      {!superseded && proposal.authorizedLocationIds.length > 0 && !proposal.locationId ? (
        <div className="mt-4 min-w-0 space-y-1.5">
          <Label htmlFor={`location-${proposal.proposalId}`}>Which store is this about?</Label>
          <Select
            id={`location-${proposal.proposalId}`}
            className="min-w-0"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">Choose a store…</option>
            {proposal.authorizedLocationIds.map((id) => (
              <option key={id} value={id}>
                {/* The roster's name for the id; the id itself only if the roster does not know it. */}
                {storeText(id)}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {!superseded && (proposal.supportsInlineDraft || (location && proposal.status === "needs_location")) ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="animate-spin" /> : null}
            {creating ? "Creating…" : "Create draft"}
          </Button>
          {problem ? (
            <span className="text-xs text-status-attention">{problem}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A registered store as a manager reads it: "Kearney, NE (Store 66)". */
function storeText(id: string): string {
  const store = locationById(id);
  return store ? describeStore(store) : id;
}

/** The forms whose Job Title is a record fact Bubbles fills from Woven or asks for. */
const POSITION_FORMS: ReadonlySet<string> = new Set(["coaching", "follow-up-coaching", "dpoa", "policy-review"]);

function ProposalRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-subtle-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground italic">{children}</span>;
}

/**
 * A failed turn.
 *
 * Visually distinct from an answer on purpose: it carries no Bubbles avatar copy
 * that could read as speech, it names what went wrong, and it offers "Try
 * again" only when trying again could actually help. Configuration problems
 * point an administrator at the admin screen instead of inviting a retry that
 * cannot succeed.
 */
function ChatErrorBubble({
  message,
  onRetry,
  isAdmin,
}: {
  message: ChatMessage;
  onRetry?: (question: string) => void;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const error = message.error!;

  return (
    <div className="flex gap-3" role="alert">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-status-attention-bg text-status-attention">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 max-w-[min(46rem,92%)] flex-1">
        <Notice tone="attention" title={chatErrorTitle(error.kind)}>
          <p>{error.message}</p>

          {error.missing && error.missing.length > 0 && isAdmin ? (
            <p className="mt-2">
              Not configured:{" "}
              <span className="font-mono text-xs">{error.missing.join(", ")}</span>
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {error.retryable && onRetry ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRetry(error.question)}
              >
                <RotateCcw />
                Try again
              </Button>
            ) : null}

            {error.kind === "not_configured" && isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/admin/integrations")}
              >
                <Settings2 />
                Open service configuration
              </Button>
            ) : null}
          </div>
        </Notice>

        <p className="mt-2 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-xs text-muted-foreground">
          Nothing was answered from memory. Bubbles does not guess when it cannot
          reach the knowledge base.
        </p>
      </div>
    </div>
  );
}

export function ThinkingBubble() {
  return (
    <div className="flex gap-3" aria-live="polite">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface">
        <BubbleMark className="size-4" />
      </span>
      <div className="rounded-[var(--radius-lg)] rounded-tl-sm border border-border bg-surface px-4 py-3.5 shadow-soft">
        <span className="sr-only">Bubbles is thinking</span>
        <span className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="size-1.5 rounded-full bg-primary"
              style={{
                animation: "bubbles-pulse-dot 1.1s ease-in-out infinite",
                animationDelay: `${index * 0.16}s`,
              }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
