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
};
