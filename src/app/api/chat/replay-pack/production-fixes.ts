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
  // Changed on purpose (10 Nov 2026): fixed in production by POLICY_TOPIC_INTO_FIELD, QA round 14
  "nov10-policy-topic-in-field-finding-a-cover": "POLICY_TOPIC_INTO_FIELD",
  // Changed on purpose (10 Nov 2026): fixed in production by POLICY_TOPIC_INTO_FIELD, QA round 14
  "nov10-policy-topic-in-field-no-section": "POLICY_TOPIC_INTO_FIELD",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_REWRITE_FINISHES, QA round 13
  "nov9-made-about-rewrite-finishes-details-only": "MADE_ABOUT_REWRITE_FINISHES",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_REWRITE_FINISHES, QA round 13
  "nov9-made-about-rewrite-finishes-error-after-rewrite": "MADE_ABOUT_REWRITE_FINISHES",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_REWRITE_FINISHES, QA round 13
  "nov9-made-about-rewrite-finishes-reader-refused": "MADE_ABOUT_REWRITE_FINISHES",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_TOPIC_EVIDENCE, QA round 15
  "nov10-made-about-short-topic-reader-other": "MADE_ABOUT_TOPIC_EVIDENCE",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_TOPIC_EVIDENCE, QA round 15
  "nov10-made-about-short-topic-no-reading": "MADE_ABOUT_TOPIC_EVIDENCE",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_DATE_SAID_ALONE, QA round 15
  "nov10-form-date-said-alone-first-edit": "FORM_DATE_SAID_ALONE",
  // Changed on purpose (10 Nov 2026): fixed in production by MADE_ABOUT_SAID_DATE, QA round 15 re-release
  "nov10-made-about-said-date-vague-draft-live": "MADE_ABOUT_SAID_DATE",
  // Changed on purpose (10 Nov 2026): fixed in production by ADD_NOT_REPEATED, QA round 15 re-release
  "nov10-add-not-repeated-after-made-about": "ADD_NOT_REPEATED",
  // Changed on purpose (10 Nov 2026): fixed in production by SECTION_BREAKS_KEPT, QA round 15 re-release 2
  "nov10-section-breaks-kept-one-line": "SECTION_BREAKS_KEPT",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov4-scan-sf-s11-same-for-another": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by CARD_NAMES_EMPLOYEE, SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov4-scan-sf-s20-now-one-for-lysandra": "CARD_NAMES_EMPLOYEE",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov5-coding3-sfo-a-same-thing-card-on-screen": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by CARD_NAMES_EMPLOYEE, SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov5-coding3-sfo-c-also-coaching-card-open": "CARD_NAMES_EMPLOYEE",
  // Changed on purpose (10 Nov 2026): fixed in production by CARD_NAMES_EMPLOYEE, SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov5-coding3-sfo-c-also-coaching-after-create": "CARD_NAMES_EMPLOYEE",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-card-on-screen-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-after-create-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-card-on-screen-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-after-create-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-card-on-screen-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-after-create-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-card-on-screen-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-after-create-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-card-on-screen-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-after-create-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-card-on-screen-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-qa-nostore-after-create-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-card-on-screen-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-after-create-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-card-on-screen-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-after-create-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-card-on-screen-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-after-create-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-card-on-screen-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-after-create-lower": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-card-on-screen-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-after-create-sentence": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-card-on-screen-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-distinct-read-after-create-caps": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-guard-no-account-stays-same-form-card-on-screen": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by SAME_REQUEST_OTHER_PERSON, QA round 16
  "nov6-diffemp-guard-no-account-stays-same-form-after-create": "SAME_REQUEST_OTHER_PERSON",
  // Changed on purpose (10 Nov 2026): fixed in production by CREATE_FROM_CONVERSATION_POINTS_TO_CARD, QA round 16
  "nov10-create-from-conversation-payroll-asked": "CREATE_FROM_CONVERSATION_POINTS_TO_CARD",
  // Changed on purpose (10 Nov 2026): fixed in production by CREATE_FROM_CONVERSATION_POINTS_TO_CARD, QA round 16
  "nov10-create-from-conversation-after-no": "CREATE_FROM_CONVERSATION_POINTS_TO_CARD",
  // Changed on purpose (10 Nov 2026): fixed in production by ACCOUNT_WIPE_GUARD, CARD_NAMES_EMPLOYEE, QA round 16
  "nov10-reopened-edit-keeps-details-clear": "ACCOUNT_WIPE_GUARD",
  // Changed on purpose (10 Nov 2026): fixed in production by ACCOUNT_WIPE_GUARD, CARD_NAMES_EMPLOYEE, QA round 16
  "nov10-reopened-edit-keeps-details-replace": "ACCOUNT_WIPE_GUARD",
  // Changed on purpose (10 Nov 2026): fixed in production by DRAFT_WRITE_NEVER_SILENT, QA round 17b
  "nov10-draft-write-refused-field-never-drops-the-draft": "DRAFT_WRITE_NEVER_SILENT",
  // Changed on purpose (10 Nov 2026): fixed in production by PAYROLL_BARE_SENTENCE, QA round 17b
  "nov10-p15-payroll-deduction-sentence-is-yes": "PAYROLL_BARE_SENTENCE",
  // Changed on purpose (10 Nov 2026): fixed in production by FAILURE_TO_OPEN_IS_LATE_OPENING, QA round 17b
  "nov10-p16-failure-to-open-is-what-happened": "FAILURE_TO_OPEN_IS_LATE_OPENING",
  // Changed on purpose (10 Nov 2026): fixed in production by CA_REASON_DUE_TO, QA round 17b
  "nov6-ca-reason-at-store-then-account": "CA_REASON_DUE_TO",
  // Changed on purpose (10 Nov 2026): fixed in production by CA_REASON_DUE_TO, QA round 17b
  "nov6-ca-reason-because-of-draft-observation": "CA_REASON_DUE_TO",
  // Changed on purpose (10 Nov 2026): fixed in production by CA_REASON_DUE_TO, QA round 17b
  "nov6-ca-reason-due-to-card-issue": "CA_REASON_DUE_TO",
  // Changed on purpose (10 Nov 2026): fixed in production by CA_REASON_DUE_TO, QA round 17b
  "nov6-ca-reason-due-to-draft-observation": "CA_REASON_DUE_TO",
  // Changed on purpose (11 Nov 2026): fixed in production by NO_SHOW_OPENING_IS_ATTENDANCE, QA round 17d
  "nov10-no-show-opening-is-attendance-as-typed": "NO_SHOW_OPENING_IS_ATTENDANCE",
  // Changed on purpose (11 Nov 2026): fixed in production by NO_SHOW_OPENING_IS_ATTENDANCE, QA round 17d
  "nov10-no-show-opening-is-attendance-lower": "NO_SHOW_OPENING_IS_ATTENDANCE",
  // Changed on purpose (11 Nov 2026): fixed in production by REQUEST_ISSUE_KEPT, QA round 17d
  "nov10-r17b-p16-issue-as-typed": "REQUEST_ISSUE_KEPT",
  // Changed on purpose (11 Nov 2026): fixed in production by REQUEST_ISSUE_KEPT, QA round 17d
  "nov10-r17b-p16-issue-lower": "REQUEST_ISSUE_KEPT",
  // Changed on purpose (11 Nov 2026): fixed in production by LATE_OPENING_OWN_WORDS, QA round 17d
  "nov10-r17b-late-opening-quote-p16": "LATE_OPENING_OWN_WORDS",
  // Changed on purpose (11 Nov 2026): fixed in production by LATE_OPENING_OWN_WORDS, QA round 17d
  "nov10-r17b-late-opening-quote-opening-shift": "LATE_OPENING_OWN_WORDS",
  // Changed on purpose (11 Nov 2026): fixed in production by LATE_OPENING_OWN_WORDS, QA round 17d
  "nov10-r17b-late-opening-quote-not-on-time": "LATE_OPENING_OWN_WORDS",
  // Changed on purpose (11 Nov 2026): fixed in production by FIRST_NAME_ENOUGH, QA round 17d
  "nov10-r17b-first-name-enough": "FIRST_NAME_ENOUGH",
  // Changed on purpose (11 Nov 2026): fixed in production by EXCERPT_BRAND_HEADING_DROP, QA round 17f
  "nov11-excerpt-brand-heading-holidays": "EXCERPT_BRAND_HEADING_DROP",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-first-date-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-first-date-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-first-nodate-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-first-nodate-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-date-caps-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-date-caps-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-date-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-date-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-nodate-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-last-nodate-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-middle-date-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-middle-date-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-middle-nodate-sentence-off-code": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov4-name-middle-nodate-sentence-off-models": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-one-word-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-word1-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-word1-typo-yes": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-word2-rotated": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-word2-rotated-earlier-turn": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-compound-surname-word2-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_OFF_ROSTER_ASK, QA round 16c
  "nov5-r3-off-roster-lowercase-action-plan": "FORM_NAME_OFF_ROSTER_ASK",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-roster-only-ima-off-roster": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov5-twin-gate-ima-off-roster-observation": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-apostrophe-first-initial": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-apostrophe-rotation": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-apostrophe-swap": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-apostrophe-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-compound-surname-first-initial": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-compound-surname-rotation": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-compound-surname-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-preferred-first-initial": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-preferred-rotation": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-preferred-swap": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-preferred-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-short-surname-first-initial": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-two-word-first-first-initial": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-two-word-first-rotation": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-two-word-first-swap": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (10 Nov 2026): fixed in production by FORM_NAME_FROM_ROSTER, QA round 16c
  "nov6-roster-shape-two-word-first-typo": "FORM_NAME_FROM_ROSTER",
  // Changed on purpose (11 Nov 2026): fixed in production by NEAR_MISS_ANSWER_KEEPS_REQUEST, QA round 16c
  "nov10-near-miss-answer-keeps-request": "NEAR_MISS_ANSWER_KEEPS_REQUEST",
  // Changed on purpose (12 Nov 2026): fixed in production by TITLE_NOT_PART_OF_NAME, QA round 17h
  "nov7-sf-s36-exit-surname-typo": "TITLE_NOT_PART_OF_NAME",
  // Changed on purpose (12 Nov 2026): fixed in production by NOT_FOLLOWING_IS_VIOLATION, QA round 17h
  "nov10-not-following-dress-code-coaching-cites": "NOT_FOLLOWING_IS_VIOLATION",
  // Changed on purpose (12 Nov 2026): fixed in production by NOT_FOLLOWING_IS_VIOLATION, QA round 17h
  "nov10-not-following-dress-code-ca-policy": "NOT_FOLLOWING_IS_VIOLATION",
  // Changed on purpose (12 Nov 2026): fixed in production by FORM_FOR_FOR_TYPO, QA round 17h
  "nov10-sf-s36-off-roster-exit": "FORM_FOR_FOR_TYPO",
  // Changed on purpose (12 Nov 2026): fixed in production by FORM_FOR_FOR_TYPO, QA round 17h
  "nov11-exit-for-for-is-an-exit-request": "FORM_FOR_FOR_TYPO",
  // Changed on purpose (12 Nov 2026): fixed in production by TITLE_NOT_PART_OF_NAME, QA round 17h
  "nov11-title-not-part-of-name": "TITLE_NOT_PART_OF_NAME",
  // Changed on purpose (12 Nov 2026): fixed in production by TITLE_NOT_PART_OF_NAME, QA round 17h
  "nov11-title-not-part-of-name-yes-then-card": "TITLE_NOT_PART_OF_NAME",
  // fixed in production by NAME_LINE_COMMA, QA round 17i, 11 Nov 2026
  "nov4-live-ca-t2-name-line-on-roster": "NAME_LINE_COMMA",
  // fixed in production by ADDRESS_ASKS_WHO, QA round 17i, 11 Nov 2026
  "nov4-live-street-address-not-a-person": "ADDRESS_ASKS_WHO",
  // fixed in production by LEAD_FULL_SENTENCE, QA round 17i, 11 Nov 2026
  "nov5-sf-b6-reply-full-sentence": "LEAD_FULL_SENTENCE",
  // fixed in production by COPY_PASTE_CLAIM_HONEST, QA round 17i, 11 Nov 2026
  "nov10-copy-paste-claim-not-sent": "COPY_PASTE_CLAIM_HONEST",
  // fixed in production by TEMPLATE_OUTLINE_FIELDS, QA round 17i, 11 Nov 2026
  "nov5-twin-sf-s21-must-see-behaviors-template": "TEMPLATE_OUTLINE_FIELDS",
  // fixed in production by TEMPLATE_OUTLINE_FIELDS, QA round 17i, 11 Nov 2026
  "nov10-twin-sf-s21-template-outline-saved": "TEMPLATE_OUTLINE_FIELDS",
  // fixed in production by PASTED_OUTLINE_TO_OPEN_DRAFT, QA round 17i, 11 Nov 2026
  "nov10-r23-sf-s21-pasted-outline-to-open-draft": "PASTED_OUTLINE_TO_OPEN_DRAFT",
  // fixed in production by PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT, QA round 17i, 11 Nov 2026
  "nov11-r25-sf-s21-pasted-template-fills-open-draft": "PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT",
  // fixed in production by PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT, QA round 17i, 11 Nov 2026
  "nov11-r25-5c-pasted-steps-keep-line-breaks": "PASTED_TEMPLATE_FIELDS_TO_OPEN_DRAFT",
  // fixed in production by GROUP_WORDS_NOT_A_NAME, QA round 17i, 11 Nov 2026
  "nov11-p19-group-words-not-a-name-as-typed": "GROUP_WORDS_NOT_A_NAME",
  // fixed in production by GROUP_WORDS_NOT_A_NAME, QA round 17i, 11 Nov 2026
  "nov11-p19-group-words-not-a-name-lower": "GROUP_WORDS_NOT_A_NAME",
  // fixed in production by EXIT_TYPO_WORDS, QA round 17j, 12 Nov 2026
  "nov10-p17-exit-items-and-rehire-misspelled": "EXIT_TYPO_WORDS",
  // fixed in production by NO_NAME_REPLY_WORDING, QA round 17j, 12 Nov 2026
  "nov11-live-ima-employee-no-name-words-every-store": "NO_NAME_REPLY_WORDING",
  // fixed in production by NO_NAME_REPLY_WORDING, QA round 17j, 12 Nov 2026
  "nov11-live-ima-employee-no-name-words-store-manager": "NO_NAME_REPLY_WORDING",
  // fixed in production by LETTER_GREETING_ANY_CASE, QA round 17k, 12 Nov 2026
  "nov10-letter-greeting-your-capitalised": "LETTER_GREETING_ANY_CASE",
  // fixed in production by COMPANY_METRIC_WORDS_NOT_NAMES, QA round 17k, 12 Nov 2026
  "nov11-bcs-metrics-comp-sales": "COMPANY_METRIC_WORDS_NOT_NAMES",
  // fixed in production by COMPANY_METRIC_WORDS_NOT_NAMES, QA round 17k, 12 Nov 2026
  "nov11-bcs-metrics-discount-rate": "COMPANY_METRIC_WORDS_NOT_NAMES",
  // fixed in production by ACCOUNT_BEFORE_REQUEST, QA round 17k, 12 Nov 2026
  "nov10-p14a-account-opens-with-a-question": "ACCOUNT_BEFORE_REQUEST",
  // fixed in production by DRAFT_NO_INVENTED_PLAN, QA round 17l, 12 Nov 2026
  "nov10-draft-no-invented-plan-ca-observation": "DRAFT_NO_INVENTED_PLAN",
  // fixed in production by EMPTY_REPLY_GUARD, QA round 17l, 12 Nov 2026
  "nov11-empty-reply-guard-policy-question": "EMPTY_REPLY_GUARD",
  // fixed in production by POLICY_PAGE_ON_CARD, QA round 17l, 12 Nov 2026
  "nov11-policy-page-on-card-standards-of-conduct": "POLICY_PAGE_ON_CARD",
  // fixed in production by WORN_CLOTHING_IS_DRESS_CODE, QA round 17m, 12 Nov 2026
  "nov11-17i-hoodie-ca-dress-code": "WORN_CLOTHING_IS_DRESS_CODE",
  // fixed in production by COPY_PASTE_POINTS_TO_CARD, QA round 17m, 12 Nov 2026
  "nov11-17i-copy-paste-points-to-card": "COPY_PASTE_POINTS_TO_CARD",
  // fixed in production by EXIT_PROSE_FACTS, QA round 17m, 12 Nov 2026
  "nov11-exit-prose-bare-name": "EXIT_PROSE_FACTS",
  // fixed in production by FORM_INPUT_FIDELITY, QA round 17m, 12 Nov 2026
  "nov11-form-input-fidelity-title-yesterday": "FORM_INPUT_FIDELITY",
  // fixed in production by PASTED_FORM_NAME_NOT_REQUEST, QA round 17n, 12 Nov 2026
  "nov10-b4-twin-ca-not-coaching-form-type": "PASTED_FORM_NAME_NOT_REQUEST",
  // fixed in production by EXPECTATION_POLICY_LINE_KEPT, QA round 17n, 12 Nov 2026
  "nov10-expectation-policy-line-kept": "EXPECTATION_POLICY_LINE_KEPT",
  // fixed in production by MADE_FOR_IS_MADE_ABOUT, QA round 17n, 12 Nov 2026
  "nov10-made-for-is-made-about-about-missing-out": "MADE_FOR_IS_MADE_ABOUT",
  // fixed in production by MADE_FOR_IS_MADE_ABOUT, QA round 17n, 12 Nov 2026
  "nov10-made-for-is-made-about-reader-nothing": "MADE_FOR_IS_MADE_ABOUT",
  // fixed in production by MADE_FOR_IS_MADE_ABOUT, QA round 17n, 12 Nov 2026
  "nov10-made-for-is-made-about-reader-replaces": "MADE_FOR_IS_MADE_ABOUT",
  // fixed in production by PASTED_REVIEW_NOT_ACCOUNT, QA round 17n, 12 Nov 2026
  "nov10-twin-sf-s22-pasted-review-never-drafted": "PASTED_REVIEW_NOT_ACCOUNT",
  // fixed in production by PASTED_REVIEW_NOT_ACCOUNT, QA round 17n, 12 Nov 2026
  "nov5-twin-sf-s22-ca-not-coaching": "PASTED_REVIEW_NOT_ACCOUNT",
  // fixed in production by REOPEN_CLOSE_SPELLING, QA round 17n, 12 Nov 2026
  "nov5-twin-sf-s26-edit-misspelled-ca": "REOPEN_CLOSE_SPELLING",
  // fixed in production by STEP_B_REPLY_KEEPS_LINES, QA round 17n, 12 Nov 2026
  "nov8-step-b-reply-keeps-lines": "STEP_B_REPLY_KEEPS_LINES",
  // fixed in production by MADE_ABOUT_UNDATED_TOGETHER, QA round 17n, 12 Nov 2026
  "nov9-made-about-undated-no-reading": "MADE_ABOUT_UNDATED_TOGETHER",
  // fixed in production by MADE_ABOUT_UNDATED_TOGETHER, QA round 17n, 12 Nov 2026
  "nov9-made-about-undated-topic": "MADE_ABOUT_UNDATED_TOGETHER",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-coaching-vs-ca-lower": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-coaching-vs-ca-sentence": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-generic-policy-review-lower": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-generic-policy-review-sentence": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-someone-who-quit-lower": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-someone-who-quit-sentence": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-what-is-a-ca-lower": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-what-is-a-ca-sentence": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-which-forms-lower": "FORMS_GUIDE",
  // fixed in production by FORMS_GUIDE, QA round 17o, 12 Nov 2026
  "nov10-forms-guide-which-forms-sentence": "FORMS_GUIDE",
  // fixed in production by FUTURE_INCIDENT_DATE_ASK, QA round 17o, 12 Nov 2026
  "nov10-future-incident-date-full-lower": "FUTURE_INCIDENT_DATE_ASK",
  // fixed in production by FUTURE_INCIDENT_DATE_ASK, QA round 17o, 12 Nov 2026
  "nov10-future-incident-date-full-sentence": "FUTURE_INCIDENT_DATE_ASK",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov10-p15-term-ca-ticks-termination": "TERMINATION_STATED_TICKS",
  // fixed in production by NAME_CORRECTION_KEEPS_DATE, QA round 17o, 12 Nov 2026
  "nov10-r22-s14-date-kept-after-name-correction": "NAME_CORRECTION_KEEPS_DATE",
  // fixed in production by SAME_REQUEST_CARRIES_ACCOUNT, QA round 17o, 12 Nov 2026
  "nov10-same-request-carries-account": "SAME_REQUEST_CARRIES_ACCOUNT",
  // fixed in production by SAME_REQUEST_CARRIES_ACCOUNT, QA round 17o, 12 Nov 2026
  "nov10-same-request-carries-account-off-roster": "SAME_REQUEST_CARRIES_ACCOUNT",
  // fixed in production by SAME_REQUEST_KEEPS_EARLIER_CARD, QA round 17o, 12 Nov 2026
  "nov10-same-request-keeps-earlier-card": "SAME_REQUEST_KEEPS_EARLIER_CARD",
  // fixed in production by SAME_REQUEST_KEEPS_EARLIER_CARD, QA round 17o, 12 Nov 2026
  "nov10-same-request-keeps-earlier-card-off-roster": "SAME_REQUEST_KEEPS_EARLIER_CARD",
  // fixed in production by OUTLINE_ON_OPEN_PROPOSAL, QA round 17o, 12 Nov 2026
  "nov11-17i-outline-on-open-proposal": "OUTLINE_ON_OPEN_PROPOSAL",
  // fixed in production by NEAR_MISS_TURNED_DOWN_EVERYWHERE, QA round 17o, 12 Nov 2026
  "nov11-near-miss-no-call-no-show-after-question": "NEAR_MISS_TURNED_DOWN_EVERYWHERE",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-admin": "TITLE_BEFORE_NAME",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-create-names-employee": "TITLE_BEFORE_NAME",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-draft-create-team-member": "TITLE_BEFORE_NAME",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-draft-team-member": "TITLE_BEFORE_NAME",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-draft-tm": "TITLE_BEFORE_NAME",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov11-title-before-name-location-manager": "TITLE_BEFORE_NAME",
  // fixed in production by POLICY_CARRY_RETRIEVAL, QA round 17o, 12 Nov 2026
  "nov12-180-just-make-it-searches-the-named-policy": "POLICY_CARRY_RETRIEVAL",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-because-didnt-call-in": "TERMINATION_STATED_TICKS",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-didnt-show-for-shift": "TERMINATION_STATED_TICKS",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-so-i-need": "TERMINATION_STATED_TICKS",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-term-ca-did-not-show": "TERMINATION_STATED_TICKS",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-terminating-never-showed": "TERMINATION_STATED_TICKS",
  // fixed in production by TERMINATION_STATED_TICKS, QA round 17o, 12 Nov 2026
  "nov12-termination-ticks-termination-ca-no-call-no-show": "TERMINATION_STATED_TICKS",
  // fixed in production by TITLE_BEFORE_NAME, QA round 17o, 12 Nov 2026
  "nov12-title-before-name-trailing-today": "TITLE_BEFORE_NAME",
  // fixed in production by NEGATED_LATENESS_TOPIC, QA round 17p, 12 Nov 2026
  "oct26-negated-lateness-not-late-today": "NEGATED_LATENESS_TOPIC",
  // fixed in production by DETAILS_FROM_EARLIER_ANSWER, QA round 17p, 12 Nov 2026
  "nov10-chat-edits-a-details-handed-to-the-revision": "DETAILS_FROM_EARLIER_ANSWER",
  // fixed in production by INCIDENT_FROM_EARLIER_TURN, QA round 17p, 12 Nov 2026
  "nov5-twin-sf-s28-incident-from-previous-turn": "INCIDENT_FROM_EARLIER_TURN",
  // fixed in production by INCIDENT_FROM_EARLIER_TURN, QA round 17p, 12 Nov 2026
  "nov5-twin-sf-s28-incident-scope": "INCIDENT_FROM_EARLIER_TURN",
  // fixed in production by GUEST_ATTITUDE_CONDUCT, QA round 17p, 12 Nov 2026
  "nov10-sf-b5-guest-attitude-cites-conduct": "GUEST_ATTITUDE_CONDUCT",
  // fixed in production by PRIOR_ACTIONS_NO_COMMA, QA round 17p, 12 Nov 2026
  "nov10-prior-actions-no-comma-qa-lower": "PRIOR_ACTIONS_NO_COMMA",
  // fixed in production by PRIOR_ACTIONS_NO_COMMA, QA round 17p, 12 Nov 2026
  "nov10-prior-actions-no-comma-qa-caps": "PRIOR_ACTIONS_NO_COMMA",
  // fixed in production by PRIOR_ACTIONS_NO_COMMA, QA round 17p, 12 Nov 2026
  "nov10-prior-actions-no-comma-triage-lower": "PRIOR_ACTIONS_NO_COMMA",
  // fixed in production by PRIOR_ACTIONS_NO_COMMA, QA round 17p, 12 Nov 2026
  "nov10-prior-actions-no-comma-triage-caps": "PRIOR_ACTIONS_NO_COMMA",
  // fixed in production by STEP_B_ADD_UNDER_OBSERVED, QA round 17p, 12 Nov 2026
  "nov8-step-b-add-under-observed": "STEP_B_ADD_UNDER_OBSERVED",
  // fixed in production by STEP_B_ADD_UNDER_OBSERVED, QA round 17p, 12 Nov 2026
  "nov8-step-b-whole-text-tail": "STEP_B_ADD_UNDER_OBSERVED",
  // fixed in production by WRITE_UP_LEAD_NOT_ACCOUNT, QA round 17p, 12 Nov 2026
  "nov10-write-up-observation-167": "WRITE_UP_LEAD_NOT_ACCOUNT",
  // fixed in production by BARE_COACHING_REQUEST_LEAD, QA round 17p, 12 Nov 2026
  "nov12-r31-bare-coaching-request-lead": "BARE_COACHING_REQUEST_LEAD",
  // fixed in production by RESENT_REQUEST_IS_YES, QA round 17p, 12 Nov 2026
  "nov12-resent-exit-request-keeps-name": "RESENT_REQUEST_IS_YES",
  // fixed in production by TERMINATION_INTAKE, QA round 17p, 12 Nov 2026
  "nov12-termination-ca-bare-opens-card": "TERMINATION_INTAKE",
  // fixed in production by TERMINATION_INTAKE, QA round 17p, 12 Nov 2026
  "nov12-17k-termination-letter-exit-card": "TERMINATION_INTAKE",
  // fixed in production by REGISTER_ACCURACY_CONDUCT, QA round 17q, 13 Nov 2026
  "nov4-ca-sales-wrong-items-card": "REGISTER_ACCURACY_CONDUCT",
  // fixed in production by ADDED_DETAIL_KEPT, QA round 17q, 13 Nov 2026
  "nov5-sf-b6-full-sentence-and-added-detail": "ADDED_DETAIL_KEPT",
  // fixed in production by CA_PROCEDURE_BASIS, QA round 17q, 13 Nov 2026
  "nov5-sf-b6-policy-left-for-the-manager": "CA_PROCEDURE_BASIS",
  // fixed in production by ADDED_DETAIL_KEPT, QA round 17q, 13 Nov 2026
  "nov10-sf-b6-card-carries-added-detail": "ADDED_DETAIL_KEPT",
  // fixed in production by ATTENDANCE_PLAN_NEEDS_LATENESS, QA round 17q, 13 Nov 2026
  "nov11-attendance-plan-no-lateness-said": "ATTENDANCE_PLAN_NEEDS_LATENESS",
  // fixed in production by CARD_PLAN_MATCHES_CREATE, QA round 17q, 13 Nov 2026
  "nov12-17l-card-shows-pau-attendance-plan": "CARD_PLAN_MATCHES_CREATE",
  // fixed in production by CARD_PLAN_MATCHES_CREATE, QA round 17q, 13 Nov 2026
  "nov12-17l-card-plan-equals-saved-plan": "CARD_PLAN_MATCHES_CREATE",
  // fixed in production by OFF_ROSTER_STORE_ANSWER_ONLY, QA round 17q, 13 Nov 2026
  "nov12-off-roster-store-answer-only-dodge": "OFF_ROSTER_STORE_ANSWER_ONLY",
  // fixed in production by OFF_ROSTER_STORE_ANSWER_ONLY, QA round 17q, 13 Nov 2026
  "nov12-off-roster-store-answer-only-full-name": "OFF_ROSTER_STORE_ANSWER_ONLY",
  // fixed in production by ANIMAL_VISITORS_ONLY_WHEN_VISITOR, QA round 17q, 13 Nov 2026
  "nov5-animal-alone-no-visitors": "ANIMAL_VISITORS_ONLY_WHEN_VISITOR",
  // fixed in production by ANIMAL_VISITORS_ONLY_WHEN_VISITOR, QA round 17q, 13 Nov 2026
  "nov5-visitor-alone-control": "ANIMAL_VISITORS_ONLY_WHEN_VISITOR",
  // fixed in production by ANIMAL_VISITORS_ONLY_WHEN_VISITOR, QA round 17q, 13 Nov 2026
  "nov5-animal-customers-saw-it": "ANIMAL_VISITORS_ONLY_WHEN_VISITOR",
  // fixed in production by ADD_NOT_REPEATED_SENTENCES, QA round 17q, 13 Nov 2026
  "nov10-add-not-repeated-leading-sentence": "ADD_NOT_REPEATED_SENTENCES",
  // fixed in production by ADD_OUT_OF_OTHER_SECTIONS, QA round 17q, 13 Nov 2026
  "nov10-r16b-add-reminded-under-observed": "ADD_OUT_OF_OTHER_SECTIONS",
  // fixed in production by ADD_OUT_OF_OTHER_SECTIONS, QA round 17q, 13 Nov 2026
  "nov10-r16b-add-reminded-glued-into-expectation": "ADD_OUT_OF_OTHER_SECTIONS",
  // fixed in production by RELATIVE_DAY_NOT_HISTORY, QA round 17q, 13 Nov 2026
  "nov10-relative-day-keeps-written": "RELATIVE_DAY_NOT_HISTORY",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-manager-form-choice-needs-ca-lower": "MANAGER_FORM_CHOICE",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-manager-form-choice-needs-ca-sentence": "MANAGER_FORM_CHOICE",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-manager-form-choice-write-ca-lower": "MANAGER_FORM_CHOICE",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-manager-form-choice-write-ca-sentence": "MANAGER_FORM_CHOICE",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov10-store-alias-at-dodge-ne": "STORE_ALIAS",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov10-store-alias-bare-Dodge-comma-NE": "STORE_ALIAS",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov10-store-alias-bare-dodge-comma-ne": "STORE_ALIAS",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov10-store-alias-dodge-ne-location": "STORE_ALIAS",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-writen-ca-terse-lower": "MANAGER_FORM_CHOICE",
  // fixed in production by MANAGER_FORM_CHOICE, QA round 17r, 13 Nov 2026
  "nov10-writen-ca-terse-sentence": "MANAGER_FORM_CHOICE",
  // fixed in production by EXIT_NOTICE_VERB_TYPOS, QA round 17r, 13 Nov 2026
  "nov11-exit-notice-submited": "EXIT_NOTICE_VERB_TYPOS",
  // fixed in production by TYPO_FULL_NAME_TO_ROSTER, QA round 17r, 13 Nov 2026
  "nov11-sf-b5-typo-name-and-title": "TYPO_FULL_NAME_TO_ROSTER",
  // fixed in production by TITLE_INITIALISM_CASE, QA round 17r, 13 Nov 2026
  "nov11-title-initialism-hr-assistant-as-typed": "TITLE_INITIALISM_CASE",
  // fixed in production by TITLE_INITIALISM_CASE, QA round 17r, 13 Nov 2026
  "nov11-title-initialism-hr-assistant-lowercase": "TITLE_INITIALISM_CASE",
  // fixed in production by EXIT_NOTICE_STATED_ONLY, QA round 17r, 13 Nov 2026
  "nov12-17j-resigned-date-is-not-notice-date": "EXIT_NOTICE_STATED_ONLY",
  // fixed in production by TERMINATION_CARD_TIDY, QA round 17r, 13 Nov 2026
  "nov12-17o-issue-not-termination-hedge": "TERMINATION_CARD_TIDY",
  // fixed in production by TERMINATION_CARD_TIDY, QA round 17r, 13 Nov 2026
  "nov12-17o-term-plan-line-break": "TERMINATION_CARD_TIDY",
  // fixed in production by ANSWER_TURN_LEVEL, QA round 17r, 13 Nov 2026
  "nov12-near-miss-answer-level-is-this-forms": "ANSWER_TURN_LEVEL",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov12-store-alias-off-roster-ask-lower": "STORE_ALIAS",
  // fixed in production by STORE_ALIAS, QA round 17r, 13 Nov 2026
  "nov12-store-alias-off-roster-ask-sentence": "STORE_ALIAS",
  // fixed in production by TEAM_CARD_NOT_PRODUCT, QA round 17r, 13 Nov 2026
  "nov4-scan-sf-s13-team-coaching-blank-employee": "TEAM_CARD_NOT_PRODUCT",
  // fixed in production by FORM_EDIT_SOURCE_TURN, QA round 17r, 13 Nov 2026
  "nov5-coding3-copy-paste-question-told-the-truth": "FORM_EDIT_SOURCE_TURN",
  // fixed in production by FORM_EDIT_SOURCE_TURN, QA round 17r, 13 Nov 2026
  "nov5-coding3-these-details-answered-before-the-card": "FORM_EDIT_SOURCE_TURN",
  // fixed in production by POLICY_CITATION, QA round 17r, 13 Nov 2026
  "nov8-560-apostrophe-name-keeps-policy": "POLICY_CITATION",
  // fixed in production by POLICY_CITATION, QA round 17r, 13 Nov 2026
  "nov8-560-hyphen-name-keeps-policy": "POLICY_CITATION",
  // fixed in production by OFF_ROSTER_PLACE_ANSWER, QA hotfix 17r-b, 13 Nov 2026
  "nov12-off-roster-place-answer-roster-name": "OFF_ROSTER_PLACE_ANSWER",
  // fixed in production by OFF_ROSTER_PLACE_ANSWER, QA hotfix 17r-b, 13 Nov 2026
  "nov12-off-roster-place-answer-city-only": "OFF_ROSTER_PLACE_ANSWER",
  // fixed in production by OFF_ROSTER_PLACE_ANSWER, QA hotfix 17r-b, 13 Nov 2026
  "nov12-off-roster-place-answer-state-first": "OFF_ROSTER_PLACE_ANSWER",
  // fixed in production by OFF_ROSTER_PLACE_ANSWER, QA hotfix 17r-b, 13 Nov 2026
  "nov12-off-roster-place-answer-city-state-unlisted": "OFF_ROSTER_PLACE_ANSWER",
  // fixed in production by OFF_ROSTER_PLACE_ANSWER, QA hotfix 17r-b, 13 Nov 2026
  "nov12-off-roster-place-answer-17r-live-west-dodge": "OFF_ROSTER_PLACE_ANSWER",
  // fixed in production by HUMAN_REPLIES, QA hotfix 17r-c, 13 Nov 2026
  "nov10-card-opener-once-ca-chain": "HUMAN_REPLIES",
  // fixed in production by TERMINATION_TIDY_HELD_NAME, QA hotfix 17r-c, 13 Nov 2026
  "nov12-17r-termination-tidy-off-roster-ask": "TERMINATION_TIDY_HELD_NAME",
};
