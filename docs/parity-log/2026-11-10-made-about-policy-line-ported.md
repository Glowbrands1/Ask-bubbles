# Ported from the sibling app: a made-about rewrite's policy reference is read again from the new account (supersedes 2026-11-09-made-about-policy-line.md)

**Why the 9 Nov note no longer holds.** `2026-11-09-made-about-policy-line.md` left MADE_ABOUT_POLICY_LINE unported because this app's Coaching drafts carried no "Policy reference" line while POLICY_CITATION is off. They do now: EDIT_POLICY_ASK_ENABLED (on in production) writes the app's own line when a manager asks for the policy ("… and please list the policy …").

**QA's live Bubbles report (10 Nov 2026, exact wording).** On a saved Coaching draft whose Details already carried "Policy reference: Attendance Policy, JBA Policy Manual p.14" (written by an earlier make-about turn that asked for the policy), a second make-about "make it about not following the dress code" kept the stale "Policy reference: Attendance Policy, JBA Policy Manual p.14" and wrote no dress-code reference line.

**Ported (each default off; same flag in both apps):**

- CITATION_LINE_KEPT_ON_REVISION_ENABLED (sibling 61c6219a, PR #560): `forms/app-citation-line.ts` and `planRevision` (`forms/revision.ts`) keep the app's trailing line on a wording or additive edit instead of refusing it.
- MADE_ABOUT_POLICY_LINE_ENABLED (sibling 70119f97, with the `oldLine` input from 48c45d11): `forms/made-about-policy-line.ts`, from `form-patch-turn.ts` once a dated made-about rewrote the account.
- MADE_ABOUT_POLICY_LINE_REPLACES_ENABLED (sibling edb1ecb, on its branch `claude/made-about-topic-and-date`, not yet on its main): every "Policy reference: …" line is taken off the rewritten account, wherever it sits (`withoutPolicyLines`).

**This app only: MADE_ABOUT_POLICY_LINE_OLD_PATH_ENABLED.** QA's live turn is undated. Here the patch path hands an undated made-about to the old path (`chat-revision.ts`), so the ported wiring never sees it: this app has no MADE_ABOUT_UNDATED_TOGETHER on main (its port, 3b0c47c5, is on the unmerged branch `claude/made-about-undated-together`). With the flag, the chat route's revision is wrapped (`withMadeAboutPolicyLine`): a field that carried the app's line and was rewritten by a made-about turn has its reference read again. Not needed in the sibling app: MADE_ABOUT_UNDATED_TOGETHER is on in its production, so its undated made-about turns take the patch path, where MADE_ABOUT_POLICY_LINE already runs.

**Still open: the dress-code line for QA's exact words.** With the fix the stale Attendance line is gone, but no Dress Code reference is written for "make it about not following the dress code": the policy reader (`forms/ca-policy.ts`, `statedIn`, `NEGATED_BEFORE`) reads "not following the dress code" as no policy named, so no section is found and none is written (never the old one). "make it about breaking the dress code policy" writes "Policy reference: Dress Code for The Company Policy, JBA Policy Manual p.15". ca-policy.ts is a protected reader; that change waits for its owner. Replay: `nov10-made-about-policy-line-dress-code-reference` (open, with `fixStatus`).

Replay cases: `src/app/api/chat/replay-pack/nov10-made-about-policy-line-cases.ts`.
