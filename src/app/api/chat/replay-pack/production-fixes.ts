/**
 * Cases that were OPEN in production and hold now that QA's round-5 flip (8 Nov 2026) put these flags on in
 * production-flags.json. The case files still say `status: { open: … }` (what was broken, and why); this list
 * turns each of them into "fixed" in one place, so the case files, which other pull requests are still
 * editing, do not conflict with the flip. The day a case file is touched next, its status moves there and its
 * entry leaves this list. Each value says which flag fixed it.
 */
export const FIXED_IN_PRODUCTION: Readonly<Record<string, string>> = {
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov5-twin-sf-s26-change-ca-new-chat": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by NO_NOTICE_NO_DATE, QA round 5, 8 Nov 2026
  "nov6-no-notice-no-date-resigned": "NO_NOTICE_NO_DATE",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-bring-up-my-previous-ca": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-ca-made-earlier-today": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-coaching-first-name-possessive": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-coaching-made-earlier-today-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-find-my-earlier-ca": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-find-my-earlier-coaching": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-open-my-last-ca-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-open-my-last-coaching-first-name": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-pull-up-my-old-coaching-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-a-show-my-previous-ca-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-ca-none-on-file": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-first-name-possessive": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-made-earlier-today": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-old-coaching-first-name": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-possessive-ca": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-bring-up-previously-edited-ca": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-coaching-none-on-file": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-b-bring-up-opens-finalized-as-draft": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-b-find-displays-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-b-open-opens-finalized-as-draft": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-b-pull-up-opens-finalized-as-draft": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-b-show-displays-finalized": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-c-her-unresolved-asks-whose": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-c-her-unresolved-asks-whose-coaching": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-c-open-her-ca": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-d-edit-several-asks-which": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-first-name-two-on-roster-bring-up": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-qa-first-name-two-on-roster-edit": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-several-coachings-asks-which": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by REOPEN_BY_ANY_OPEN_VERB, QA round 5, 8 Nov 2026
  "nov6-reopen-several-on-file-asks-which": "REOPEN_BY_ANY_OPEN_VERB",
  // fixed in production by COACHING_CARD_POLICY, QA round 5, 8 Nov 2026
  "nov8-coaching-card-policy": "COACHING_CARD_POLICY",
  // fixed in production by FORM_DATE_SAID_SETTLES, QA round 5, 8 Nov 2026
  "nov8-form-date-said-settles": "FORM_DATE_SAID_SETTLES",
  // fixed in production by ISSUE_AFTER_REQUEST_REASON, QA round 5, 8 Nov 2026
  "nov8-issue-after-request-reason-for": "ISSUE_AFTER_REQUEST_REASON",
  // fixed in production by ISSUE_AFTER_REQUEST_REASON, QA round 5, 8 Nov 2026
  "nov8-issue-after-request-reason-made-for": "ISSUE_AFTER_REQUEST_REASON",
  // fixed in production by LIST_POLICY_IS_EDIT, QA round 5, 8 Nov 2026
  "nov8-list-policy-is-edit-alone": "LIST_POLICY_IS_EDIT",
  // fixed in production by LIST_POLICY_IS_EDIT, QA round 5, 8 Nov 2026 (the case turns DESCRIBED_ATTENDANCE_CARD off itself, see its run)
  "nov8-list-policy-on-card-ca": "LIST_POLICY_IS_EDIT",
  // fixed in production by LIST_POLICY_IS_EDIT, QA round 5, 8 Nov 2026
  "nov8-list-policy-on-card-coaching": "LIST_POLICY_IS_EDIT",
  // fixed in production by LIST_POLICY_IS_EDIT, QA round 5, 8 Nov 2026
  "nov8-list-policy-on-card-no-account": "LIST_POLICY_IS_EDIT",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, QA round 5, 8 Nov 2026
  "nov8-policy-remark-not-account": "PROPOSAL_POLICY_SET_ASIDE",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD, QA round 5, 8 Nov 2026
  "nov8-policy-set-aside-ca-card": "PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD, QA round 5, 8 Nov 2026
  "nov8-policy-set-aside-ca-create": "PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD, QA round 5, 8 Nov 2026
  "nov8-policy-set-aside-coaching-card": "PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, QA round 5, 8 Nov 2026
  "nov8-policy-set-aside-stays-off": "PROPOSAL_POLICY_SET_ASIDE",
  // fixed in production by PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD, QA round 5, 8 Nov 2026
  "nov8-policy-set-aside-unnamed": "PROPOSAL_POLICY_SET_ASIDE, TAKE_OFF_STAYS_CARD",
  // fixed in production by PROPOSAL_MAKE_IT_ABOUT, QA round 5, 8 Nov 2026
  "nov8-proposal-make-it-about-create": "PROPOSAL_MAKE_IT_ABOUT",
  // fixed in production by PRIOR_STEP_DATE_LIST, QA round 5, 8 Nov 2026
  "nov8-r5-prior-step-date-list": "PRIOR_STEP_DATE_LIST",
  // fixed in production by STEP_DATES_NOT_FORM_DATE, QA round 5, 8 Nov 2026
  "nov8-r5-step-dates-no-today": "STEP_DATES_NOT_FORM_DATE",
  // fixed in production by STEP_DATES_NOT_FORM_DATE, QA round 5, 8 Nov 2026
  "nov8-r5-step-dates-today-is-fine": "STEP_DATES_NOT_FORM_DATE",
  // fixed in production by SIGNED_STEP_NOT_A_REQUEST, QA round 5, 8 Nov 2026
  "nov8-s35-signed-coaching-is-history": "SIGNED_STEP_NOT_A_REQUEST",
  // fixed in production by ACCOUNT_VERB_NOT_A_NAME, QA round 5, 8 Nov 2026
  "nov8-s38-failing-first-name-in-chat": "ACCOUNT_VERB_NOT_A_NAME",
  // fixed in production by ACCOUNT_VERB_NOT_A_NAME, QA round 5, 8 Nov 2026
  "nov8-s38-failing-full-name": "ACCOUNT_VERB_NOT_A_NAME",
  // fixed in production by ACCOUNT_VERB_NOT_A_NAME, QA round 5, 8 Nov 2026
  "nov8-s38-missing-hyphenated": "ACCOUNT_VERB_NOT_A_NAME",
  // fixed in production by ACCOUNT_VERB_NOT_A_NAME, QA round 5, 8 Nov 2026
  "nov8-s38-missing-t1": "ACCOUNT_VERB_NOT_A_NAME",
  // fixed in production by ACCOUNT_VERB_NOT_A_NAME, OUT_OF_DATE_IS_THE_PROPOSAL, QA round 5, 8 Nov 2026
  "nov8-s38-what-does-out-of-date-mean": "ACCOUNT_VERB_NOT_A_NAME, OUT_OF_DATE_IS_THE_PROPOSAL",
  // fixed in production by CARD_COMPLAINT_NOT_ACCOUNT, CREATE_COMMAND_POINTS_TO_CARD, QA round 5, 8 Nov 2026
  "nov8-sf-s38-create-it": "CARD_COMPLAINT_NOT_ACCOUNT, CREATE_COMMAND_POINTS_TO_CARD",
  // fixed in production by CARD_COMPLAINT_NOT_ACCOUNT, CREATE_COMMAND_POINTS_TO_CARD, QA round 5, 8 Nov 2026
  "nov8-sf-s38-out-od-fate": "CARD_COMPLAINT_NOT_ACCOUNT, CREATE_COMMAND_POINTS_TO_CARD",
  // fixed in production by STEP_B_DATE_SAID, QA round 5, 8 Nov 2026
  "nov8-step-b-date-said": "STEP_B_DATE_SAID",
  // fixed in production by STEP_B_DATE_SAID, QA round 5, 8 Nov 2026
  "nov8-step-b-date-said-alone": "STEP_B_DATE_SAID",
  // fixed in production by STEP_B_DATE_SAID, QA round 5, 8 Nov 2026
  "nov8-step-b-date-said-policy-ask-no-patch": "STEP_B_DATE_SAID",
  // fixed in production by STEP_B_DATE_SAID, QA round 5, 8 Nov 2026
  "nov8-step-b-date-said-with-policy-ask": "STEP_B_DATE_SAID",
  // fixed in production by CONDUCT_INCIDENT_CITES_PAGE, QA round 5, 8 Nov 2026
  "nov8-woven-courses-cites-conduct": "CONDUCT_INCIDENT_CITES_PAGE",
  // Changed on purpose (9 Nov 2026): fixed in production by SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov5-coding3-twin-ca-for-performance-is-an-account": "SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov5-r2-dm-in-passing-account": "COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov5-r2-dm-in-passing-account-with-the-flip": "COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by REQUEST_KEPT_IN_WINDOW, PROPOSAL_NAME_CORRECTION, QA round 6
  "nov5-r6-policy-kept-across-turns": "REQUEST_KEPT_IN_WINDOW, PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov6-sales-shortfall-object-performance-h01": "SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov6-sales-shortfall-object-performance-h13": "SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov6-sales-shortfall-object-requirements": "SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov8-complaint-account-issue": "COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov8-complaint-account-level": "COMPLAINT_ACCOUNT, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by COPY_OPEN_FORM_FOR_PERSON, QA round 6
  "nov8-copy-open-form-for-person": "COPY_OPEN_FORM_FOR_PERSON",
  // Changed on purpose (9 Nov 2026): fixed in production by CORRECTED_DATE_KEPT, QA round 6
  "nov8-corrected-date-kept-prior-step-only": "CORRECTED_DATE_KEPT",
  // Changed on purpose (9 Nov 2026): fixed in production by CORRECTED_DATE_KEPT, QA round 6
  "nov8-corrected-date-kept-q6": "CORRECTED_DATE_KEPT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_OTHER_PERSON_NOT_SUBJECT, QA round 6
  "nov8-exit-other-person-not-offered": "EXIT_OTHER_PERSON_NOT_SUBJECT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_TERMINATION_STATED, EXIT_OTHER_PERSON_NOT_SUBJECT, QA round 6
  "nov8-exit-termination-stated-facts": "EXIT_TERMINATION_STATED, EXIT_OTHER_PERSON_NOT_SUBJECT",
  // Changed on purpose (9 Nov 2026): fixed in production by MISSED_SHIFT_NOT_LATENESS, QA round 6
  "nov8-missed-shift-plan-cites-attendance": "MISSED_SHIFT_NOT_LATENESS",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-near-miss-card-kept-make-that-change": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by REQUEST_PARTICIPLE_LEAD, QA round 6
  "nov8-observation-made-for-late-opening": "REQUEST_PARTICIPLE_LEAD",
  // Changed on purpose (9 Nov 2026): fixed in production by POLITE_ABOUT_STAYS_CARD, QA round 6
  "nov8-polite-about-stays-card": "POLITE_ABOUT_STAYS_CARD",
  // Changed on purpose (9 Nov 2026): fixed in production by POLITE_ABOUT_STAYS_CARD, QA round 6
  "nov8-polite-about-stays-card-negative-1": "POLITE_ABOUT_STAYS_CARD",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_NO_APOSTROPHE, QA round 6
  "nov8-possessive-no-apostrophe-ca": "POSSESSIVE_NO_APOSTROPHE",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_NO_APOSTROPHE, QA round 6
  "nov8-possessive-no-apostrophe-capital": "POSSESSIVE_NO_APOSTROPHE",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_NO_APOSTROPHE, QA round 6
  "nov8-possessive-no-apostrophe-lower-case": "POSSESSIVE_NO_APOSTROPHE",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-comma-it-is": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-fix-her-last-name": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-last-name-is": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-off-roster": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-r6-t5": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-r6-t7": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-spelled": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-supposed-to-be": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by PROPOSAL_NAME_CORRECTION, QA round 6
  "nov8-proposal-name-correction-typed-off-roster": "PROPOSAL_NAME_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by REQUEST_FROM_NAMES_EMPLOYEE, QA round 6
  "nov8-request-from-names-employee": "REQUEST_FROM_NAMES_EMPLOYEE",
  // Changed on purpose (9 Nov 2026): fixed in production by POLICY_SET_ASIDE_PLAN, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov8-set-aside-plan": "POLICY_SET_ASIDE_PLAN, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by STEP_B_DATE_WITH_ABOUT, STEP_B_MAKE_IT_ABOUT_ACCOUNT, QA round 6
  "nov8-step-b-date-with-about": "STEP_B_DATE_WITH_ABOUT, STEP_B_MAKE_IT_ABOUT_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by STEP_B_MAKE_IT_ABOUT_ACCOUNT, QA round 6
  "nov8-step-b-make-it-about-topic-only": "STEP_B_MAKE_IT_ABOUT_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by UNDATED_ACCOUNT_BRIEF, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON, QA round 6
  "nov8-undated-weekend-shifts-no-form-date": "UNDATED_ACCOUNT_BRIEF, SALES_SHORTFALL_OBJECT, SALES_OBSERVATION_ACCOUNT, CA_PERFORMANCE_REASON",
  // Changed on purpose (9 Nov 2026): fixed in production by UNKNOWN_NAME_ASK_WHO_FOR, QA round 6
  "nov8-unknown-name-who-for-chain": "UNKNOWN_NAME_ASK_WHO_FOR",
  // Changed on purpose (9 Nov 2026): fixed in production by POLICY_CORRECTION_NOT_ACCOUNT, QA round 6
  "nov8-policy-correction-not-account": "POLICY_CORRECTION_NOT_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by REQUEST_PARTICIPLE_LEAD, QA round 6
  "nov8-observation-made-for-under-performance": "REQUEST_PARTICIPLE_LEAD",
  // Changed on purpose (9 Nov 2026): fixed in production by REQUEST_PARTICIPLE_LEAD, QA round 6
  "nov8-observation-done-for-under-performance": "REQUEST_PARTICIPLE_LEAD",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov8-ca-shift-dates-name-and-dates": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov8-ca-shift-dates-not-showing-up": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov8-ca-shift-dates-request-again": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov9-ca-shift-answer-same-account": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov9-ca-shift-answer-other-account": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT, QA round 7
  "nov9-ca-shift-answer-own-account-next-turn": "SHIFT_ACCOUNT_IS_INCIDENT, FIRST_NAME_ANSWER_KEEPS_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_ANSWER_NOT_A_CORRECTION, QA round 7
  "nov8-exit-answer-not-a-correction": "EXIT_ANSWER_NOT_A_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by FIELD_LABEL_NOT_A_QUESTION, EXIT_ANSWER_NOT_A_CORRECTION, QA round 7
  "nov8-field-label-not-a-question": "FIELD_LABEL_NOT_A_QUESTION, EXIT_ANSWER_NOT_A_CORRECTION",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_LETTER_SIGNER_NOT_SUBJECT, QA round 7
  "nov9-exit-letter-signer-off-roster": "EXIT_LETTER_SIGNER_NOT_SUBJECT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_LETTER_SIGNER_NOT_SUBJECT, QA round 7
  "nov9-exit-letter-signer-on-roster": "EXIT_LETTER_SIGNER_NOT_SUBJECT",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_PLACE_NOT_PERSON, QA round 7
  "nov9-possessive-place-own-store": "POSSESSIVE_PLACE_NOT_PERSON",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_PLACE_NOT_PERSON, QA round 7
  "nov9-possessive-place-other-store": "POSSESSIVE_PLACE_NOT_PERSON",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_PLACE_NOT_PERSON, QA round 7
  "nov9-possessive-place-then-name": "POSSESSIVE_PLACE_NOT_PERSON",
  // Changed on purpose (9 Nov 2026): fixed in production by WORK_AREA_ABSENCE_CITES_CONDUCT, QA round 7
  "nov9-work-area-absence-ca": "WORK_AREA_ABSENCE_CITES_CONDUCT",
  // Changed on purpose (9 Nov 2026): fixed in production by WORK_AREA_ABSENCE_CITES_CONDUCT, QA round 7
  "nov9-work-area-absence-left-the-building": "WORK_AREA_ABSENCE_CITES_CONDUCT",
  // Changed on purpose (9 Nov 2026): fixed in production by WORK_AREA_ABSENCE_CITES_CONDUCT, QA round 7
  "nov9-work-area-absence-coaching-card": "WORK_AREA_ABSENCE_CITES_CONDUCT",
  // Changed on purpose (9 Nov 2026): fixed in production by WORK_AREA_ABSENCE_CITES_CONDUCT, QA round 7
  "nov9-work-area-absence-coaching-made-about": "WORK_AREA_ABSENCE_CITES_CONDUCT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_LINE_ANSWERS_ADD_UP, QA round 8
  "nov9-exit-lines-keep-method": "EXIT_LINE_ANSWERS_ADD_UP",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_LETTER_ADDRESSEE, QA round 8
  "nov9-letter-title-date-off-roster": "EXIT_LETTER_ADDRESSEE",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_LETTER_ADDRESSEE, QA round 8
  "nov9-letter-title-date-on-roster": "EXIT_LETTER_ADDRESSEE",
  // Changed on purpose (9 Nov 2026): fixed in production by MISSED_SHIFT_CITES_ATTENDANCE, QA round 8
  "nov9-missed-shift-cites-attendance-after-first-name": "MISSED_SHIFT_CITES_ATTENDANCE",
  // Changed on purpose (9 Nov 2026): fixed in production by MISSED_SHIFT_CITES_ATTENDANCE, QA round 8
  "nov9-missed-shift-cites-attendance-single": "MISSED_SHIFT_CITES_ATTENDANCE",
  // Changed on purpose (9 Nov 2026): fixed in production by POSSESSIVE_PLACE_ACCOUNT, QA round 8
  "nov9-possessive-place-what-happened": "POSSESSIVE_PLACE_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_ALL_OR_NOTHING, QA round 9
  "nov9-made-about-all-or-nothing-no-reading": "MADE_ABOUT_ALL_OR_NOTHING",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_ALL_OR_NOTHING, QA round 9
  "nov9-made-about-all-or-nothing-other-form": "MADE_ABOUT_ALL_OR_NOTHING",
  // Changed on purpose (9 Nov 2026): fixed in production by LETTER_GREETING_NOT_NAME, QA round 11
  "nov9-letter-greeting-dear-off-roster": "LETTER_GREETING_NOT_NAME",
  // Changed on purpose (9 Nov 2026): fixed in production by LETTER_GREETING_NOT_NAME, QA round 11
  "nov9-letter-greeting-dear-on-roster": "LETTER_GREETING_NOT_NAME",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_READER_ACCOUNT, QA round 11
  "nov9-made-about-reader-account-added": "MADE_ABOUT_READER_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_READER_ACCOUNT, QA round 11
  "nov9-made-about-reader-account-refused": "MADE_ABOUT_READER_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_READER_ACCOUNT, QA round 11
  "nov9-made-about-reader-account-replaced": "MADE_ABOUT_READER_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by MADE_ABOUT_READER_ACCOUNT, QA round 11
  "nov9-made-about-reader-account-replaced-live": "MADE_ABOUT_READER_ACCOUNT",
  // Changed on purpose (9 Nov 2026): fixed in production by EXIT_FORM_DATE_FROM_TERMINATION, QA round 12
  "nov9-exit-form-date-termination": "EXIT_FORM_DATE_FROM_TERMINATION",
};
