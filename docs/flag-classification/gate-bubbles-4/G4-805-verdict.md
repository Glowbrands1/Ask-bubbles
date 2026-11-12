# Gate-Bubbles-4: #805 DRAFT_NO_INVENTED_PLAN_ENABLED: GO (with one follow-up)

- PR head 58f015cc (Coding-6), merged --no-ff onto main 1471dab3, clean, tsc clean.
- Arms: 1 OFF + 1 ON over the four paths. OFF = production-flags.json "on" + "assumedOn" (322) as env; ON adds DRAFT_NO_INVENTED_PLAN_ENABLED. 13768 tests: OFF 759 failing, ON 799.
- Changed 42: INTENDED 3, INTENDED-ADJACENT 39, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0. The diff is wide, so the 3 changed files were re-run 2 more times per arm (3+3 in all): the same 39 rows each time. Runs 2-3 did not set FLAG_CLASSIFY_ON, so the replay pack's production arm ran without the PR flag there (the open case stays expected-fail in those two runs): a harness difference, not flakiness.

## INTENDED
- nov10-draft-no-invented-plan-ca-observation, production arm: OFF saves "Going Forward: Remy plans travel and preparation …" in the CA Observation (the case fails). ON: no Going Forward, and Observed ("20 minutes late") and Expectation are kept. Holds. The open case that now holds.
- nov8-step-b-reply-keeps-lines (fix arm, Coaching form, no plan stated by the manager): the model's "Going Forward: Ottoline will put every scheduled meeting on the calendar." is gone from the reply. The case still holds (QA 26 Oct).

## INTENDED-ADJACENT (39): not reported by coding
- draft-never-blank-oct26-e2e.test.ts (38) and account-only-policy-query-e2e "a draft with no invented detail is kept as written" (1): exact-equality checks against a model fixture whose CA Observation ends in "Going Forward: …". ON saves the same text without that section. Verified on one: ON saved "Observed:\nThe employee was late to work on October 2, 2026." These tests do nothing to stop the flag. But they fail under production env once the flag is in production-flags.json, so their expectations need flag scoping, as nov8's spaced() did. Coding's local run checked only the replay pack, so it did not see them.

## Not checked by replay (needs live)
- Coaching with a manager-stated plan keeps Going Forward: covered by the unit and e2e tests (draft-no-invented-plan-e2e, without-going-forward-scope), unchanged in both arms. No live check was done.
