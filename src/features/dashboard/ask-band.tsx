"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowUp, MapPin, X } from "lucide-react";

import { BubbleMark, BuffCitySoapLogo } from "@/components/brand-mark";
import { quickQuestionsFor } from "@/lib/ai/quick-questions";
import { useSession } from "@/lib/session/session-context";
import { useAppStore } from "@/lib/store/app-store";
import { cn } from "@/lib/utils/cn";
import { formatChatTime } from "@/lib/chat/history-time";
import { formatLongDate, greetingForHour } from "@/lib/utils/date";
import { businessHour, businessToday } from "@/lib/business-date";
import { formatNumber } from "@/lib/utils/format";
import { useInlineAsk } from "@/features/chat/use-inline-ask";
import { AnswerSheet } from "./answer-sheet";
import { ConversationRating } from "@/features/chat/conversation-rating";
import type { AnswerMode, ChatMessage } from "@/types";

const MODES: { value: AnswerMode; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
];

/**
 * How many chips the band shows. The direction draws four.
 *
 * The list they come from is no longer a module constant: it depends on what
 * this reader may be shown, so it is resolved per render from the session —
 * see `lib/ai/quick-questions.ts`.
 */
const BAND_PROMPT_COUNT = 4;

/**
 * =============================================================================
 * THE BAND — Ask Bubbles stops being a card and becomes the top of the page
 * =============================================================================
 *
 * The direction's central move: a near-black surface with real area across the
 * top third, carrying the greeting and a REAL INPUT a manager can type into the
 * moment the page loads. Before this, Ask Bubbles was a white card in the middle
 * of the Overview with an "Open" button — the page talked about the assistant
 * instead of offering it.
 *
 * FIVE STATES, all of them here:
 *
 *   1. At rest      the bar is the first thing on the page
 *   2. Typing       yellow focus glow, coral caret, clear control, the answer
 *                   length selector appears, the prompts stay reachable
 *   3. Thinking     yellow dots and the real knowledge-base document count
 *   4. Answered     the answer lands on PAPER under the bar, not on near-black
 *   5. Collapsed    the overview behind it collapses to one strip (rendered by
 *                   the Overview itself, which owns that content)
 *
 * WHY THE ANSWER IS ON WHITE: a six-paragraph policy answer read on near-black
 * is worse than on white, so the band stays dark and the sheet under it is
 * paper, with the reading measure held near 78 characters.
 *
 * AN INLINE ANSWER IS A REAL CHAT TURN. This writes to the same conversation
 * store the chat screen uses, through the same provider, so a question typed on
 * the dashboard appears in history exactly as if it had been asked on the chat
 * page. The direction is explicit that anything else would lose an audit trail
 * for advice a manager may act on.
 *
 * IT HOLDS A CONVERSATION, NOT ONE QUESTION. This was capped at a single turn:
 * once an answer landed the composer went read-only and every route onward went
 * to the chat page. Asked to be lifted, because answering a policy question
 * usually takes two or three exchanges and walking to another screen for the
 * second one loses the thing that made asking here worth it.
 *
 * SO THE THREAD IS THE CONVERSATION IN THE STORE, not local state. The band
 * keeps only the conversation's ID and reads its messages back from the same
 * store the chat page reads, which buys three things that a local array would
 * not: the exchange survives a refresh, `history` sent with each follow-up is
 * the real thread rather than an empty list, and "Continue in Ask Bubbles" still
 * adopts the SAME conversation instead of replaying it.
 *
 * NEWEST EXCHANGE FIRST, which is the one place this deliberately departs from
 * the chat page. The composer is at the TOP here — it is the band — so a
 * chronological thread would push each new answer further below the fold and
 * make the manager scroll to read what they just asked for. Question and answer
 * stay together as a pair; the pairs run newest to oldest.
 *
 * WHAT STILL HANDS OFF: creating a form. That is a multi-step flow against a
 * real instance and a pinned template version, and it lives on the chat page —
 * the Overview must not grow a second path into HR records.
 */
export function AskBand({
  /** Told the Overview so it can collapse itself to a strip. */
  onActiveChange,
  className,
}: {
  onActiveChange?: (active: boolean) => void;
  className?: string;
}) {
  const { can, primaryLocationName, user } = useSession();
  /* Only the document COUNT is read here — the shared hook owns the thread. */
  const { documents } = useAppStore();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const greeting = greetingForHour(businessHour());
  /* Location accounts are shared, so greet the team rather than the location. */
  const greetingName = user.isLocationAccount
    ? `${user.name} team`
    : (user.name.split(" ")[0] ?? user.name);

  /*
   * THE CHIPS THIS READER MAY BE OFFERED.
   *
   * Resolved from the session's scope and permissions rather than sliced off a
   * fixed list, because the four openings a District Manager needs are not the
   * four a Location Director needs, and an employee with no reporting access needs
   * none of the reporting ones at all. `can` is the session's own check against
   * `DEFAULT_PERMISSION_MATRIX`; the boundary on what may actually be READ is
   * enforced server-side in the briefing's queries, not here.
   */
  const bandPrompts = useMemo(
    () => quickQuestionsFor({ scope: user.scope, can }).slice(0, BAND_PROMPT_COUNT),
    [can, user.scope],
  );

  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);

  /*
   * THE SEND PATH IS SHARED WITH THE REPORT TABS' ASK BAR — see
   * `features/chat/use-inline-ask.ts`. Everything this file used to hold here
   * (the conversation id, the thread read back from the store, the provider
   * call, the failed-turn append, the exchange pairing) moved there unchanged
   * when the report tabs were asked to answer in place too. Two copies would be
   * two audit trails to keep in step, and a question quietly missing from
   * history is exactly the gap the notes above warn about.
   */
  const {
    send,
    busy,
    mode,
    setMode,
    conversationId,
    exchanges,
    reset: resetThread,
    ratingTarget,
    recordFeedback,
  } = useInlineAsk({ onActiveChange, surface: "overview" });

  const submit = useCallback(
    (text: string) => {
      setValue("");
      setFocused(false);
      void send(text);
    },
    [send],
  );

  const reset = () => {
    resetThread();
    setValue("");
  };

  /* Typing = focused, or holding text. */
  const typing = focused || value.trim().length > 0;

  /*
   * NEWEST EXCHANGE FIRST, which is the one place this deliberately departs
   * from the chat page. The composer is at the TOP here — it is the band — so a
   * chronological thread would push each new answer further below the fold and
   * make the manager scroll to read what they just asked for. The hook returns
   * oldest-first, so the reversal is this file's decision.
   */
  const newestFirst = useMemo(() => [...exchanges].reverse(), [exchanges]);

  return (
    <section
      aria-label="Ask Bubbles"
      className={cn("shrink-0", className)}
    >
      {/*
        THE TOKYO GREEN BAND, closed by the brand's wavy edge hanging down into
        the page — the one large brand-colour surface on Home. Since 9 Oct 2026
        it starts at the very top (the shell draws no bar above it on desktop,
        and a Tokyo Green one on phones), carries the official Buff City Soap
        logo in White and the product drawings behind its content. Everything
        written on it is Charcoal (5.71:1); white text would be 1.98:1.
      */}
      <div className="wave-edge relative isolate mb-[13px] bg-band px-4 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-10">
        {/* The official drawings, White, behind everything below. Decoration only. */}
        <div aria-hidden className="hero-art">
          <span className="hero-art-lineup" />
          <span className="hero-art-spray" />
          <span className="hero-art-bomb" />
          <span className="hero-art-bar" />
          <span className="hero-art-tub" />
        </div>

        {/*
          THE PARENT BRAND, White on the band, top-right, about the height of
          the rail's Ask Bubbles lockup. Desktop only: below `lg` the shell's
          Tokyo Green top bar carries it. No box, no stretching — sized by
          height so the artwork keeps its own proportions.
        */}
        <BuffCitySoapLogo
          tone="white"
          priority
          className="absolute top-6 right-8 hidden h-[100px] lg:block"
        />

        {/* ---------------------------------------------------- band head -- */}
        <div className="mb-4 min-w-0 sm:mb-5 lg:pr-[200px]">
          <div className="mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[13px] font-semibold text-band-muted-foreground">
              {formatLongDate(businessToday())}
            </p>

          {/*
            THE ANSWER LENGTH SELECTOR TAKES THE LOCATION PILL'S PLACE while
            typing. Both are the same object in the direction — the top-right
            slot of the band — because a manager choosing how long an answer
            should be is doing it in the same second they type, and a control
            that is always on screen is one more thing to read at 7am.

            It is not decorative: `quick | standard | detailed` is the
            AnswerMode the chat API already takes, so this drives the real
            request.
          */}
          {typing ? (
            <div
              role="radiogroup"
              aria-label="Answer length"
              className="flex shrink-0 gap-0.5 rounded-full bg-band-chip-surface p-[3px]"
            >
              {MODES.map((option) => {
                const on = option.value === mode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    /* Keep focus in the composer: choosing a length must not
                       collapse the typing state it belongs to. */
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setMode(option.value);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                      on
                        ? "bg-surface text-foreground shadow-raised"
                        : "text-band-muted-foreground hover:bg-surface/60",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-band-chip-surface px-3 py-1 text-[13px] font-semibold text-band-chip-foreground">
              <MapPin className="size-3.5" aria-hidden />
              {primaryLocationName}
            </span>
          )}
          </div>
          {/* The approved rounded hand-lettered greeting (option 2). */}
          <h1 className="display-lettering text-[31px] text-band-foreground sm:text-[48px]">
            {greeting}, {greetingName}
          </h1>
        </div>

        {/* -------------------------------------------------------- the ask -- */}
        <AskCard
          inputRef={inputRef}
          value={value}
          onChange={setValue}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmit={() => submit(value)}
          /*
           * X CLEARS THE SMALLEST THING FIRST: a half-typed question if there
           * is one, otherwise the whole inline exchange. Reversing that would
           * mean one keystroke on Escape wipes a conversation the manager was
           * mid-way through adding to.
           */
          onClear={() => {
            if (value.length > 0) {
              setValue("");
              inputRef.current?.focus();
              return;
            }
            reset();
          }}
          typing={typing}
          busy={busy}
          /* The cold-start prompts, and only at cold start: once there is an
             exchange the answer's own follow-ups are the better next step. */
          prompts={exchanges.length === 0 ? bandPrompts : []}
          onPrompt={(prompt) => submit(prompt)}
          resettable={exchanges.length > 0}
        />

        {/* ------------------------------------------------------ thinking -- */}
        {busy ? (
          <p
            className="mt-3.5 flex items-center gap-2.5 text-[11.5px] text-band-muted-foreground"
            aria-live="polite"
          >
            <span className="flex items-center gap-1" aria-hidden>
              {[1, 0.55, 0.28].map((opacity, index) => (
                <span
                  key={index}
                  className="size-1.5 rounded-full bg-band-foreground"
                  style={{
                    opacity,
                    animation: "bubbles-pulse-dot 1.1s ease-in-out infinite",
                    animationDelay: `${index * 0.16}s`,
                  }}
                />
              ))}
            </span>
            {/*
              THE KNOWLEDGE BASE STAYS VISIBLE while Bubbles reads. The count is
              the real number of documents in scope — not a decorative figure —
              so it goes up when somebody uploads a policy.
            */}
            Reading {formatNumber(documents.length)}{" "}
            {documents.length === 1 ? "document" : "documents"} in your knowledge base
          </p>
        ) : null}

      </div>

      {/* -------------------------------------------------------- answers -- */}
      {conversationId
        ? newestFirst.map((exchange, index) => (
            <div key={exchange.question.id}>
              {/*
                THE QUESTION, ABOVE ITS OWN ANSWER. With one turn the composer
                held the question and nothing else was needed. In a thread the
                composer is empty and ready for the next one, so each exchange
                has to say what was asked or the answers read as replies to
                nothing.
              */}
              <AskedLine message={exchange.question} />
              {exchange.answer ? (
                <AnswerSheet
                  message={exchange.answer}
                  conversationId={conversationId}
                  onDismiss={reset}
                  /* Follow-ups continue HERE now. Handing off mid-thought is
                     what this change exists to stop. */
                  onAsk={(question) => submit(question)}
                  /* One hand-off link, on the newest exchange. Repeating it
                     under every answer is a column of the same button. */
                  showContinue={index === 0}
                />
              ) : null}
            </div>
          ))
        : null}

      {/*
        RATE THIS CONVERSATION — ONE QUIET LINE UNDER THE THREAD.

        Every answer above used to carry its own feedback panel, and the ask bar
        refused the next question until one was filled in. This replaces all of
        them: optional, user-initiated, and read by nothing else on the page.
      */}
      {conversationId && ratingTarget ? (
        <div className="border-t border-border-row bg-surface px-5 py-2.5 sm:px-6">
          <ConversationRating
            turnId={ratingTarget.turnId}
            messageId={ratingTarget.messageId}
            conversationId={conversationId}
            saved={ratingTarget.saved}
            onSaved={(feedback) => recordFeedback(ratingTarget.messageId, feedback)}
          />
        </div>
      ) : null}
    </section>
  );
}

/* ========================================================================== */

/** The manager's own turn, on the paper, above the answer it produced. */
function AskedLine({ message }: { message: ChatMessage }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2.5 border-b border-border-row bg-background px-5 pt-4 pb-3 sm:px-6">
      <span className="eyebrow shrink-0">You asked</span>
      <span className="min-w-0 flex-1 text-[13.5px] font-bold text-foreground">
        {message.content}
      </span>
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        {formatChatTime(message.createdAt)}
      </span>
    </div>
  );
}

/* ========================================================================== */

function AskCard({
  inputRef,
  value,
  onChange,
  onFocus,
  onBlur,
  onSubmit,
  onClear,
  typing,
  busy,
  prompts,
  onPrompt,
  resettable,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSubmit: () => void;
  onClear: () => void;
  typing: boolean;
  busy: boolean;
  prompts: string[];
  onPrompt: (prompt: string) => void;
  /** There is an inline exchange to clear, so offer the control. */
  resettable: boolean;
}) {
  /*
   * THE COMPOSER IS NEVER READ-ONLY ANY MORE.
   *
   * It used to be `locked` the moment an answer arrived — the textarea went
   * `readOnly`, its value was forced back to the question that had been asked,
   * and the send button was disabled. That WAS the one-question cap, and it is
   * gone: the field stays live and empty so the next question can be typed
   * straight into it. `busy` still disables it for the length of a request,
   * which is what stops a double send.
   *
   * The at-rest block (the display-face invitation) shows only at cold start,
   * because a two-line invitation above an exchange that is already underway is
   * asking a manager to start something they are in the middle of.
   */
  const showPlaceholderBlock = !typing && !resettable && value.length === 0;

  return (
    <div className="max-w-[820px]">
      {/*
        THE INVITATION sits on the band above the bar, at cold start only — a
        two-line invitation above an exchange already underway would ask the
        manager to start something they are in the middle of. It is the
        field's LABEL, so clicking it focuses the input.
      */}
      {showPlaceholderBlock ? (
        <label
          htmlFor="band-ask"
          className="mb-3 block cursor-text text-[15px] font-semibold text-band-foreground"
        >
          Ask Bubbles anything about running your location
        </label>
      ) : null}

      <div
        className="flex items-center gap-3 rounded-[var(--radius-2xl)] bg-surface py-2 pr-2 pl-4 transition-shadow duration-200"
        /*
          The Dark Tokyo Green underline is the ask bar at rest; focus turns it
          Charcoal and adds a white halo, so the bar never changes shape.
        */
        style={{ boxShadow: typing ? "var(--shadow-ask-focus)" : "var(--shadow-ask)" }}
      >
        <BubbleMark className="hidden size-7 shrink-0 sm:block" />

        {/*
          One real textarea in every state. Its accessible name is constant, so
          screen readers always meet the same field.
        */}
        <textarea
          id="band-ask"
          ref={inputRef}
          rows={1}
          value={value}
          disabled={busy}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
            if (event.key === "Escape") onClear();
          }}
          aria-label="Ask Bubbles a question"
          placeholder={
            showPlaceholderBlock
              ? "Policy, coaching, operations, performance, training…"
              : "Ask Bubbles a question"
          }
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-[11px] text-base text-foreground caret-primary outline-none [field-sizing:content] placeholder:text-placeholder-foreground"
        />

        {typing || resettable || value.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={value.length > 0 ? "Clear" : "Clear this conversation"}
            className="grid size-8 shrink-0 place-items-center rounded-full bg-clear-surface text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || value.trim().length === 0}
          aria-label="Ask Bubbles"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-selected text-selected-foreground transition-colors hover:bg-primary disabled:opacity-60"
        >
          <ArrowUp className="size-[17px]" strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      {/* Suggestions sit under the bar, on the band, and stay reachable while
          typing. */}
      {prompts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              /* mousedown, not click: a blur would drop the typing state
                 before the click ever landed. */
              onMouseDown={(event) => {
                event.preventDefault();
                onPrompt(prompt);
              }}
              className="rounded-full bg-band-chip-surface px-3.5 py-1.5 text-left text-[13px] font-medium text-band-chip-foreground transition-colors hover:bg-surface disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
