# Gate-Bubbles-5: #756 (contains #719) POLICY_GATE_NONBLOCKING + NEXT_PUBLIC_POLICY_GATE_NONBLOCKING + POLICY_BLANK_HONEST_REPLY: GO on behaviour, ONE CASE FIX REQUIRED before merge

- PR head 48a1bc6f, merged --no-ff onto main aecb3342, clean, tsc clean. #719 (48417848) is not an ancestor; #756's history carries #719's commits (rebuilt), so it was gated alone with #719's two flags plus its own.
- 1 OFF + 1 ON, production env (325) +/- the 3 flags; src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms, src/features/chat/inline-form.dom.test.tsx.
- 13877 tests, OFF 770 / ON 785 failing. Changed 19: INTENDED 12, INTENDED-HARNESS 7, REGRESSION 0, FLAKY 0, UNCLASSIFIED 0 (G5-756.md).

## Behaviour
- Blank Direct policy no longer holds CA finalize (coaching-lifecycle B/C/D, inline-form P4 pins flip, on purpose); a TYPED unverified policy_language is still held (policy-verification.ts keeps `filled` fields). The finalized event records policyBlankAtFinalize + blankPolicy.
- Open cases now holding: nov11-policy-blank-did-you-check, nov11-policy-blank-is-it-verified. ON reply: "No. The **Direct policy from official manual** field on Remy Calder's Corrective Action Form is empty, so nothing from the manual is quoted on it and nothing on it was checked. The form names **Attendance Policy, JBA Policy Manual p.14**, but its wording is not on the draft." (OFF: "That's the section quoted on Remy's draft" / "Nothing on the form has changed yet").

## Required fix (the PR's own case)
nov10-blank-direct-policy-never-called-verified (from #719) FAILS in the ON arm, production and fix runs: its regex wants "Not yet checked against the official manual" or "Blank, so nothing on it was checked …" before "Direct policy" in the model's system prompt. With POLICY_BLANK_HONEST_REPLY on, prompts.ts replaces that line with "The Direct policy from official manual field on this draft is EMPTY: nothing from the manual is quoted on it … never say the policy on it was checked or verified." The prompt is honest; the case does not accept the PR's own new wording. The case's other assertions (model asked, form described, not "were quoted from the official manual") hold. Once the three flags are in production the replay pack goes red. Asked of coding: accept the EMPTY line in the regex (or give the case a run with POLICY_BLANK_HONEST_REPLY on).

## Release head notes
Re-record src/lib/forms/form-edit-single-writer-flags-off.main.json (the finalized event's markers change with POLICY_GATE_NONBLOCKING). Move the two nov11 cases to FIXED_IN_PRODUCTION.
