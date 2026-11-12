# Production-env baseline on main a529c29e (Ask Bubbles, 10 Nov 2026)

Gate runner method check. One run of the non-replay suite (replay pack excluded: it already forces production's flags) with all 288 production-flags.json `on` + `assumedOn` flags exported as env in a clean env (`env -i`, NODE_ENV=test). Compare with the bare-env arms my gates used until round 16C, where the same files have 0 failing.

**16,995 tests, 812 failing in 241 files.** 292 have an off/unset/pinned/default wording in the test name (they pin flag-off behaviour on purpose); 520 do not and need a reader.

This list is not a verdict. A failure here is either (a) a test that assumes flags are unset (a pin), or (b) a live defect that only appears with production's flags together (RELATIVE_DATE_READER dropping "written" is one: warning-level.test.ts, owner-retest-e2e.test.ts). Each file needs a reader (coding) to say which.

| failing | file |
| --- | --- |
| 33 | src/lib/forms/prior-actions.test.ts |
| 30 | src/app/api/forms/corrective-action-dm-feedback-e2e.test.ts |
| 28 | src/app/api/chat/prior-sentence-fix-live-e2e.test.ts |
| 27 | src/app/api/forms/pm-draft-route.single-writer.test.ts |
| 27 | src/app/api/forms/pm-draft-route.test.ts |
| 26 | src/app/api/forms/draft-never-blank-oct26-e2e.test.ts |
| 24 | src/lib/ai/corrective-action-conversation.test.ts |
| 18 | src/app/api/forms/pm-framework-readiness.integration.test.ts |
| 17 | src/features/chat/import-every-role.dom.test.tsx |
| 15 | src/lib/ai/store-woven-form-flow.test.ts |
| 13 | src/app/api/chat/qa-oct21-audit-e2e.test.ts |
| 12 | src/lib/store/chat-history-sync.dom.test.tsx |
| 12 | src/lib/forms/form-date-incident-only.test.ts |
| 12 | src/lib/forms/reopen-request.test.ts |
| 11 | src/features/chat/inline-form.dom.test.tsx |
| 11 | src/app/api/chat/turn-lifecycle.test.ts |
| 11 | src/app/api/forms/corrective-action-conversation-qa-e2e.test.ts |
| 9 | src/lib/forms/corrective-action-intake.test.ts |
| 9 | src/app/api/forms/corrective-action-warning-level-e2e.test.ts |
| 9 | src/app/api/forms/state-code-not-a-person-e2e.test.ts |
| 8 | src/lib/forms/compound-surname.test.ts |
| 8 | src/app/api/chat/form-edit-plain-words-e2e.test.ts |
| 6 | src/lib/ai/ca-template-map-f4.test.ts |
| 6 | src/lib/ai/form-proposal.test.ts |
| 6 | src/lib/forms/form-date-answer.test.ts |
| 6 | src/app/api/chat/actor-authority.test.ts |
| 6 | src/app/api/chat/ai-reads-code-checks-e2e.test.ts |
| 6 | src/app/api/chat/edits-dates-replay-e2e.test.ts |
| 6 | src/app/api/chat/staff-picker-e2e.test.ts |
| 6 | src/app/api/forms/admin-feedback-oct16-e2e.test.ts |
| 6 | src/app/api/forms/corrective-action-chat-edits-e2e.test.ts |
| 6 | src/app/api/forms/hr-feedback-oct21-followups-e2e.test.ts |
| 5 | src/lib/ai/form-choice-stated.test.ts |
| 5 | src/lib/forms/official-policy-manual.test.ts |
| 5 | src/test/qa/forms-migration-qa.test.ts |
| 5 | src/app/api/chat/date-answer-applied-e2e.test.ts |
| 5 | src/app/api/forms/coaching-feedback-e2e.test.ts |
| 5 | src/app/api/forms/corrective-action-revision-5-e2e.test.ts |
| 5 | src/app/api/forms/private-creator-forms.test.ts |
| 4 | src/lib/ai/employment-change-conversation.test.ts |
| 4 | src/lib/ai/exit-form-conversation.test.ts |
| 4 | src/lib/ai/resend-same-chat-oct25.test.ts |
| 4 | src/lib/forms/ca-action-plan.test.ts |
| 4 | src/lib/forms/ca-policy.test.ts |
| 4 | src/lib/forms/prior-actions-policy.test.ts |
| 4 | src/app/api/chat/exit-intake-oct25.test.ts |
| 4 | src/app/api/chat/relative-date-reader-e2e.test.ts |
| 4 | src/app/api/chat/stored-slots-not-a-request-e2e.test.ts |
| 4 | src/app/api/forms/asd-no-form-monitoring.test.ts |
| 4 | src/app/api/forms/exit-draft-route.single-writer.test.ts |
| 4 | src/app/api/forms/exit-draft-route.test.ts |
| 4 | src/app/api/forms/exit-form-permissions.test.ts |
| 4 | src/app/api/forms/owner-retest-e2e.test.ts |
| 4 | src/app/api/forms/qa-f11-chat-draft-agreement.test.ts |
| 4 | src/app/api/forms/qa-w3-prior-forms-identity.test.ts |
| 3 | src/lib/ai/card-meta-turn.test.ts |
| 3 | src/lib/ai/chat-quality-replay.test.ts |
| 3 | src/lib/ai/entity-facts.test.ts |
| 3 | src/lib/ai/form-full-remap.test.ts |
| 3 | src/lib/ai/form-intake-qa-2026-10-21.test.ts |
| 3 | src/lib/ai/prompts.test.ts |
| 3 | src/lib/ai/qa-w4-date-and-prior-coaching.test.ts |
| 3 | src/lib/ai/source-note.test.ts |
| 3 | src/lib/forms/coaching-feedback.test.ts |
| 3 | src/lib/forms/prior-step-sentence.test.ts |
| 3 | src/lib/forms/request-line-account.test.ts |
| 3 | src/lib/forms/sales-shortfall-object.test.ts |
| 3 | src/lib/forms/step-dates-not-form-date.test.ts |
| 3 | src/lib/forms/warning-level.test.ts |
| 3 | src/app/api/chat/corrective-action-warning-level-chat-route.test.ts |
| 3 | src/app/api/chat/first-name-ask-e2e.test.ts |
| 3 | src/app/api/chat/live-flags-with-reader-e2e.test.ts |
| 3 | src/app/api/chat/typed-employee-name-oct25.test.ts |
| 3 | src/app/api/chat/warning-level-owner-scenarios.test.ts |
| 3 | src/app/api/forms/corrective-action-late-opening-e2e.test.ts |
| 3 | src/app/api/forms/corrective-action-payroll-e2e.test.ts |
| 3 | src/app/api/forms/qa-payroll-after-creation-e2e.test.ts |
| 3 | src/app/api/knowledge/corpus-authority.test.ts |
| 2 | src/form-revisions/form-revisions.dom.test.tsx |
| 2 | src/features/chat/exit-inline-form.dom.test.tsx |
| 2 | src/lib/ai/ca-offer.test.ts |
| 2 | src/lib/ai/ca-shift-dates-kept.test.ts |
| 2 | src/lib/ai/call-claude.stream.test.ts |
| 2 | src/lib/ai/chat-form-known-context.test.ts |
| 2 | src/lib/ai/late-open-date-oct24.test.ts |
| 2 | src/lib/ai/list-policy-ask.test.ts |
| 2 | src/lib/ai/live-replay.eval.test.ts |
| 2 | src/lib/ai/manager-name-guard.test.ts |
| 2 | src/lib/ai/name-slot-store.test.ts |
| 2 | src/lib/ai/own-brand-parent.test.ts |
| 2 | src/lib/ai/remap-incident-oct24.test.ts |
| 2 | src/lib/ai/remap-prior-actions-oct25.test.ts |
| 2 | src/lib/ai/report-name-not-a-person.test.ts |
| 2 | src/lib/ai/sunny-fixes-runtime.test.ts |
| 2 | src/lib/ai/unknown-name-ask-who-for.test.ts |
| 2 | src/lib/forms/ca-sales-policy.test.ts |
| 2 | src/lib/forms/chat-correction.single-writer.test.ts |
| 2 | src/lib/forms/chat-correction.test.ts |
| 2 | src/lib/forms/cleaning-other-every-wording.test.ts |
| 2 | src/lib/forms/conduct-incident-cites-page.test.ts |
| 2 | src/lib/forms/edit-policy-ask-schema.test.ts |
| 2 | src/lib/forms/employment-change.test.ts |
| 2 | src/lib/forms/exit-facts.test.ts |
| 2 | src/lib/forms/form-name-from-roster.test.ts |
| 2 | src/lib/forms/form-patch-account-line.test.ts |
| 2 | src/lib/forms/form-reducer-said-replacement.test.ts |
| 2 | src/lib/forms/incident-dates.test.ts |
| 2 | src/lib/forms/metric-guard.test.ts |
| 2 | src/lib/forms/payroll-amount-referent.test.ts |
| 2 | src/lib/forms/prior-actions-no-signed-parsers.test.ts |
| 2 | src/lib/forms/prior-forms-lines.test.ts |
| 2 | src/lib/forms/proposal.test.ts |
| 2 | src/lib/forms/qa-w4-date-readers.test.ts |
| 2 | src/lib/forms/reopen-no-show-oct25.test.ts |
| 2 | src/lib/forms/request-slot.test.ts |
| 2 | src/lib/forms/s37-coaching-observed.test.ts |
| 2 | src/lib/forms/sales-observation-account.test.ts |
| 2 | src/app/api/chat/action-plan-fits-e2e.test.ts |
| 2 | src/app/api/chat/action-plan-manager-only-live-path.test.ts |
| 2 | src/app/api/chat/b13-remap-p0-oct25.test.ts |
| 2 | src/app/api/chat/card-change-e2e.test.ts |
| 2 | src/app/api/chat/form-revision-wiring.test.ts |
| 2 | src/app/api/chat/last-first-name-read-e2e.test.ts |
| 2 | src/app/api/chat/name-question-only-e2e.test.ts |
| 2 | src/app/api/chat/question-not-form-e2e.test.ts |
| 2 | src/app/api/chat/unknown-name-ask-e2e.test.ts |
| 2 | src/app/api/forms/form-monitoring-store-access.test.ts |
| 2 | src/app/api/forms/one-draft-per-conversation-e2e.test.ts |
| 2 | src/app/api/chat/conversations/ownership.test.ts |
| 1 | src/features/chat/finalized-change-panel.dom.test.tsx |
| 1 | src/features/chat/form-proposal.dom.test.tsx |
| 1 | src/features/chat/rollout-fixes.dom.test.tsx |
| 1 | src/features/forms/monitoring-table.dom.test.tsx |
| 1 | src/lib/ai/anti-loop-replay.test.ts |
| 1 | src/lib/ai/chat-entity-wiring.test.ts |
| 1 | src/lib/ai/chat-only-form-creation.test.ts |
| 1 | src/lib/ai/chat-stage-timings-trace.test.ts |
| 1 | src/lib/ai/chat-stage-timings.test.ts |
| 1 | src/lib/ai/conv-mvmj6v1t250hfij.dom.test.tsx |
| 1 | src/lib/ai/conv-mvmj7ifs9oosat5.dom.test.tsx |
| 1 | src/lib/ai/first-name-yes-keeps-request.test.ts |
| 1 | src/lib/ai/form-records-runtime.test.ts |
| 1 | src/lib/ai/intent-extraction.test.ts |
| 1 | src/lib/ai/intent-payroll-quote-oct24.test.ts |
| 1 | src/lib/ai/not-a-name-oct24.test.ts |
| 1 | src/lib/ai/out-of-date-is-the-proposal.test.ts |
| 1 | src/lib/ai/own-brand-only.test.ts |
| 1 | src/lib/ai/past-forms-before-library.test.ts |
| 1 | src/lib/ai/person-memory-runtime.test.ts |
| 1 | src/lib/ai/polite-about-request.test.ts |
| 1 | src/lib/ai/priority-replay.test.ts |
| 1 | src/lib/ai/prompt-cache-replay.test.ts |
| 1 | src/lib/ai/reformat-framework-oct25.test.ts |
| 1 | src/lib/ai/reply-matches-card-cleaning.test.ts |
| 1 | src/lib/ai/reply-matches-card-two-forms.test.ts |
| 1 | src/lib/ai/reply-matches-card.test.ts |
| 1 | src/lib/ai/report-turns.test.ts |
| 1 | src/lib/ai/round1-scoreboard.test.ts |
| 1 | src/lib/ai/self-check.test.ts |
| 1 | src/lib/ai/spend-guard-store.test.ts |
| 1 | src/lib/ai/spend-meter.test.ts |
| 1 | src/lib/ai/take-off-stays-card.test.ts |
| 1 | src/lib/ai/title-of-the-employee-exit.test.ts |
| 1 | src/lib/ai/title-rule-oct24.test.ts |
| 1 | src/lib/ai/warning-level-invented-oct24.test.ts |
| 1 | src/lib/store/chat-history-tolerant.dom.test.tsx |
| 1 | src/lib/forms/account-verb-not-a-name.test.ts |
| 1 | src/lib/forms/as-you-said-app-read.test.ts |
| 1 | src/lib/forms/as-you-said-manager-words.test.ts |
| 1 | src/lib/forms/chat-form-records.test.ts |
| 1 | src/lib/forms/corrected-date-kept.test.ts |
| 1 | src/lib/forms/denial-no-account.test.ts |
| 1 | src/lib/forms/described-attendance-not-denied.test.ts |
| 1 | src/lib/forms/drafted-text-placeholder-words.test.ts |
| 1 | src/lib/forms/employee-match.test.ts |
| 1 | src/lib/forms/employee-roster-store-scoped.test.ts |
| 1 | src/lib/forms/employee-verification.test.ts |
| 1 | src/lib/forms/exit-library.test.ts |
| 1 | src/lib/forms/exit-termination-paste.test.ts |
| 1 | src/lib/forms/exit-terms-not-names.test.ts |
| 1 | src/lib/forms/form-patch-flags-off.test.ts |
| 1 | src/lib/forms/form-patch-model.test.ts |
| 1 | src/lib/forms/form-records-no-judgement.test.ts |
| 1 | src/lib/forms/future-prior-row.test.ts |
| 1 | src/lib/forms/issue-after-request-reason.test.ts |
| 1 | src/lib/forms/issue-is-the-account.test.ts |
| 1 | src/lib/forms/level-ends-request.test.ts |
| 1 | src/lib/forms/missed-shift-not-lateness.test.ts |
| 1 | src/lib/forms/msb-phrase-soc.test.ts |
| 1 | src/lib/forms/no-notice-no-date.test.ts |
| 1 | src/lib/forms/not-a-name.test.ts |
| 1 | src/lib/forms/off-roster-confirm.test.ts |
| 1 | src/lib/forms/one-form-each.test.ts |
| 1 | src/lib/forms/payroll-deduct-amount.test.ts |
| 1 | src/lib/forms/place-from-cue.test.ts |
| 1 | src/lib/forms/possessive-place.test.ts |
| 1 | src/lib/forms/prior-forms-am-warnings.test.ts |
| 1 | src/lib/forms/prior-step-date-list.test.ts |
| 1 | src/lib/forms/prior-step-previously.test.ts |
| 1 | src/lib/forms/proposal-name-correction.test.ts |
| 1 | src/lib/forms/relative-date.test.ts |
| 1 | src/lib/forms/remove-policy-not-named.test.ts |
| 1 | src/lib/forms/request-from-names-employee.test.ts |
| 1 | src/lib/forms/roster-name-in-candidate.test.ts |
| 1 | src/lib/forms/roster-only-names.test.ts |
| 1 | src/lib/forms/rule-conflicts.test.ts |
| 1 | src/lib/forms/s34-edit-make-it-about.test.ts |
| 1 | src/lib/forms/s35-ca-not-prior-coaching.test.ts |
| 1 | src/lib/forms/s35-draw-me-up-ca.test.ts |
| 1 | src/lib/forms/s35-no-recursion.test.ts |
| 1 | src/lib/forms/sales-triple-keeps-words.test.ts |
| 1 | src/lib/forms/set-aside-plan.test.ts |
| 1 | src/lib/forms/signed-step-not-a-request.test.ts |
| 1 | src/lib/forms/staff-picker-directory.test.ts |
| 1 | src/lib/forms/stale-needs-roster-person.test.ts |
| 1 | src/lib/forms/street-address-not-a-name.test.ts |
| 1 | src/app/api/chat/answer-not-a-name-e2e.test.ts |
| 1 | src/app/api/chat/create-currency-audit-e2e.test.ts |
| 1 | src/app/api/chat/draft-reuse-same-chat-e2e.test.ts |
| 1 | src/app/api/chat/exit-shortcut-terms-e2e.test.ts |
| 1 | src/app/api/chat/final-reply-marker-guard.test.ts |
| 1 | src/app/api/chat/form-edit-noop-guard-flags-off.test.ts |
| 1 | src/app/api/chat/form-type-switch-e2e.test.ts |
| 1 | src/app/api/chat/payroll-typo-answer-e2e.test.ts |
| 1 | src/app/api/chat/prior-actions-yearless-oct25.test.ts |
| 1 | src/app/api/chat/proposal-path-flags-e2e.test.ts |
| 1 | src/app/api/chat/same-form-copy-e2e.test.ts |
| 1 | src/app/api/chat/unread-day-date-e2e.test.ts |
| 1 | src/app/api/forms/coaching-qa-fixes-e2e.test.ts |
| 1 | src/app/api/forms/cross-chat-draft-route.test.ts |
| 1 | src/app/api/forms/exit-form-e2e.test.ts |
| 1 | src/app/api/forms/finalized-form-revision-e2e.test.ts |
| 1 | src/app/api/forms/form-edit-name-gate-roster-e2e.test.ts |
| 1 | src/app/api/forms/hr-feedback-oct21-e2e.test.ts |
| 1 | src/app/api/forms/location-authority.test.ts |
| 1 | src/app/api/forms/policy-change-benefits-warning-e2e.test.ts |
| 1 | src/app/api/forms/proposal-currency.test.ts |
| 1 | src/app/api/forms/truncated-draft-route.single-writer.test.ts |
| 1 | src/app/api/forms/truncated-draft-route.test.ts |
| 1 | src/lib/ingestion/extract/pdf-ocr.test.ts |
| 1 | src/app/api/chat/conversations/deletion-and-ordering.test.ts |

## Failing test names

### src/app/api/chat/action-plan-fits-e2e.test.ts
- PLAN_PAYROLL_SENTENCE_ENABLED off: as main the plan says nothing of the deduction
- PLAN_PAYROLL_SENTENCE_ENABLED off: as main both flags read off by default
### src/app/api/chat/action-plan-manager-only-live-path.test.ts
- acceptance: Action Plan manager-only on Ask Bubbles' live path (the full remap) flag off: the C-list turn's card prints the model's plan, as production did (unchanged)
- acceptance: Action Plan manager-only on Ask Bubbles' live path (the full remap) flag off, control: today the remap prints its own rewrite of the typed plan (what the flag changes)
### src/app/api/chat/actor-authority.test.ts
- 44. the actor comes from the session, never from the body passes the authenticated role and scope
- 44. the actor comes from the session, never from the body ignores a role and a scope the browser asserts about itself
- 44. the actor comes from the session, never from the body carries a null scope through rather than inventing one
- 44. the actor comes from the session, never from the body passes the message id as provenance, bounded and optional
- whose earlier conversations Bubbles may recall is the session's own subject, never anything the body says
- whose earlier conversations Bubbles may recall carries this conversation's `conv_*` id, and drops anything else
### src/app/api/chat/ai-reads-code-checks-e2e.test.ts
- QA S12: "this should be a written and note a verbal ca was given on 9-1-26" Type of warning was blank; with the reader it is Written, and the verbal on 9/1 is a prior step
- QA S12: "this should be a written and note a verbal ca was given on 9-1-26" a level the quote does not say is dropped by the code
- QA S1 name forms: the employee is saved as the roster spells them first name only
- QA S1 name forms: the employee is saved as the roster spells them Last, First
- QA S1 name forms: the employee is saved as the roster spells them a name the roster does not have is not put on the card
- QA S3: "she was issued a verbal ca on 10.1" ... "yes payrol ldeduct" ... "dodge" no form could be created; with the reader it is, with the 10/1 verbal and payroll yes
### src/app/api/chat/answer-not-a-name-e2e.test.ts
- ANSWER_NOT_A_NAME_ENABLED and STORE_WORD_NOT_A_NAME_ENABLED off: as main "payrol ldeduct" and "dodge" are read as the employee
### src/app/api/chat/b13-remap-p0-oct25.test.ts
- B13 P0 rows in every register, both flags on (production flags too) all lowercase: B4 turn 2 ("verbal") — PINNED: a lowercase name is cut to its first word
- B13 P0 rows in every register, both flags on (production flags too) sentence case, names lowercase: B4 turn 2 ("verbal") — PINNED: a lowercase name is cut to its first word
### src/app/api/chat/card-change-e2e.test.ts
- each field alone the job title
- what is refused a date that is not a real day is never sent, and one typed is never taken
### src/app/api/chat/conversations/deletion-and-ordering.test.ts
- a wrong browser clock cannot talk a cleared conversation back onto the account is not fooled by a turn id belonging to somebody else
### src/app/api/chat/conversations/ownership.test.ts
- CHAT_HISTORY_STATE_CHUNKED_ENABLED: an account with many chats (QA, 31 Oct 2026) off: one read carries every conversation id (the request that fails for thousands of chats)
- NEXT_PUBLIC_CHAT_LOCAL_OWNER_ENABLED: the history state's owner key off: no key, as before
### src/app/api/chat/corrective-action-warning-level-chat-route.test.ts
- the exact production sentence, through POST /api/chat ticks Verbal from "given verbal warning", lists the 9/21 history, and never escalates to Written
- the exact production sentence, through POST /api/chat an explicit Verbal Warning selects only Verbal
- the exact production sentence, through POST /api/chat a one-word answer after the draft exists lands on that draft
### src/app/api/chat/create-currency-audit-e2e.test.ts
- with the audit's flags off, as main P4 preferred name + surname is refused [FNS on, PARTIAL on, reader on]
### src/app/api/chat/date-answer-applied-e2e.test.ts
- DATE_ANSWER_APPLIED_ENABLED on lowercase "today" dates the card and the draft
- DATE_ANSWER_APPLIED_ENABLED on lowercase after "She is at Dodge", "today" dates the card and the draft
- DATE_ANSWER_APPLIED_ENABLED on Sentence case "today" dates the card and the draft
- DATE_ANSWER_APPLIED_ENABLED on Sentence case after "She is at Dodge", "today" dates the card and the draft
- DATE_ANSWER_APPLIED_ENABLED off: as main today
### src/app/api/chat/draft-reuse-same-chat-e2e.test.ts
- flag on: a draft is reused only by its own chat the same chat, a different date: a new draft (CONVERSATION_DRAFT_REUSE_ENABLED on)
### src/app/api/chat/edits-dates-replay-e2e.test.ts
- flag off: production today B15 has no Date
- QA B-list on the proposal flow (remap off, as QA reports now): a prior step's date is never the form's B2: dated 2026-10-20, with no invented date
- QA B-list on the intent path (remap off, intent extraction on): a prior step's date is never the form's B1: dated 2026-10-01, never the 1-1-26 acknowledgement
- QA B-list on the intent path (remap off, intent extraction on): a prior step's date is never the form's B2: dated 2026-10-20, with no invented date
- QA B-list on the intent path (remap off, intent extraction on): a prior step's date is never the form's B4: the offense date is the only date; the register shortage is a new form with $3.25
- QA B-list on the intent path (remap off, intent extraction on): a prior step's date is never the form's B8: dated 2026-10-20, never the 1-1-25 coaching
### src/app/api/chat/exit-intake-oct25.test.ts
- slot retention off, form state off unchanged flag off: the exit readers read as before (the live replies)
- slot retention on, form state off unchanged flag off: the exit readers read as before (the live replies)
- slot retention off, form state on unchanged flag off: the exit readers read as before (the live replies)
- slot retention on, form state on unchanged flag off: the exit readers read as before (the live replies)
### src/app/api/chat/exit-shortcut-terms-e2e.test.ts
- her exit wording, chat → Create (STALE_NEEDS_ROSTER_PERSON_ENABLED) off: refused as live — the form's own words read as more people
### src/app/api/chat/final-reply-marker-guard.test.ts
- FINAL_REPLY_MARKER_GUARD_ENABLED off (as before): a tagged answer reaches the browser tagged, on the streamed (slow) path
### src/app/api/chat/first-name-ask-e2e.test.ts
- FIRST_NAME_ASK_ENABLED on as written: asks for ivy's full name, then in new words
- FIRST_NAME_ASK_ENABLED on lowercase: asks for ivy's full name, then in new words
- FIRST_NAME_ASK_ENABLED off: as main the same question twice, word for word
### src/app/api/chat/form-edit-noop-guard-flags-off.test.ts
- FORM_EDIT_NOOP_GUARD_ENABLED off: the same chats, byte for byte (a) the tool flags on, (b) production's flags, (c) the guard alone — equal to main before the flag
### src/app/api/chat/form-edit-plain-words-e2e.test.ts
- "this is what i am wanting to coach on: …" with the draft open off (production today): nothing written, and the reply says it was updated
- "this is what i am wanting to coach on: …" with the draft open FORM_EDIT_HONEST_REPLY: when nothing was written, the reply never says it was
- "make that update" after a reply that printed the Details off: nothing written
- a stated behaviour of the employee with her coaching draft open off: answered, nothing written
- live check A5: "make that update" after a reply that offered no update FORM_EDIT_PLAIN_WORDS: that reply is not written into Details
- a turn read as content for the form that the revision still refuses FORM_EDIT_HONEST_REPLY: said plainly, never the ordinary answer
- independent review item 5: "Marnie was late 3 times this week what should I put for the policy" FORM_EDIT_PLAIN_WORDS: answered, never written into Details
- live check A3: "add details about the rolling rack" when the only change was "<UNKNOWN>" ANGLE_PLACEHOLDER_GUARD only: Details are as they were, but the reply says it updated the form
### src/app/api/chat/form-revision-wiring.test.ts
- a revision of the open form falls through to an ordinary answer when the turn is not a revision
- an ordinary answer while a form is open is told which form is open, read by the server
### src/app/api/chat/form-type-switch-e2e.test.ts
- the open card switches form and keeps the employee, the date and the store asking for the form that is already open changes nothing
### src/app/api/chat/last-first-name-read-e2e.test.ts
- a 'Last, First' name, live flags on, no AI reader off: the rules keep no employee for 'Marlowe, Quinn'; on: the one roster person, no model call
- a 'Last, First' name, live flags on, no AI reader the other fields are the rules' own
### src/app/api/chat/live-flags-with-reader-e2e.test.ts
- live flags on, reader off and on: the owner's and testers' chats (g) the reader timing out: the same chat as reader off
- live flags on, reader off and on: the owner's and testers' chats where the reader fills a field the rules left open, that is the only difference
- live flags on, reader off and on: the owner's and testers' chats first name only ('quinn'): the card shows the full roster name, and nothing is filed until Create is pressed
### src/app/api/chat/name-question-only-e2e.test.ts
- NAME_QUESTION_ONLY_ENABLED on: the coaching card (form-proposal.ts, approved by Pau 27 Oct 2026) Sentence case: LS-B3 never gets the list
- NAME_QUESTION_ONLY_ENABLED on: the coaching card (form-proposal.ts, approved by Pau 27 Oct 2026) lowercase: LS-B3 never gets the list
### src/app/api/chat/payroll-typo-answer-e2e.test.ts
- PAYROLL_TYPO_ANSWER_ENABLED off: as main the typo sets nothing on its own turn
### src/app/api/chat/prior-actions-yearless-oct25.test.ts
- the readers read the yearless coaching as an earlier step, and the late opening as the incident
### src/app/api/chat/prior-sentence-fix-live-e2e.test.ts
- full remap off (production) production env, flag off, D3 unset: as main D2
- full remap off (production) production env, flag off, D3 unset: as main TWO
- full remap off (production) production env, flag off, D3 unset: as main THREE
- full remap off (production) production env, flag off, D3 unset: as main RANGE
- full remap off (production) production env, flag off, D3 unset: as main ONE
- full remap off (production) production env, flag off, D3 unset: as main OTHER_IN_LIST
- full remap off (production) production env, flag off, D3 unset: as main COWORKER
- full remap off (production) production env, flag off, D3 on: as main D2
- full remap off (production) production env, flag off, D3 on: as main TWO
- full remap off (production) production env, flag off, D3 on: as main THREE
- full remap off (production) production env, flag off, D3 on: as main RANGE
- full remap off (production) production env, flag off, D3 on: as main ONE
- full remap off (production) production env, flag off, D3 on: as main OTHER_IN_LIST
- full remap off (production) production env, flag off, D3 on: as main COWORKER
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main D2
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main TWO
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main THREE
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main RANGE
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main ONE
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main OTHER_IN_LIST
- full remap on (not production, extra coverage) production env, flag off, D3 unset: as main COWORKER
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main D2
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main TWO
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main THREE
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main RANGE
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main ONE
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main OTHER_IN_LIST
- full remap on (not production, extra coverage) production env, flag off, D3 on: as main COWORKER
### src/app/api/chat/proposal-path-flags-e2e.test.ts
- FORM_EDIT_DATE_RULES on the live path: an edit edits the card, it never becomes the Issue B17 conv_mvnuh50i2hanl53: "add that she was also on her phone" is added to the Issue in her words, and Create 
### src/app/api/chat/qa-oct21-audit-e2e.test.ts
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction the production conversation: dated 10-1-26, Verbal, $25 Yes, Late Opening p.15 quoted, $25 in the plan
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction "payroll deduct DOES apply and state $25 will be payroll deducted" is a Yes, and the plan states $25
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction "$25 will be deducted from her check" is a Yes, and the plan states $25
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction "payroll deduct 25 dollars" is a Yes, and the plan states $25
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction "payroll deduction of $25.00 applies" is a Yes, and the plan states $25.00
- Issue 1: a late opening on 10-1-26 with a $25 payroll deduction "payroll deduct applies" is a Yes, and the plan states $25.00
- Issue 4: a $3.25 payroll deduction reaches the Action Plan the production conversation: Yes read, not asked; the plan states $3.25 exactly
- Issue 4: a $3.25 payroll deduction reaches the Action Plan "payroll deduct of $3.25 is applicable" → yes, and the plan states $3.25
- Issue 4: a $3.25 payroll deduction reaches the Action Plan "payroll deduct applies and $3.25 will be deducted from check" → yes, and the plan states $3.25
- Issue 4: a $3.25 payroll deduction reaches the Action Plan "deduct $3.25 from her paycheck" → yes, and the plan states $3.25
- Issue 4: a $3.25 payroll deduction reaches the Action Plan "she will be payroll deducted 3.25" → yes, and the plan states $3.25
- Issue 4: a $3.25 payroll deduction reaches the Action Plan after the form exists: the amount changed, then cancelled, then restored — the plan follows each time and nothing else moves
- workflow: corrections change only what was asked; finalized forms are never changed silently repeating an answer already on the form changes nothing
### src/app/api/chat/question-not-form-e2e.test.ts
- P0: a question is answered (the full remap and intent extraction) conv_mvnsvw4t2a3btpw: "what policy does that fall under?" is answered; the card is not rewritten
- P0: a question is answered (the full remap and intent extraction) an earlier turn never fills What happened for the next card
### src/app/api/chat/relative-date-reader-e2e.test.ts
- UNREAD_DATE_ASK_ENABLED on reader off: "last tuesday" is named and the date asked for
- UNREAD_DATE_ASK_ENABLED on reader on: "she was late last week" is asked about
- UNREAD_DATE_ASK_ENABLED on reader on: "she was late the other day" is asked about
- UNREAD_DATE_ASK_ENABLED on reader on: "she was late 3 days ago" is asked about
### src/app/api/chat/same-form-copy-e2e.test.ts
- "for whole staff" with Remy's draft open (after "Do the same coaching form for remy calder") STAFF_PICKER_BARE_ANSWER: no card — one person at a time, the staff to choose from — and Remy's draft untou
### src/app/api/chat/staff-picker-e2e.test.ts
- "Create a coaching form." → "Who is this form for?" → "for whole staff - associates" (one store) STAFF_PICKER: the store's staff by name and position, who it is for, no card and no model call
- "can you create a coaching form for my whole staff?" (an account over several stores) STAFF_PICKER: asks which store, never guessing, then lists only that store
- "can you create a coaching form for my whole staff?" (an account over several stores) STAFF_PICKER: a store-scoped account is never shown another store's staff, even when it names one
- only a role that may create the form is shown the staff STAFF_PICKER: a location manager is shown the staff
- STAFF_PICKER_STORE_TITLES: the store's staff, not the office off: every person the directory affiliates with the store, office titles included
- STAFF_PICKER_STORE_TITLES: the store's staff, not the office on: Team Members and the store's managers only; no title on file is kept
### src/app/api/chat/stored-slots-not-a-request-e2e.test.ts
- a Corrective Action, "yes", "$25", then Create draft the card keeps the incident turn and the draft keeps the observation (Sentence case, flag off)
- a Corrective Action, "yes", "$25", then Create draft the card keeps the incident turn and the draft keeps the observation (Sentence case, flag on)
- a Corrective Action, "yes", "$25", then Create draft the card keeps the incident turn and the draft keeps the observation (lowercase, flag off)
- a Corrective Action, "yes", "$25", then Create draft the card keeps the incident turn and the draft keeps the observation (lowercase, flag on)
### src/app/api/chat/turn-lifecycle.test.ts
- the exact production failure cannot happen again a slow turn write still yields a rateable answer
- the exact production failure cannot happen again never answers successfully without a turn, at any write latency
- the guarantee holds on every surface, not just the one that broke bed_usage: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke main_chat: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke overview: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke location_performance: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke sales_totals: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke spa_wellness: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke spa_engagement: a cold first write still yields a rateable answer
- the guarantee holds on every surface, not just the one that broke google_reviews: a cold first write still yields a rateable answer
- the first answer and the second are now identical both carry a turn, even when only the first write is slow
### src/app/api/chat/typed-employee-name-oct25.test.ts
- the intent reading (INTENT_EXTRACTION_ENABLED, off in production) C-list and exit → Test Employee — slot model copied the full name
- the intent reading (INTENT_EXTRACTION_ENABLED, off in production) C-list and exit → Test Employee — slot model copied the first word only
- the intent reading (INTENT_EXTRACTION_ENABLED, off in production) C-list and exit → Test Employee — slot model copied no employee
### src/app/api/chat/unknown-name-ask-e2e.test.ts
- UNKNOWN_NAME_ASK_ENABLED on with no name typed, the second ask is in new words
- UNKNOWN_NAME_ASK_ENABLED off: as main the same opening question, every turn
### src/app/api/chat/unread-day-date-e2e.test.ts
- "she was late last week", Create without answering the date question off (production today): the draft is told today is the incident date, and the record says so
### src/app/api/chat/warning-level-owner-scenarios.test.ts
- the owner's acceptance list for PR #10 2. a prior written warning does not make the current action a termination
- the owner's acceptance list for PR #10 4. historical warnings are recorded as history, oldest first, not as the current level
- the owner's acceptance list for PR #10 5. an explicit instruction for this form takes precedence over the history around it
### src/app/api/forms/admin-feedback-oct16-e2e.test.ts
- Issue 3 — Corrective Action from complete conversational information keeps the form when drafting fails, so a retry cannot file a second disciplinary record
- Issue 2 — the employee's position Woven's verified title wins over the manager's wording, and the disagreement is said
- Issue 2 — the employee's position never borrows a terminated employee's Woven position
- Issue 3 — which date goes on the form does not pick the first of two incident dates: it asks, once, and dates the form today meanwhile
- Issue 3 — which date goes on the form settles on "today" without asking again
- browser fixture e2e/fixtures/admin-feedback-oct16.json is what the server produces for these conversations
### src/app/api/forms/asd-no-form-monitoring.test.ts
- the permission matrix drops it for an AM with the flag on
- the permission matrix changes nothing else for an AM, and nothing at all for any other role
- an AM opens the coaching form it created in chat with the flag off, still opens both as today
- no dead link or 403 widget for an AM hides the sidebar entry (the sidebar draws only what the role can do)
### src/app/api/forms/coaching-feedback-e2e.test.ts
- the coaching register and the language cleanup asks what the coaching covers, not for 'the performance concern'
- checking the typed name against the manager's own team asks 'Did you mean …?' for a close misspelling and offers no form until answered
- checking the typed name against the manager's own team never matches or names an employee outside the manager's scope
- across the roles that can create coaching location_manager: the name is checked in scope and the employee's salon is filled
- across the roles that can create coaching assistant_manager cannot create a Coaching Form
### src/app/api/forms/coaching-qa-fixes-e2e.test.ts
- P7 — shared and service accounts are never a name suggestion real people are still matched
### src/app/api/forms/corrective-action-chat-edits-e2e.test.ts
- a policy named in the conversation goes onto the open form adds Late Opening to Direct policy, in the manual's own words, as verified
- any other change to the open Corrective Action Form is made in place changes the warning level, re-derives Policy Violated, and never lets the model write a policy line
- any other change to the open Corrective Action Form is made in place puts the deduction in the Action Plan when payroll deduct is changed to Yes, and takes it out on No
- QA 22 Oct: facts told after the form exists go onto the open form prior steps, the date, the level, payroll and the policy, each in its own turn, with nothing lost
- QA 22 Oct: facts told after the form exists go onto the open form "first time, no prior coaching" fills an empty Prior Actions, and never overwrites a list
- QA 22 Oct, round 3: corrections in everyday wording change only what they name level, date, prior coaching, payroll and policy, one turn each, every other field untouched
### src/app/api/forms/corrective-action-conversation-qa-e2e.test.ts
- Q1 the original 21 Oct request, as typed is one complete draft: level, history, payroll, the incident's date, and the policy the manual puts it under
- Q2 the production failure's shape: the level asked, then one-word answers "written", then "no", keep the account, the history and the date
- Q2 the production failure's shape: the level asked, then one-word answers a reload mid-intake, and the same answer twice, lose nothing and add nothing
- Q3 where the manual does not settle the policy reads as Attendance without asking; the form ticks Absenteeism and quotes Attendance
- Q6 corrections before the draft is created level, incident date and a prior action's date are each corrected, and nothing else moves
- Q8 the draft survives reloads, reopening and repeats reopened twice reads the same; a repeated answer after a reload changes nothing; a second press of Create makes no second form
- Q8 the draft survives reloads, reopening and repeats a redraft keeps what the manager typed
- Q11 prior coaching given as a follow-up before the draft: read back, and on the saved form
- Q11 prior coaching given as a follow-up after the draft: added to the open form, in date order, never twice, and recorded
- Q12 dates corrected after the draft exists a prior action's date, and only that line
- Q15 duplicate Create presses make one record a new card for the same person is a new form
### src/app/api/forms/corrective-action-dm-feedback-e2e.test.ts
- previous coaching stated in chat is not offered as the form's date, is read back, and fills the prior-actions line
- previous coaching stated in chat "jba manual 1-1-26 for previous coaching" — the date first, the label after
- previous coaching stated in chat "previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26" — every item of the list is history
- a payroll deduction with an amount is read as Yes, not asked, and the Action Plan states the amount before the closing
- a payroll deduction with an amount "payroll deduct applies and $3.25 will be deducted from check" says the same
- a payroll deduction with an amount with no amount stated, says a deduction applies and invents no figure
- a payroll deduction with an amount says nothing about pay when payroll deduct is No
- F: a late opening with a payroll deduction dates the form 10-1-26, reads Verbal, the history and the $25, and the Action Plan states the $25
- F: a late opening with a payroll deduction a late arrival that is not an opening stays the Tardiness box alone
- F: a late opening with a payroll deduction with no amount stated, states the $25.00 the quoted Late Opening section gives
- F: a late opening with a payroll deduction a late arrival cites Attendance alone, and the plan invents no figure
- G: a meeting not attended is cited where the manual puts it reads Attendance from the manual, says why, and the draft ticks Absenteeism over the model's Standards of Conduct
- G: a meeting not attended is cited where the manual puts it where the manual does not say, it is still Attendance — and the form says so
- QA 22 Oct: the 21 Oct missed-meeting request, created, reopened and finalized fills every section it was told, invents none it was not, and finalizes without an override
- QA 22 Oct: short answers and corrections keep the account "verbal please" after the request fills the level and keeps every other fact
- QA 22 Oct: short answers and corrections keep the account written → actually verbal before the draft: the correction wins, nothing else is lost
- QA 22 Oct: answers given one at a time while the card is open records which turns the intake takes, and the final card holds every answer
- QA 22 Oct: corrections while the card is open, before Create every turn updates the same card, the latest answer wins, and nothing earlier is lost
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form Hey, I need to document a written warning for Tess Varga — she didn't show for our 10/20/26 staff meetin
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form tess varga — no call to the 10/20/26 manager meeting, issue a verbal, previously verbally warned 9/1/26,
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form Can we put Tess Varga on a written for skipping the 10/20/26 meeting? She's had a verbal before on 9/1/2
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form I have to write someone up ⏎ Tess Varga ⏎ she skipped the monthly meeting on 10/20/26 ⏎ written ⏎ she ha
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form need a CA for tess varga for missing the 10/20/26 meeting, verbal ⏎ sorry, make that written ⏎ wait, the
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form Tess Varga missed our team meeting yesterday 10/21/26 without telling anyone. I want to give her a writt
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form Please document a written CA for Remy Calder — she didn't finish her Woven modules by the 10/12/26 deadl
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form tess varga needs a write up ⏎ she bailed on the 10/19/26 meeting ⏎ make it a written warning ⏎ oh and sh
- QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form Remy Calder - CA - written - no call no show to manager meeting 10/13/26 - payroll deduction no - prior 
- CA_SALES_POLICY_ENABLED: the Corrective Action draft's added lines off: neither line is in the draft's prompt (as before)
- CA_SALES_POLICY_ENABLED: the Corrective Action draft's added lines on: the form has no under_performance box, so sales results read as standards_of_conduct; the Corrective Action line follows the lowe
- STALE_PROMPT_LINES_OFF_ENABLED: the draft's lines about boxes revision 7 does not have on: only those two lines go (the prompt with them put back is the prompt with the flag off)
### src/app/api/forms/corrective-action-late-opening-e2e.test.ts
- Direct policy from official manual, for a late opener cites the manual's Late Opening section and its printed page, ahead of Attendance
- a form created from a name alone is redrafted, with the citation, once the manager says what happened redrafts the form on screen, and Direct policy cites Late Opening, p. 15, then Attendance, p. 14
- a form created from a name alone is redrafted, with the citation, once the manager says what happened keeps a policy line the manager typed when the redraft cannot cite one
### src/app/api/forms/corrective-action-payroll-e2e.test.ts
- changing the answer after the form exists updates the form from chat, and the regenerated PDF shows the new answer
- "create ca for Marlowe Test she was late today, got verbal warning on september 21" lists the prior warning with its date from the manager's words, and keeps today as the form's date
- a CA for somebody with forms already on file reads the finalized ones back in chat and lists them on the drafted form
### src/app/api/forms/corrective-action-revision-5-e2e.test.ts
- creating a Corrective Action from chat drafts the new history list, names the employee, ends the plan with the closing, and prints all three
- creating a Corrective Action from chat asks the intake question the new field answers
- changing the Action Plan after the form exists keeps the closing through a manager's edit, a chat correction and a redraft
- a Corrective Action filed on revision 4, revised keeps the original exactly, and carries its two old lines into the new list on the revision
- a Corrective Action filed on revision 6, revised after revision 7 (Type of Offense, 4 Nov 2026) with the deployment's flags (production: CA_SALES_POLICY_ENABLED off), an old Tardiness tick is carried 
### src/app/api/forms/corrective-action-warning-level-e2e.test.ts
- 1. previous verbal warning, current warning unspecified (the production report) ticks Verbal from "given verbal warning", records the 9/21 history, and never Written
- 1. previous verbal warning, current warning unspecified (the production report) an answer after the draft exists updates that draft, not a new one
- 2. previous verbal warning, current verbal warning explicitly requested ticks Verbal only, as the manager's statement, and keeps the history
- 3. previous verbal warning, current written warning explicitly requested ticks Written, because the manager said so
- 4. multiple previous warnings with different dates lists every step oldest first and sets only the level stated for this form
- 5. the manager changes Written Warning to Verbal Warning through chat updates the same draft, unticks Written, and leaves every other line as it was
- 5. the manager changes Written Warning to Verbal Warning through chat before the draft exists, the latest stated level wins on the same proposal
- 5. the manager changes Written Warning to Verbal Warning through chat does not treat more history, or a question, as a change
- review: the history line across the year boundary a December warning, mentioned in January, is dated last December
### src/app/api/forms/cross-chat-draft-route.test.ts
- cross-chat open draft on create returns the other chat's draft and creates nothing when the flag is on
### src/app/api/forms/draft-never-blank-oct26-e2e.test.ts
- 'lowercase, no call no show' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'lowercase, no call no show' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- 'lowercase, took product' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'lowercase, took product' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- 'sentence case, no call no show (the t…' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'sentence case, no call no show (the t…' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- 'sentence case, took product' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'sentence case, took product' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- 'sentence case with the name lowercase…' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'sentence case with the name lowercase…' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- 'lowercase with the name Capitalized, …' flag off: today's behaviour, pinned an empty tool call is filed blank, recorded as drafted with no fields and nothing rejected
- 'lowercase with the name Capitalized, …' flag off: today's behaviour, pinned a JSON-encoded `values` is dropped without a word: blank
- the governing framework's read fails flag off: withheld, with no event
- the governing framework's read fails flag on: read again after 1 s and 3 s; still failing, withheld with the reason recorded
- the time budget (80 s from the request's start) a framework read that fails after 81 s is not read again
- six Create presses at once (the production burst) flag off: the ones the model left blank are filed blank, as on main
- an account told as what did not happen 'lowercase, never (store)' flag off: filed blank, as on main
- an account told as what did not happen 'Sentence case, never (store)' flag off: filed blank, as on main
- an account told as what did not happen 'lowercase, never (salon)' flag off: filed blank, as on main
- an account told as what did not happen 'Sentence case, never (salon)' flag off: filed blank, as on main
- an account told as what did not happen 'lowercase, did not (no state: "<store…' flag off: filed blank, as on main
- an account told as what did not happen 'Sentence case, didn\'t' flag off: filed blank, as on main
- an account told as what did not happen 'lowercase, no call' flag off: filed blank, as on main
- flag off is byte-identical to main filled
- flag off is byte-identical to main empty
- flag off is byte-identical to main malformed
### src/app/api/forms/exit-draft-route.single-writer.test.ts
- what is stored the dates and ticks from the manager's words, and Details
- what is stored replaces whatever the model wrote for a derived key, and drops what it may not write
- what is stored fills HR's Details lines from the manager's words, under the exit allow-list
- HR feedback 30 Sep — the Harper exit form stores the notice date and tick from her words, and Details without the header sentence
### src/app/api/forms/exit-draft-route.test.ts
- what is stored the dates and ticks from the manager's words, and Details
- what is stored replaces whatever the model wrote for a derived key, and drops what it may not write
- what is stored fills HR's Details lines from the manager's words, under the exit allow-list
- HR feedback 30 Sep — the Harper exit form stores the notice date and tick from her words, and Details without the header sentence
### src/app/api/forms/exit-form-e2e.test.ts
- a populated draft carries the conversation's facts, leaves every decision blank, and downloads
### src/app/api/forms/exit-form-permissions.test.ts
- an unauthorized role — assistant_manager cannot create an exit form by its key
- an unauthorized role — assistant_manager cannot have Ask Bubbles draft into an existing exit form
- who may read a filed exit form the ASD's ordinary Form Monitoring access is untouched for other forms
- who may read a filed exit form the monitoring list drops exit forms for an ASD and keeps them for a Salon Director
### src/app/api/forms/finalized-form-revision-e2e.test.ts
- a finalized Corrective Action Form, changed in chat a corrected payroll answer lands on a new draft, and the Action Plan follows it there
### src/app/api/forms/form-edit-name-gate-roster-e2e.test.ts
- an edit with capitalised words, the Follow-Up form open for Kaitlyn Brook flag off: "Add that she Must Practice the sanitizing checklist every shift." is read as naming somebody else, and dropped (tod
### src/app/api/forms/form-monitoring-store-access.test.ts
- the list API: who sees which stores' forms a regular employee sees only their home store
- a person Woven assigns to several stores keeps a store-scoped employee's own assignment when Woven offers more
### src/app/api/forms/hr-feedback-oct21-e2e.test.ts
- a CA request answered with one word keeps the whole account drafts from the original request after the manager answers "written"
### src/app/api/forms/hr-feedback-oct21-followups-e2e.test.ts
- a late opening, as HR typed it reads the level, the date, the deduction and its amount, and cites Late Opening
- the payroll deduction, however HR words it $25 will be payroll deducted
- the payroll deduction, however HR words it payroll deduct $25
- the payroll deduction, however HR words it $25 payroll deduction applies
- the payroll deduction, however HR words it deduct $3.25 from her pay
- what an earlier coaching was for stays on the history line previous coaching was 9/15 for cell phone use
### src/app/api/forms/location-authority.test.ts
- 15. a chat-created form is authorized like any other applies the TEMPLATE's own permission, not chat's opinion of it
### src/app/api/forms/one-draft-per-conversation-e2e.test.ts
- one draft per form in a conversation (flag on) "also create a CA for her for dress code on 10-22" in the same chat makes a second draft (QA, 24 Oct 2026)
- flag off: unchanged the production chats still file a draft per pressed card
### src/app/api/forms/owner-retest-e2e.test.ts
- capitalisation, misspellings, shorthand and word order jordan testperson was $40 short on her drawer last night, needs a written warning
- capitalisation, misspellings, shorthand and word order jordan testperson cash handling written warning
- capitalisation, misspellings, shorthand and word order need a CA for jordan testperson. she mishandled cash at close yesterday. written warning
- capitalisation, misspellings, shorthand and word order 'given verbal warning on 9/21' → Verbal, never Written
### src/app/api/forms/pm-draft-route.single-writer.test.ts
- the progression framework reaches a governed draft sends the framework's own text, with its provenance, for Follow-Up Coaching
- the progression framework reaches a governed draft sends it for the DPOA too
- the progression framework reaches a governed draft does NOT send it, or the rules, for the plain Coaching Form
- a governed draft is blocked when the framework is unavailable follow-up-coaching is not drafted at all
- a governed draft is blocked when the framework is unavailable dpoa is not drafted at all
- a governed draft is blocked when the framework is unavailable policy-review is not drafted at all
- a governed draft is blocked when the framework is unavailable sdit-epp is not drafted at all
- a governed draft is blocked when the framework is unavailable blocks on a retrieval outage as well as a missing document
- a governed draft is blocked when the framework is unavailable still drafts the Coaching Form when the framework is down
- a sensitive final action never reaches the persistence call ticks the level the production report says was given, as the manager's statement, never the model's Written
- the Corrective Action Form's generation behaviour B. attendance — an employee was late today retrieves the framework and the approved attendance policy, separately
- the Corrective Action Form's generation behaviour C. dress code — the QA case, verbatim does not invent a uniform requirement when the manual has none
- the Corrective Action Form's generation behaviour C. dress code — the QA case, verbatim tells the manager the exact policy still has to be verified
- the Corrective Action Form's generation behaviour D. no approved policy is found still structures the form from the framework, and invents nothing
- the mini-skirt case, end to end tells the manager everything it removed and why
- the mini-skirt case, end to end still retrieves the framework deterministically, by its role
- HR feedback 30 Sep — the Corrective Action's policy, from the manager's words ticks a named policy with no section, and leaves Direct policy blank rather than inventing one
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (unset): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (unset): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (0): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (0): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (false): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (false): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned dpoa does not read the framework or send its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned policy-review does not read the framework or send its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned drafts a governed form when the framework is unavailable
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned leaves the plain Coaching Form as it was
### src/app/api/forms/pm-draft-route.test.ts
- the progression framework reaches a governed draft sends the framework's own text, with its provenance, for Follow-Up Coaching
- the progression framework reaches a governed draft sends it for the DPOA too
- the progression framework reaches a governed draft does NOT send it, or the rules, for the plain Coaching Form
- a governed draft is blocked when the framework is unavailable follow-up-coaching is not drafted at all
- a governed draft is blocked when the framework is unavailable dpoa is not drafted at all
- a governed draft is blocked when the framework is unavailable policy-review is not drafted at all
- a governed draft is blocked when the framework is unavailable sdit-epp is not drafted at all
- a governed draft is blocked when the framework is unavailable blocks on a retrieval outage as well as a missing document
- a governed draft is blocked when the framework is unavailable still drafts the Coaching Form when the framework is down
- a sensitive final action never reaches the persistence call ticks the level the production report says was given, as the manager's statement, never the model's Written
- the Corrective Action Form's generation behaviour B. attendance — an employee was late today retrieves the framework and the approved attendance policy, separately
- the Corrective Action Form's generation behaviour C. dress code — the QA case, verbatim does not invent a uniform requirement when the manual has none
- the Corrective Action Form's generation behaviour C. dress code — the QA case, verbatim tells the manager the exact policy still has to be verified
- the Corrective Action Form's generation behaviour D. no approved policy is found still structures the form from the framework, and invents nothing
- the mini-skirt case, end to end tells the manager everything it removed and why
- the mini-skirt case, end to end still retrieves the framework deterministically, by its role
- HR feedback 30 Sep — the Corrective Action's policy, from the manager's words ticks a named policy with no section, and leaves Direct policy blank rather than inventing one
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (unset): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (unset): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (0): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (0): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (false): pinned as before dpoa reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag off (false): pinned as before policy-review reads the framework and sends its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned dpoa does not read the framework or send its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned policy-review does not read the framework or send its sections
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned drafts a governed form when the framework is unavailable
- FRAMEWORK_UNPIN_ENABLED — the framework's sections and a governed draft flag on: not pinned leaves the plain Coaching Form as it was
### src/app/api/forms/pm-framework-readiness.integration.test.ts
- without the framework in the knowledge base 'dpoa' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'policy-review' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'follow-up-coaching' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'sdit-epp' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'tsd-epp' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'asd-sdit-epp' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'fttc-epp' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'dmit-epp-tsd' fails closed: no AI draft, the blank form stays editable
- without the framework in the knowledge base 'dmit-epp-dmit' fails closed: no AI draft, the blank form stays editable
- with the framework installed, identified by its tag 'dpoa' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'policy-review' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'follow-up-coaching' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'sdit-epp' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'tsd-epp' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'asd-sdit-epp' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'fttc-epp' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'dmit-epp-tsd' is drafted, with every required group of the framework given to the model
- with the framework installed, identified by its tag 'dmit-epp-dmit' is drafted, with every required group of the framework given to the model
### src/app/api/forms/policy-change-benefits-warning-e2e.test.ts
- POLICY_CHANGE_RELEVANT_ENABLED: the manager's revision is not a policy change at all off (main): no benefits citation, but the turn is still a policy change — "I couldn't find a section called …" — an
### src/app/api/forms/private-creator-forms.test.ts
- flag on, creator listed: each viewer assistant manager
- off, or nobody listed: as today assistant manager sees both with the flag off
- off, or nobody listed: as today assistant manager sees both with the flag on and an empty list
- off, or nobody listed: as today flag off: the list read asks exactly what main asks, and the body is byte-identical to no list at all
- off, or nobody listed: as today flag on with an empty list: the same read, the same body
### src/app/api/forms/proposal-currency.test.ts
- creation from a chat card re-reads the conversation refuses the Jordan card once the manager corrected the employee to Avery — and creates nothing
### src/app/api/forms/qa-f11-chat-draft-agreement.test.ts
- verified: what the chat promises is exactly what is saved one Dana Moss, on file only at this store
- possible matches: shown with their store, never saved as verified prior actions the same name at another store the manager can see
- possible matches: shown with their store, never saved as verified prior actions no store on the form yet: nothing is promised; the rule is stated; the saved form follows it
- possible matches: shown with their store, never saved as verified prior actions no store on the form yet, filed at the OTHER store: nothing is saved
### src/app/api/forms/qa-payroll-after-creation-e2e.test.ts
- QA 22 Oct 2026: a payroll answer corrected after the form exists is never left as a silent Yes Yes, then 'we cancelled the $25 payroll deduction' → No on the form, and the Action Plan no longer states
- QA 22 Oct 2026: a payroll answer corrected after the form exists is never left as a silent Yes Yes, then 'cancel the $25 payroll deduction' → No on the form, and the Action Plan no longer states a ded
- QA 22 Oct 2026: a payroll answer corrected after the form exists is never left as a silent Yes control: No, then 'change payroll deduct to yes' → Yes, and the plan states it
### src/app/api/forms/qa-w3-prior-forms-identity.test.ts
- positive: one Dana Moss, on file only at this store reads her history back in chat and writes it onto the drafted form
- positive: one Dana Moss, on file only at this store lists a Coaching Form and a Verbal CA signed the SAME day as two steps
- ambiguous: the same name at another store the manager CAN see offers the records as possible matches, each with its store
- dates: only what was received BEFORE this form leaves off a form dated after the form being drafted
### src/app/api/forms/state-code-not-a-person-e2e.test.ts
- STATE_CODE_NOT_A_PERSON_ENABLED on: a state after the store's city is never a second person 'Ne' as a first name stays one person: Ne Oakes
- STATE_CODE_NOT_A_PERSON_ENABLED on: a state after the store's city is never a second person a state code straight after a person's surname is still a question: 'Odalys Merriweather, NE' is the shape o
- STATE_CODE_NOT_A_PERSON_ENABLED with NOT_A_NAME_GUARD_ENABLED on, as in production the guard alone does not fix it: off, the manager's sentence is still refused with the state as a person
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main still refuses "Create a CA for Odalys Merriweather at Dodge, NE. She did not clock in on 10/22." with the state listed as a person
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main still refuses "Create a CA for Odalys Merriweather at Kearney, NE. She did not clock in on 10/22." with the state listed as a person
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main still refuses "Create a CA for Odalys Merriweather at Grand Island, NE. She did not clock in on 10/22." with the state listed as a person
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main still refuses the lower-case sentence
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main still refuses when the state comes in a later turn
- STATE_CODE_NOT_A_PERSON_ENABLED off: pinned to main refuses two people with the state among them, as before
### src/app/api/forms/truncated-draft-route.single-writer.test.ts
- a draft cut off at the budget stores none of the drafted text when the retry is cut off too, and says so
### src/app/api/forms/truncated-draft-route.test.ts
- a draft cut off at the budget stores none of the drafted text when the retry is cut off too, and says so
### src/app/api/knowledge/corpus-authority.test.ts
- chat cannot be pointed at another corpus grounds on this build's corpus even when the body names the real other one
- chat cannot be pointed at another corpus grounds on this build's corpus with no scope sent
- chat cannot be pointed at another corpus leaves the rest of the request the caller's
### src/features/chat/exit-inline-form.dom.test.tsx
- the finalized form downloads from the canonical PDF route
- dates, as a person reads them a finalized form shows every date MM/DD/YYYY; a draft keeps its date pickers
### src/features/chat/finalized-change-panel.dom.test.tsx
- where the button is not for a role that may not edit the form
### src/features/chat/form-proposal.dom.test.tsx
- NEXT_PUBLIC_TEAM_CARD_NO_POSITION_ENABLED: the team card has no Position row (QA live check, 3 Nov 2026) off (production today): "Not set — tell Bubbles their position" on the team card
### src/features/chat/import-every-role.dom.test.tsx
- signed in as employee sees Import in History, opens it, and imports through the one existing path
- signed in as employee still has Import after choosing Not now on the prompt
- signed in as assistant_manager sees Import in History, opens it, and imports through the one existing path
- signed in as assistant_manager still has Import after choosing Not now on the prompt
- signed in as location_manager sees Import in History, opens it, and imports through the one existing path
- signed in as location_manager still has Import after choosing Not now on the prompt
- signed in as district_manager sees Import in History, opens it, and imports through the one existing path
- signed in as district_manager still has Import after choosing Not now on the prompt
- signed in as regional_manager sees Import in History, opens it, and imports through the one existing path
- signed in as regional_manager still has Import after choosing Not now on the prompt
- signed in as admin sees Import in History, opens it, and imports through the one existing path
- signed in as admin still has Import after choosing Not now on the prompt
- signed in as owner sees Import in History, opens it, and imports through the one existing path
- signed in as owner still has Import after choosing Not now on the prompt
- signed in as developer sees Import in History, opens it, and imports through the one existing path
- signed in as developer still has Import after choosing Not now on the prompt
- Import of a chat that belongs to another account says the chat belongs to another account and was not imported
### src/features/chat/inline-form.dom.test.tsx
- a finalized form renders read-only rather than assuming a draft shows the values and no save control
- P4. finalizing freezes the version the SERVER holds finalizes once the edit is saved, and freezes the editor
- P4. a finalized form offers the record, not the editor offers Download PDF, View in Forms Register and Start another
- P4. a finalized form offers the record, not the editor links the Forms Register at the existing workspace, not a new one
- P4. a finalized form offers the record, not the editor offers no Save changes or Finalize
- P4. a finalized form offers the record, not the editor requests the PDF from the canonical endpoint
- P4. Start another begins a new request, never reusing this one calls back without touching the finalized instance
- a finalized form is edited as a new draft of it opens a revision and turns the card into that draft, editable
- a finalized form is edited as a new draft of it saves edits on the new draft, never on the finalized form
- a finalized form is edited as a new draft of it says a form was replaced once its revision is finalized, and opens the newer version
- a finalized form is edited as a new draft of it moves only its own card's pointer on a message that carried several forms
### src/features/chat/rollout-fixes.dom.test.tsx
- create a form below the rail's breakpoint is offered only to an account that may create forms, like the rail
### src/features/forms/monitoring-table.dom.test.tsx
- Edit and History on a row (NEXT_PUBLIC_FORM_REVISIONS_ENABLED) on: an assistant manager, who may view but not edit, sees History and no Edit
### src/form-revisions/form-revisions.dom.test.tsx
- who is offered Edit (the server's edit permission for that template) an assistant manager, who may only view, sees History and no Edit: finalized or draft
- who is offered Edit (the server's edit permission for that template) on the form page, Edit as new draft asks a view-only role for no reason and opens nothing
### src/lib/ai/anti-loop-replay.test.ts
- anti-loop replay b9–b12 scores the current prompt and the last-known-good prompt on the same code and flags
### src/lib/ai/ca-offer.test.ts
- CA_OFFER_KEEPS_ACCOUNT_ENABLED: "yes" is answered as the turn the offer answered (QA's MSB case M5) off: null, and the yes is the rewritten request as before
- CA_OFFER_KEEPS_ACCOUNT_ENABLED: "yes" is answered as the turn the offer answered (QA's MSB case M5) on without CA_SALES_POLICY_ENABLED: null (there is no offer)
### src/lib/ai/ca-shift-dates-kept.test.ts
- FIRST_NAME_ANSWER_KEEPS_ACCOUNT_ENABLED off: "Rhea Calloway 11/7 and 11/8" is read as the name alone (the reported loss)
- SHIFT_ACCOUNT_IS_INCIDENT_ENABLED off: the request is read as no account (the reported empty Observation)
### src/lib/ai/ca-template-map-f4.test.ts
- CA_TEMPLATE_MAP_ENABLED defaults off and is registered
- CA_TEMPLATE_MAP_ENABLED off, create a Verbal CA for Test Employee keeps no form in the intent read, as QA found
- CA_TEMPLATE_MAP_ENABLED off, create a verbal corrective action keeps no form in the intent read, as QA found
- CA_TEMPLATE_MAP_ENABLED off, write a verbal CA for Team Member keeps no form in the intent read, as QA found
- CA_TEMPLATE_MAP_ENABLED off, I need a CA for someone opening the store late keeps no form in the intent read, as QA found
- CA_TEMPLATE_MAP_ENABLED leaves the other readings alone a metric on its own stays the progression in the intent read
### src/lib/ai/call-claude.stream.test.ts
- flags off stay on messages.create calls create and does not call stream when both methods exist
- flags off stay on messages.create still retries a cut-off create once, and still does not stream
### src/lib/ai/card-meta-turn.test.ts
- cardMetaTurn off: null
- cardMetaTurn each flag alone: only its own kind
- withoutCardMetaTurns (Create's notes) off: unchanged
### src/lib/ai/chat-entity-wiring.test.ts
- general chat resolves stores and verifies employees the prompt never lets the model state a title the deterministic records did not give it
### src/lib/ai/chat-form-known-context.test.ts
- 1. a manager with one salon is never asked for it fills the salon in and leaves it off the corrective-action questions
- 2. a manager with several salons is asked only when it is genuinely open keeps the salon on the corrective-action questions while it is open
### src/lib/ai/chat-only-form-creation.test.ts
- a form request typed into Ask Bubbles asks for what is missing, in the conversation, when only the form is named
### src/lib/ai/chat-quality-replay.test.ts
- chat quality flags stay off unless set treats unset, empty, and off as off, and the on-values as on
- a Standards of Conduct corrective action keeps the employee and cites the manual does not ask for the name again: ca for marisa lempka for a standards of conduct violation. she refused to follow direc
- the action plan is exactly two sentences when that check is asked for leaves the existing builder's payroll sentence in place
### src/lib/ai/chat-stage-timings-trace.test.ts
- CHAT_STAGE_TIMINGS_ENABLED on the written trace row (coding 2's condition) off: the row's slots carry no stages
### src/lib/ai/chat-stage-timings.test.ts
- CHAT_STAGE_TIMINGS_ENABLED (QA, 9 Nov 2026): each awaited step's name and length, nothing else off: nothing is recorded
### src/lib/ai/conv-mvmj6v1t250hfij.dom.test.tsx
- conv_mvmj6v1t250hfij renders the prior action once after every turn, including when this turn is already in the history
### src/lib/ai/conv-mvmj7ifs9oosat5.dom.test.tsx
- conv_mvmj7ifs9oosat5 replays the turns onto the coaching card
### src/lib/ai/corrective-action-conversation.test.ts
- the form's name on its own corrective action opens the Corrective Action Form without asking which form
- the form's name on its own Corrective Action opens the Corrective Action Form without asking which form
- the form's name on its own CA opens the Corrective Action Form without asking which form
- the form's name on its own ca opens the Corrective Action Form without asking which form
- the form's name on its own Ca opens the Corrective Action Form without asking which form
- the form's name on its own CA form opens the Corrective Action Form without asking which form
- the form's name on its own corrective-action form opens the Corrective Action Form without asking which form
- the form's name on its own still holds §7: a metric alone gets the progression, however the form is named
- a metric on its own is answered with the progression does not open a Corrective Action Form off a low Club Close
- a metric on its own is answered with the progression holds even when the manager names the form
- a metric on its own is answered with the progression maps each rung to the real form that records it, and says which rungs have none
- a metric on its own is answered with the progression says why, and still answers the question it can answer
- a metric on its own is answered with the progression shows the sequence again as soon as the framework answers
- a metric on its own is answered with the progression names the EPPs from the library rather than from a list in the code
- the fast path — a draft from what the manager already said 3. asks for what is missing when the form is named and nothing else is said
- the fast path — a draft from what the manager already said walks a manager through what is still missing when they ask to be led
- the fast path — a draft from what the manager already said recognises the ask to be led — corrective action form — what do you need from me?
- the fast path — a draft from what the manager already said recognises the ask to be led — create a corrective action, guide me through it
- the fast path — a draft from what the manager already said recognises the ask to be led — corrective action form, step by step please
- the form date, from the request or from a follow-up answer carries no date when the manager said only "today", so the form keeps its default
- the payroll-deduct question takes the numbered answer to the intake
- the payroll-deduct question on a form that does not ask it yet is left out of the opening intake
- a form's name leading the message, across the library create ca for marlowe co she was late today, got verbal warning on september 21
- 'ca for <name>, team member at <store>' flag off, as on main: the lowercase name is not read
### src/lib/ai/employment-change-conversation.test.ts
- permissions refuses a role that may not create these forms
- found in production QA (Codex): the exact live conversations keeps 'Transfer' in Transfer Beta Test's name
- found in review: the form goes to its subject, on every form Transfer: the full name the manager gave is kept through a bare reply
- found in live QA: repeating the name keeps the turn that stated the facts drafts from the first message when the manager then sends 'Transfer Beta Test.'
### src/lib/ai/entity-facts.test.ts
- a title question is answered from Woven, outright asks about a close spelling instead of answering for someone else
- names typed in lower case are names too a possessive typed without its apostrophe is asked about, not guessed
- names typed in lower case are names too a lower-case close spelling is asked about
### src/lib/ai/exit-form-conversation.test.ts
- the chat form picker and permissions is never offered to or proposed for assistant_manager
- what Ask Bubbles says beside the proposal lists what it filled and every line it left, and asks nothing
- what Ask Bubbles says beside the proposal lists what it filled, what it left, and asks nothing when everything is there
- HR feedback 30 Sep — the Harper exit form lists the notice date, the notice tick and Woven, and asks only what nobody said
### src/lib/ai/first-name-yes-keeps-request.test.ts
- "Yes" keeps the form request off: the answer is the account alone, as before
### src/lib/ai/form-choice-stated.test.ts
- FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny) defaults off
- FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny) off, as before the intent read took the form from the assistant's Corrective Action Form
- FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny) off, as before the remap and the intent read gave the follow-up card with no earlier coaching mentioned
- FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny) off, as before QA round 12: the model's Corrective Action Form was the card, and both forms showed one
- FORM_CHOICE_STATED_ENABLED: the form the manager named wins (ported from Ask Sunny) off, as before a stored Disciplinary Action line made a coaching request a Corrective Action
### src/lib/ai/form-full-remap.test.ts
- form full remap keeps Test Employee as typed, the incident date, and the stated $25
- form full remap does not say as you said for a write-up, and does not paste the raw incident
- form full remap records the extraction model, tokens, and slots on the trace
### src/lib/ai/form-intake-qa-2026-10-21.test.ts
- 2. a possessive names the person, and the 's is not part of the name Wren's coaching form confirms the first name against the directory
- 2. a possessive names the person, and the 's is not part of the name Wren's CA - she was late 3 times this week confirms the first name against the directory
- 4. the employee's name is printed capitalised, on every form the note about a name the directory lacks uses the printed spelling
### src/lib/ai/form-proposal.test.ts
- 39. the TEMPLATE's own permission decides, and chat cannot widen it refuses a DPOA to a role that cannot create corrective action
- F3. a tampered hint gains nothing is refused when the role could not have asked for that template
- RR-F. with a form already established, it continues that one still revalidates the continued key against the role
- CA-INTAKE. the opening depends on whether the manager has described anything asks for what is missing when the card is clicked and nothing has been said
- CA-INTAKE. the opening depends on whether the manager has described anything names the date it would use, rather than saying it would use one
- HIDE. the hiring forms are not offered as choices still refuses one the role cannot create
### src/lib/ai/form-records-runtime.test.ts
- a question about forms already on file answers past corrective action form for Marcus from the register, never with a proposal
### src/lib/ai/intent-extraction.test.ts
- slots are grounded and only the missing ones are asked a typo of one person is that person
### src/lib/ai/intent-payroll-quote-oct24.test.ts
- INTENT_PAYROLL_MANAGER_ONLY_ENABLED off, reads the assistant's $25 as before (the saved state on 24 Oct)
### src/lib/ai/late-open-date-oct24.test.ts
- LATE_OPEN_DATE_ENABLED defaults off and is a chat-quality flag
- F5: late to open 10-19, verbal, no payroll with the flag off, the intent read says Attendance and no date, and the card names no policy
### src/lib/ai/list-policy-ask.test.ts
- listPolicyIsEdit off: false
- with only a card open listPolicyOnCard: a card and no draft; off, a draft open, or no card: false
### src/lib/ai/live-replay.eval.test.ts
- replay names resolve against the roster, and a document is not an employee Katlin Smith is rewritten to the one close directory name
- replay state, dedupe, reviews, and the two-sentence plan the action plan is two sentences when payroll is yes, and the existing builder still writes the payroll sentence
### src/lib/ai/manager-name-guard.test.ts
- "step by step take an employee off the system" — the manager named nobody off (production today): the manager's own first name is the employee
- the prompt off: the line is as before
### src/lib/ai/name-slot-store.test.ts
- name, date slot, and store from the manager's words keeps Jane Store when Store is the surname
- s8, s17, and a Name: line keeps Jane Store and Jane Salon, and still rejects a candidate that is the label
### src/lib/ai/not-a-name-oct24.test.ts
- NOT_A_NAME_GUARD_ENABLED defaults off
### src/lib/ai/out-of-date-is-the-proposal.test.ts
- OUT_OF_DATE_IS_THE_PROPOSAL_ENABLED off: never fires
### src/lib/ai/own-brand-only.test.ts
- OWN_BRAND_ONLY_ENABLED off: the reply is as built (the live sentence, byte for byte)
### src/lib/ai/own-brand-parent.test.ts
- OWN_BRAND_PARENT_ENABLED off (OWN_BRAND_ONLY on): the live reply keeps the operating company (the reported reply)
- OWN_BRAND_PARENT_ENABLED on without OWN_BRAND_ONLY: nothing changes
### src/lib/ai/past-forms-before-library.test.ts
- the past-forms lookup before the forms-library check off: a library question that names a person is answered from the library
### src/lib/ai/person-memory-runtime.test.ts
- what the manager told Bubbles before reaches the model as its own block, with the rules for using it
### src/lib/ai/polite-about-request.test.ts
- POLITE_ABOUT_STAYS_CARD off: the turn and the reading are as before (the report)
### src/lib/ai/priority-replay.test.ts
- priority replay b9–b12, flags on, word for word b12 verbal CA for Sadie Hoffart, animals, Empire SD
### src/lib/ai/prompt-cache-replay.test.ts
- prompt cache replay creates a cache on the first call, reads it later, and is faster than the uncached prompt
### src/lib/ai/prompts.test.ts
- Sunny chat and forms rules stay behind the existing flags adds the consequence rules, the missing forms sentences, and the two-sentence plan only when those flags are on
- the cacheable instruction omits the listener keeps every sentence and moves the name, the date, and the location after the marker
- PROMPT_CACHE_ENABLED off is byte-identical to the base prompt and does not emit the marker
### src/lib/ai/qa-w4-date-and-prior-coaching.test.ts
- F-03a: several incident dates are a question, never the first one typed "today" leaves the form dated the day it is created, and is not asked again
- F-03a: several incident dates are a question, never the first one typed an answer that chooses nothing is not taken as a date, and the question is not repeated
- F-03c: on a Coaching Form, the coaching the manager held is the form's date a labelled earlier coaching is never the Coaching Form's date
### src/lib/ai/reformat-framework-oct25.test.ts
- conv_mufp73ez8pl7992: removing markers leaves no dangling words is wired to the flag in answerQuestion
### src/lib/ai/remap-incident-oct24.test.ts
- remap path: What happened is the incident, not the request (prod, 24 Oct 2026) conv_mvmzjg7827rv598: cleaning duties keep their words and cite Care and Cleaning p.21
- step 3 and C-list: edits never become What happened (prod, 24 Oct 2026) conv_mvmzmjxc2mkyriw: a new request with a new incident resets What happened and the policy
### src/lib/ai/remap-prior-actions-oct25.test.ts
- 1. a prior list keeps every step the manager named lists 9/8, 9/15 and 9/25 on the card, and dates none of them on the form
- a bare "verbal" turn is never a prior action, and the line holds only the manager's words off, the line reads as before
### src/lib/ai/reply-matches-card-cleaning.test.ts
- withCleaningOtherPolicy off: the live reply stands (the failure)
### src/lib/ai/reply-matches-card-two-forms.test.ts
- REPLY_MATCHES_CARD_EACH_CARD_ENABLED off: as main (the bug) the Corrective Action section is rewritten to the first card's person
### src/lib/ai/reply-matches-card.test.ts
- only a reply with a card, and only with the flag off: the reply as built; on: checked
### src/lib/ai/report-name-not-a-person.test.ts
- "Show me the most recent Store Scorecard and what I need to focus on today.", the reader returning the report as the employee off (production today): the report is saved as the employee
- "Show me the most recent Store Scorecard and what I need to focus on today.", the reader returning the report as the employee REPORT_NAME_NOT_A_PERSON: a person is still the employee (invented)
### src/lib/ai/report-turns.test.ts
- "Show me the most recent Store Scorecard and what I need to focus on today." → "create a coaching form" off (production today): the form sees the report question
### src/lib/ai/resend-same-chat-oct25.test.ts
- DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED off: as production today the lookup spans the account and reopens the other chat's draft (as typed)
- DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED off: as production today the lookup spans the account and reopens the other chat's draft (lowercase, no punctuation)
- DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED off: as production today the lookup spans the account and reopens the other chat's draft (uppercase)
- DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED off: as production today the lookup spans the account and reopens the other chat's draft (terse and impatient)
### src/lib/ai/round1-scoreboard.test.ts
- round 1 scoreboard, one run flags off and flags on agree
### src/lib/ai/self-check.test.ts
- SELF_CHECK_ENABLED a heading in the chunk text counts when the section field is empty
### src/lib/ai/source-note.test.ts
- SOURCE_NOTE_GUARD_ENABLED: bare markers on every path (QA's live Sunny tester, 6 Nov 2026) off: the reply keeps the markers (the live leak)
- FINAL_REPLY_MARKER_GUARD_ENABLED withoutSourceMarkers, guard on: off leaves the first of two adjacent tags; on takes the run, a dash no bar
- FINAL_REPLY_MARKER_GUARD_ENABLED finalReplyWithoutMarkers: on, with or without SOURCE_NOTE_GUARD; a page tag and other brackets stay; off, as it is
### src/lib/ai/spend-guard-store.test.ts
- modelUsageSince reads the model columns and slots.reader, and counts a reader call with no answering call
### src/lib/ai/spend-meter.test.ts
- off the client is the client itself, the work runs as it was, and nothing is written
### src/lib/ai/store-woven-form-flow.test.ts
- the expected outcome: a form from a code and a name a first name alone is confirmed against Woven, not guessed
- 1–6. every way of naming the store reaches the same record 5/6. a typo or an abbreviation is asked about, never used silently
- 7. the job title is Woven's replaces the title the manager's wording implied
- 10. Woven has no matching employee keeps the typed name, says it is unverified, and fills no title
- 8. conversational follow-ups 'yes' to 'is that the store?' uses the store that was proposed
- 5. every HR form type reads the store and verifies the employee the same way sdit-epp: store resolved, Woven title and verification
- 5. every HR form type reads the store and verifies the employee the same way tsd-epp: store resolved, Woven title and verification
- 5. every HR form type reads the store and verifies the employee the same way demotion: store resolved, Woven title and verification
- 5. every HR form type reads the store and verifies the employee the same way the title Woven holds replaces the one the manager gave as the employee's current title
- a Woven job title is never mistaken for another employee Create a corrective action form for Sarah Miller (Team Member Part Time) at Store 236
- names, stores and titles are read in any case — lower, UPPER or Mixed sdit-epp — lower case
- names, stores and titles are read in any case — lower, UPPER or Mixed sdit-epp — UPPER case
- names, stores and titles are read in any case — lower, UPPER or Mixed tsd-epp — lower case
- names, stores and titles are read in any case — lower, UPPER or Mixed tsd-epp — UPPER case
- names, stores and titles are read in any case — lower, UPPER or Mixed a title typed in lower case is still a title, and Woven's still wins
### src/lib/ai/sunny-fixes-runtime.test.ts
- default passwords stay in the document are withheld from the grounding AND the source card for a question about one's own password
- default passwords stay in the document and the model is told not to repeat one either way
### src/lib/ai/take-off-stays-card.test.ts
- takeOffStaysCard off: false
### src/lib/ai/title-of-the-employee-exit.test.ts
- EXIT_STATED_ONLY_ENABLED: an exit card's Job Title is never the title the manager wrote as someone's off: "your General Manager" stays the card's Job Title (the bug)
### src/lib/ai/title-rule-oct24.test.ts
- flag off: every reader as main has it a pasted policy still reads District Manager
### src/lib/ai/unknown-name-ask-who-for.test.ts
- UNKNOWN_NAME_ASK_WHO_FOR off: the live repeat says "I still need" beside no "Who is this … for?" (the audit's finding)
- UNKNOWN_NAME_ASK_WHO_FOR on without UNKNOWN_NAME_ASK: the reply is unchanged
### src/lib/ai/warning-level-invented-oct24.test.ts
- a bare "Yes"/"No" answers the payroll question just asked (ported from Ask Sunny) flag off keeps main's reading: the bare answer is not stored
### src/lib/forms/account-verb-not-a-name.test.ts
- ACCOUNT_VERB_NOT_A_NAME_ENABLED off: the reader keeps the verb (the reported card)
### src/lib/forms/as-you-said-app-read.test.ts
- AS_YOU_SAID_APP_READ_ENABLED off, with AS_YOU_SAID on: the app-read policy has no Policy line (the gate's regression)
### src/lib/forms/as-you-said-manager-words.test.ts
- AS_YOU_SAID_MANAGER_WORDS_ENABLED off: the app's "Policy reference" line reads as the manager naming the Standards of Conduct
### src/lib/forms/ca-action-plan.test.ts
- the Action Plan, in the District Manager's two sentences states the manager's amount between the two when payroll deduct is Yes
- the Action Plan, in the District Manager's two sentences says a deduction applies, with no figure, when Yes came without an amount
- rebuilding the plan after a change in chat adds the deduction on Yes, keeping the amount it already stated
- rebuilding the plan after a change in chat on a Yes with no amount stated, states the one amount the quoted section gives, and follows the section
### src/lib/forms/ca-policy.test.ts
- the four conduct cases suggests nothing for Her upgrade rate is below goal again.
- a policy the manager named wins a different policy named stops the suggestion, and the later turn wins
- the box a named policy ticks ["She missed the Woven deadline.","under performance"] -> ["under_performance"]
- the box a named policy ticks the proposal says the named policy back
### src/lib/forms/ca-sales-policy.test.ts
- CA_SALES_POLICY_ENABLED on negative control: cleaning is untouched and does not suggest the Standards of Conduct
- CA_PERFORMANCE_REASON_ENABLED: "for performance" in the request is the sales reading (QA, coding-3 item 5, 5 Nov 2026) off: the exact wording reads as before — no sales reading, "what happened" is ask
### src/lib/forms/chat-correction.single-writer.test.ts
- found in review: PR #48's payroll correction never touches the reason saves only the payroll answer on a Corrective Action Form that has a reason paragraph
- the Corrective Action Form's payroll-deduct answer saves a stated change as the manager's own edit, in the form's words
### src/lib/forms/chat-correction.test.ts
- found in review: PR #48's payroll correction never touches the reason saves only the payroll answer on a Corrective Action Form that has a reason paragraph
- the Corrective Action Form's payroll-deduct answer saves a stated change as the manager's own edit, in the form's words
### src/lib/forms/chat-form-records.test.ts
- loadFormRecords leaves exit forms out for a role that may not create them
### src/lib/forms/cleaning-other-every-wording.test.ts
- CLEANING_OTHER_EVERY_WORDING_ENABLED off: "not completing … cleaning" is not read, and the card names no policy
- CLEANING_OTHER_EVERY_WORDING_ENABLED on, CA_SALES off: unchanged (the draft's Other rule is CA_SALES's)
### src/lib/forms/coaching-feedback.test.ts
- matching a typed employee name asks about a slight misspelling — never autocorrects
- matching a typed employee name asks to confirm a lone first name rather than completing it silently
- the roster is the actor's own scope, and nothing wider a salon-scoped manager sees only people at their salons
### src/lib/forms/compound-surname.test.ts
- ROSTER_COMPOUND_SURNAME_ENABLED off: as before (the bug) a typo in either word of a two-word surname is never close
- ROSTER_COMPOUND_SURNAME_ENABLED on: the surname compared word by word a typo in surname word 1 or word 2 (transposed letters), or one word alone with a typo, is close to her
- ROSTER_COMPOUND_SURNAME_ENABLED on: the surname compared word by word the exact compound name is exact, and one surname word typed exactly is asked, never filled
- ROSTER_COMPOUND_SURNAME_ENABLED on: the surname compared word by word QA's R3 shape: word 2 with letters 4–6 rotated (Damerau 2) and word 1 exact is close to her, asked, never filled
- ROSTER_COMPOUND_SURNAME_ENABLED on: the surname compared word by word a single-word surname is unchanged (the flag reads only compound surnames)
- ROSTER_COMPOUND_SURNAME_ENABLED: compound first names, and an initial of any surname word (QA's roster shapes, 6 Nov 2026) off (the bug): "Rosa Lind T" and "Severin F" match no one, so the card emptie
- ROSTER_COMPOUND_SURNAME_ENABLED: compound first names, and an initial of any surname word (QA's roster shapes, 6 Nov 2026) on: a two-word first name and an initial is asked; typed in full it is exact;
- ROSTER_COMPOUND_SURNAME_ENABLED: compound first names, and an initial of any surname word (QA's roster shapes, 6 Nov 2026) on: an initial of the second surname word is asked, never filled
### src/lib/forms/conduct-incident-cites-page.test.ts
- not completing Woven courses reads as no conduct topic with the flag off (as before), unfinished work with it on
- the card's one policy drops its own Standards of Conduct line with the flag off (as before), keeps it with the flag on
### src/lib/forms/corrected-date-kept.test.ts
- CORRECTED_DATE_KEPT: correctedIncidentDate off: the prior step's correction is taken as the incident's (the report)
### src/lib/forms/corrective-action-intake.test.ts
- 3b. a repeated incident and a prior corrective action are different facts does not let repetition turn a metric complaint into conduct
- 4. a metric on its own is not grounds for a corrective action metric only — Their Club Close is low.
- 4. a metric on its own is not grounds for a corrective action metric only — Sarah's conversion is the lowest in the district.
- 4. a metric on its own is not grounds for a corrective action metric only — Her upgrade rate is down again this month.
- 4. a metric on its own is not grounds for a corrective action metric only — His numbers are behind everyone else's.
- 4. a metric on its own is not grounds for a corrective action metric only — She is not hitting her EFTs.
- 5. what Ask Bubbles actually says opens with the form's own name, taken from the library
- 5. what Ask Bubbles actually says asks the seven questions in the business's own words
- 5. what Ask Bubbles actually says names the date it would use, and says nothing specific without one
### src/lib/forms/denial-no-account.test.ts
- onlyDeniesAFault off: false (as before)
### src/lib/forms/described-attendance-not-denied.test.ts
- describedAttendanceKeys and a denied fault off: read as before (the denied "late" counts)
### src/lib/forms/drafted-text-placeholder-words.test.ts
- placeholder words off: today's guard — the words stay
### src/lib/forms/edit-policy-ask-schema.test.ts
- readFormPatch with EDIT_POLICY_ASK_ENABLED off: the approved prompt alone, and no policyAsked on the reading
- readFormPatch with EDIT_POLICY_ASK_ENABLED the flag alone, without Step B, is off
### src/lib/forms/employee-match.test.ts
- kept names stay on the server a name the manager kept is not asked about again, and an unset store still asks
### src/lib/forms/employee-roster-store-scoped.test.ts
- ROSTER_STORE_SCOPED_ENABLED off is today's roster: the whole directory, scoped in memory, the store login and unknown statuses included
### src/lib/forms/employee-verification.test.ts
- a job title comes from Woven or from nowhere uses Woven's title over the manager's wording, and says so
### src/lib/forms/employment-change.test.ts
- found in production QA: the employee's name keeps 'Transfer' when it is part of the employee's name
- found in review: a marked name never overrides the form's subject still reads the production messages whole
### src/lib/forms/exit-facts.test.ts
- the values the draft carries only what was established, keyed like the stored version
- HR feedback 30 Sep: the Harper exit form still leaves the notice-fulfilled date to the manager
### src/lib/forms/exit-library.test.ts
- where it is offered, and to whom is granted to exactly the roles that file a Corrective Action Form
### src/lib/forms/exit-termination-paste.test.ts
- EXIT_STATED_ONLY_ENABLED off: as before (the bug) the termination letter fills How Employee Resigned, Key Returned and Last Day Worked
### src/lib/forms/exit-terms-not-names.test.ts
- the exit form's shortcut words name nobody off: drop wage and forfeit bonus are read as people (the live question)
### src/lib/forms/form-date-answer.test.ts
- extractFormDate leaves words and relative days to the form's default of today
- "today" is never parsed into a calendar date, with or without the apostrophe we can use today's date
- "today" is never parsed into a calendar date, with or without the apostrophe use today
- "today" is never parsed into a calendar date, with or without the apostrophe today’s date
- a date that belongs to an earlier step is not the form's date skips the date of a prior warning (the production sentence)
- a labelled earlier step is history, wherever its date sits a later turn that restates the manual date replaces the earlier one
### src/lib/forms/form-date-incident-only.test.ts
- FORM_DATE_INCIDENT_ONLY_ENABLED: the form's date is never a deadline, assignment or prior-action date off, main's reading is unchanged (the reported failures)
- FORM_DATE_INCIDENT_ONLY_ENABLED: the form's date is never a deadline, assignment or prior-action date "today" with prior actions in parentheses asks no "which date?" and takes today
- NEVER-BREAK: a stated incident date is the form's date, flag on or off flag off
- NEVER-BREAK: a stated incident date is the form's date, flag on or off flag on
- FORM_DATE_INCIDENT_ONLY_ENABLED in the managers' register: all lowercase flag on: no deadline, assignment or prior-action date is the form's date
- FORM_DATE_INCIDENT_ONLY_ENABLED in the managers' register: sentence case flag on: no deadline, assignment or prior-action date is the form's date
- live tester findings, 26 Oct 2026 (all lowercase) off: the first late date stands alone, and the prior verbal dates the remap (the reported failures)
- live tester findings, 26 Oct 2026 (all lowercase) NEVER-BREAK (flag off): "i gave her a verbal on 10-21 for being late" dates the form 10-21
- live tester findings, 26 Oct 2026 (all lowercase) NEVER-BREAK (flag on): "i gave her a verbal on 10-21 for being late" dates the form 10-21
- live tester findings, 26 Oct 2026 (sentence case) off: the first late date stands alone, and the prior verbal dates the remap (the reported failures)
- live tester findings, 26 Oct 2026 (sentence case) NEVER-BREAK (flag off): "i gave her a verbal on 10-21 for being late" dates the form 10-21
- live tester findings, 26 Oct 2026 (sentence case) NEVER-BREAK (flag on): "i gave her a verbal on 10-21 for being late" dates the form 10-21
### src/lib/forms/form-name-from-roster.test.ts
- the grounding step, Pau's exact message on, with the person guard's roster: "under" is not said back as a person
- a lowercase word that is nobody on the roster off (main): "under" is a name the reader takes
### src/lib/forms/form-patch-account-line.test.ts
- the account line is added after the approved text and the reader lines, with the flag on
- the account line is never sent with the flag off, or without the reader fixes
### src/lib/forms/form-patch-flags-off.test.ts
- with both flags unset a chat turn on an open draft, and the draft route's POST, load none of Step B's modules, and no formDiff is returned
### src/lib/forms/form-patch-model.test.ts
- readFormPatch returns the turn and the patch from a valid output
### src/lib/forms/form-records-no-judgement.test.ts
- the Forms Register block carries the rule only with the flag on
### src/lib/forms/form-reducer-said-replacement.test.ts
- FORM_EDIT_SAID_REPLACEMENT_ENABLED off (main, single writer on): "Lane" → "Laine" is refused (the bug)
- FORM_EDIT_SAID_REPLACEMENT_ENABLED an old offense box is written as the box that replaced it off (single writer on): refused as unknown_option (the bug)
### src/lib/forms/future-prior-row.test.ts
- FUTURE_PRIOR_ROW_DROP_ENABLED off: as main both rows stay
### src/lib/forms/incident-dates.test.ts
- incident dates are told apart from earlier steps and the future is empty when no date was typed ('today' is the creation date)
- reading the answer "today"
### src/lib/forms/issue-after-request-reason.test.ts
- ISSUE_AFTER_REQUEST_REASON_ENABLED off (as before): the request's reason is the Issue
### src/lib/forms/issue-is-the-account.test.ts
- ISSUE_IS_THE_ACCOUNT_ENABLED off (main): the level word, or the typed nickname, is the Issue (the bug)
### src/lib/forms/level-ends-request.test.ts
- LEVEL_ENDS_REQUEST_ENABLED off: the live wording is a question with no level (the reported failure)
### src/lib/forms/metric-guard.test.ts
- METRIC_GUARD_ENABLED off: as before (the bug) the live reply keeps **Club Close** and **Under** as people
- METRIC_CHOICE_ONE_QUESTION_ENABLED: the choice question's own tail goes with it off: as before, the tail stays after the who-question
### src/lib/forms/missed-shift-not-lateness.test.ts
- MISSED_SHIFT_NOT_LATENESS off: a missed shift keeps the lateness plan (the report)
### src/lib/forms/msb-phrase-soc.test.ts
- MSB_PHRASE_SOC_ENABLED off: the spelled-out phrase reads as no policy (the reported failure)
### src/lib/forms/no-notice-no-date.test.ts
- NO_NOTICE_NO_DATE_ENABLED off (main): the resignation date is also the notice date (the bug)
### src/lib/forms/not-a-name.test.ts
- NOT_A_NAME_GUARD_ENABLED off changes nothing
### src/lib/forms/off-roster-confirm.test.ts
- OFF_ROSTER_CONFIRM_ENABLED off: as before no turn is rewritten and no name is taken
### src/lib/forms/official-policy-manual.test.ts
- 4. the offense box decides which section cites Late Opening, then Attendance, for a tardy opener: Pat was scheduled to open the store at 9:30 and did not arrive until 11:23
- 4. the offense box decides which section cites Late Opening, then Attendance, for a tardy opener: she was the opener today and came in late
- 4. the offense box decides which section cites Late Opening, then Attendance, for a tardy opener: late opening on 10/16
- 4. the offense box decides which section cites Late Opening, then Attendance, for a tardy opener: she didn't open the Makery until 10
- 4. the offense box decides which section cites Late Opening, then Attendance, for a tardy opener: opened the location 40 minutes late
### src/lib/forms/one-form-each.test.ts
- withCardNamingEmployee (CARD_NAMES_EMPLOYEE_ENABLED) off as before; on, named
### src/lib/forms/payroll-amount-referent.test.ts
- PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED: "$20. which will be payroll deducted" off: the amount is not read and the amount is asked (the live behaviour)
- PAYROLL_AMOUNT_SAME_MESSAGE_ENABLED: the clause after the stray full stop is not a question off: it is set aside as a question (the live "You also asked")
### src/lib/forms/payroll-deduct-amount.test.ts
- the amount is never in the action plan and is never the policy's $25 leaves a stated $3.25 and a quoted $25.00 off the plan while the flag is on
### src/lib/forms/place-from-cue.test.ts
- PLACE_FROM_CUE_ENABLED: "a CA for <name> from <store>" names the store off: Bellevue is not read, so the card takes West Dodge
### src/lib/forms/possessive-place.test.ts
- POSSESSIVE_PLACE_ACCOUNT_ENABLED: the ask-who card's What happened (QA, the Bubbles round-7 live test, 9 Nov 2026) off: What happened stays the place name (the bug)
### src/lib/forms/prior-actions-no-signed-parsers.test.ts
- form-reducer: de-duplication across formats off: as before — only " — signed " carries a date
- ca-chat-dates: "9/3, not 9/2" corrects a line in either format off: a line without "signed" is left as it was (as before)
### src/lib/forms/prior-actions-policy.test.ts
- the policy on each Corrective Action history line on: Pau's example, word for word; the Coaching line is unchanged
- the policy on each Corrective Action history line off: as before
- what goes in the brackets the policy's first line, without brackets of its own
- what goes in the brackets nothing, a blank or a sentence too long to be a policy name: no brackets
### src/lib/forms/prior-actions.test.ts
- the list holds several entries, each with its date keeps every entry the draft wrote from the manager's words
- the list holds several entries, each with its date adds a step the manager dated that the draft left out
- the list holds several entries, each with its date lists the manager's dated steps when the draft wrote nothing
- the list holds several entries, each with its date lets a dated step win over a None the draft also wrote
- the two revision-4 lines, read as one entry combines what was recorded with the date
- the two revision-4 lines, read as one entry keeps either half alone
- the two revision-4 lines, read as one entry writes dates the way the business writes them
- the history reads oldest first, as the manager described it puts the steps in date order whatever order the draft wrote them
- the history reads oldest first, as the manager described it files a step the draft left out in its place in the history, not at the end
- the history reads oldest first, as the manager described it keeps the date the manager gave, and the draft's own description of the step
- the history reads oldest first, as the manager described it carries what the manager said a step was for when code adds the line
- the history reads oldest first, as the manager described it adds no description the manager did not give
- the history reads oldest first, as the manager described it puts lines with no date after the dated history, in the order written
- no invented history replaces an upgraded step with the one the manager named for that day
- no invented history removes an undated step the manager never mentioned
- an earlier step is never dated in the future reads a December step, mentioned in January, as last year's
- an earlier step is never dated in the future keeps the model's correctly-dated line for that step
- an earlier step is never dated in the future keeps a year the manager typed, as typed
- a labelled earlier step is listed with what it was about create verbal CA for remy calder for violating visitors at work policy on 10-10-26. previous coaching was jba policy manual 1-1-26
- a labelled earlier step is listed with what it was about create ca form for tess varga for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching
- a labelled earlier step is listed with what it was about register shortage on 10-20-26. previous coaching - jba policy manual 1-20-26.
- a labelled earlier step is listed with what it was about late again on 10/20. prior CA 9/1
- a labelled history list is listed item by item the production request lists both steps
- a labelled history list is listed item by item previous coaching: verbal ca 9-1-26
- a labelled history list is listed item by item prior actions: written warning 8/2/26
- a labelled history list is listed item by item previous coaching: policy acknowledgement 1-1-26
- a labelled history list is listed item by item previous CA: written ca 8/2/26
- a labelled history list is listed item by item previous coaching: written warning tardiness 8/2/26
- a labelled history list is listed item by item lists every item oldest first, whatever order they were written in
- a labelled history list is listed item by item keeps the draft's verbal warning on the day the manager said a verbal CA was given
- a history list without a colon lists an item that names its own step
- a history list without a colon does not take an incident date after it as history
- the forms already on file are listed too keeps the manager's own words for a step they dated, and adds the rest
### src/lib/forms/prior-forms-am-warnings.test.ts
- an Assistant Manager drafting a Corrective Action for an employee the General Manager already warned off (production today): only their own forms count, so the Verbal CA is not on the history
### src/lib/forms/prior-forms-lines.test.ts
- the forms on file that count as history lists finalized Coaching and Corrective Action forms, oldest first, with the CA's level
- the forms on file that count as history names an unticked Corrective Action plainly
### src/lib/forms/prior-step-date-list.test.ts
- PRIOR_STEP_DATE_LIST_ENABLED off: only the first date's Coaching is listed (the reported reply)
### src/lib/forms/prior-step-previously.test.ts
- PRIOR_STEP_PREVIOUSLY_ENABLED off (production): the dated coaching is not read (the finding)
### src/lib/forms/prior-step-sentence.test.ts
- PRIOR_STEP_SENTENCE_ENABLED on lowercase: "issued a verbal ca on 10.1" is a row dated 10/01 of this year
- PRIOR_STEP_SENTENCE_ENABLED on Sentence case: "issued a verbal ca on 10.1" is a row dated 10/01 of this year
- PRIOR_STEP_SENTENCE_ENABLED off: as main no row
### src/lib/forms/proposal-name-correction.test.ts
- PROPOSAL_NAME_CORRECTION_ENABLED off (as before): the request is unchanged
### src/lib/forms/proposal.test.ts
- 11f. the intake answered on one line, as a comma-separated list still reads a person whose name only looks like a prefix
- 16. a proposal carries no HR field values at all has no topic, details, role, follow-up date or checked options
### src/lib/forms/qa-w4-date-readers.test.ts
- decideFormDate asks once among several incident dates, and dates the form the day it is created meanwhile
- decideFormDate takes the answer
### src/lib/forms/relative-date.test.ts
- dates as managers say them a bare weekday names no week, so it resolves to nothing
### src/lib/forms/remove-policy-not-named.test.ts
- REMOVE_POLICY_NOT_NAMED_ENABLED off: "take the attendance policy off the form" names Attendance (the finding)
### src/lib/forms/reopen-no-show-oct25.test.ts
- REOPEN_VERB_GUARD_ENABLED off: as production today B22-1 reads 'show' as the verb and opens the other chat's draft
- REOPEN_VERB_GUARD_ENABLED off: as production today cross-chat reads 'show' as the verb and opens the other chat's draft
### src/lib/forms/reopen-request.test.ts
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: bring up Odalys Fairbank's corrective action is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: bring up an old coaching form for Marisol is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: bring up a previously edited corrective action for Odalys Fairbank is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: bring up a previous corrective action form that i made for Odalys Fairbank earlier today is not read as a for
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: pull up Odalys Fairbank's CA is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: open Odalys Fairbank's corrective action is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: open the CA for Odalys Fairbank is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: open her CA is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it off: open my CA for Odalys Fairbank is not read as a form on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it on: can you find the coaching form for Marisol Quintero → shows the coaching on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it on: find my earlier CA for Odalys Fairbank → shows the dpoa on file
- REOPEN_BY_ANY_OPEN_VERB_ENABLED: a form on file asked for with any verb that opens it on: "Change <name> CA" names the Corrective Action Form (sf-s26); off, it names none
### src/lib/forms/request-from-names-employee.test.ts
- "<form> from <name>" names nobody with the flag off (as before), the employee with it on
### src/lib/forms/request-line-account.test.ts
- REQUEST_LINE_ACCOUNT_ENABLED: D2's fallback keeps the dates lowercase
- REQUEST_LINE_ACCOUNT_ENABLED: D2's fallback keeps the dates Sentence case
- REQUEST_LINE_ACCOUNT_ENABLED: D2's fallback keeps the dates off, as main: only the coaching sentence
### src/lib/forms/request-slot.test.ts
- the name readers, with the turn's message off (main): Pau's message reads the metrics as people
- a corrective action for another form's name off (main): the named form wins, and "Club Close" is a candidate
### src/lib/forms/roster-name-in-candidate.test.ts
- ROSTER_NAME_IN_CANDIDATE_ENABLED: a candidate ending in a roster person's name could be them off: "When Odessa" is shaped like nobody (as before)
### src/lib/forms/roster-only-names.test.ts
- the card's employee a first name that is one roster person's is asked about, never put on the card
### src/lib/forms/rule-conflicts.test.ts
- the action plan stays two sentences when payroll deduct is yes the flag on does not fill $25 from the Late Opening section
### src/lib/forms/s34-edit-make-it-about.test.ts
- EDIT_MAKE_IT_ABOUT_ENABLED off: the live wording is scoped to the date alone (the reported failure)
### src/lib/forms/s35-ca-not-prior-coaching.test.ts
- CA_REQUEST_NOT_PRIOR_COACHING_ENABLED off: the earlier coaching is read as the form asked for (the live card)
### src/lib/forms/s35-draw-me-up-ca.test.ts
- "Can you draw me up a CA for <name> …" (CA_REQUEST_NOT_PRIOR_COACHING_ENABLED) off: read as before (a question; no Corrective Action asked for)
### src/lib/forms/s35-no-recursion.test.ts
- CA_REQUEST_NOT_PRIOR_COACHING_ENABLED: no exponential re-reading a 45-naming intake is read in well under a second with the flag on, as with it off
### src/lib/forms/s37-coaching-observed.test.ts
- COACHING_OBSERVED_KEPT_ENABLED off: the Observed section and the Underperformance tick are struck (the live forms)
- POLITE_REQUEST_OWN_TURNS_ENABLED off: "Can you create me …" is not a request, so every turn is the second card's
### src/lib/forms/sales-observation-account.test.ts
- SALES_OBSERVATION_ACCOUNT_ENABLED off: the sentence as it is (the gate's finding)
- SALES_OBSERVATION_ACCOUNT_ENABLED: the card's Issue (correctiveActionIssue) SALES_SHORTFALL_OBJECT alone: the request's words are the Issue (the finding, reproduced)
### src/lib/forms/sales-shortfall-object.test.ts
- SALES_SHORTFALL_OBJECT_ENABLED off (main): the exact wording names no shortfall, so the CA reads no policy (the bug)
- SALES_SHORTFALL_OBJECT_ENABLED off (main): written CA for Odalys Fenmarrow on performance reads no policy (the bug)
- SALES_SHORTFALL_OBJECT_ENABLED off (main): CA for Odalys Fenmarrow for performance for october reads no policy (the bug)
### src/lib/forms/sales-triple-keeps-words.test.ts
- SALES_OBSERVATION_ACCOUNT keeps the manager's words ACCOUNT_PLACE_LEAD_ENABLED (QA's Bubbles round-5 final gate, 8 Nov 2026) off: the request's place opens what is left (the gate's finding)
### src/lib/forms/set-aside-plan.test.ts
- POLICY_SET_ASIDE_PLAN off: the plan still reviews the policy taken off (the report)
### src/lib/forms/signed-step-not-a-request.test.ts
- SIGNED_STEP_NOT_A_REQUEST_ENABLED off: the signed coaching reads as a second request (the reported two cards)
### src/lib/forms/staff-picker-directory.test.ts
- the whole-staff list, real directory read a store account: its own store's current staff, under Woven's position
### src/lib/forms/stale-needs-roster-person.test.ts
- the creation check with the manager's roster off, or with no roster, it is refused as before
### src/lib/forms/step-dates-not-form-date.test.ts
- STEP_DATES_NOT_FORM_DATE_ENABLED off (STEP_DATE_NOT_INCIDENT on): nothing is decided, so the card keeps the first date read (the reported 9/15)
- STEP_DATES_NOT_FORM_DATE_ENABLED on: the form is not dated by a step
- STEP_DATES_NOT_FORM_DATE_ENABLED on, with STEP_DATE_NOT_INCIDENT off: no step is set aside, so as before (the two-date question)
### src/lib/forms/street-address-not-a-name.test.ts
- a street address is not a person off: a part of the address is read as a person
### src/lib/forms/warning-level.test.ts
- a level stated for THIS form need a CA for jordan testperson. she mishandled cash at close yesterday. written warning -> written
- statedWarningLevel — the level the manager SAID, never inferred (PR #8) final written for jordan testperson → written
- statedWarningLevel — the level the manager SAID, never inferred (PR #8) this is her first written warning → written
### src/lib/ingestion/extract/pdf-ocr.test.ts
- extractPdf with a scanned PDF off: no_text, as before, and no request
### src/lib/store/chat-history-sync.dom.test.tsx
- hydration uploads nothing saves nothing when a browser full of history loads
- hydration uploads nothing offers the real conversation for import and never the seeded one
- importing is explicit and one-way sends the eligible conversations only when asked
- importing is explicit and one-way leaves the local copy exactly where it was
- importing is explicit and one-way lets an imported conversation sync normally afterwards
- importing is explicit and one-way stops offering the import once it has run
- the same account sees the same history merges a conversation created on another browser into this one
- a server failure never destroys local history keeps every local conversation when the account cannot be read
- a browser whose clock was wrong cannot defeat Clear History removes it from history, from IndexedDB, and from the import offer
- a browser whose clock was wrong cannot defeat Clear History does not re-sweep a post-clear conversation on the NEXT load
- a browser whose clock was wrong cannot defeat Clear History re-arms for a SECOND clear, because the boundary value changes
- a browser whose clock was wrong cannot defeat Clear History suppresses nothing when the account could not be reached
### src/lib/store/chat-history-tolerant.dom.test.tsx
- a freshly signed-in browser, the history state answering 503 on: the list failing too is still local chats only, as before
### src/test/qa/forms-migration-qa.test.ts
- 'coaching' coaching · 04 AI-fill chips map to the same fields, and the drafting writes them
- 'coaching' coaching · 06 an existing draft can be edited (through chat)
- 'coaching' coaching · 07 follow-up corrections persist
- 'coaching' coaching · 08 unrelated fields remain unchanged
- 'dpoa' dpoa · 08 unrelated fields remain unchanged
