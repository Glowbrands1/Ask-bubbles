## 25 Oct 2026: policy sweep citations (citation-d), all behind FULL_MANUAL_WIDE_GATE_ENABLED

QA's 71-question sweep (prod 7174fdc, FULL_MANUAL_CONTEXT on): 54 replies
showed a JBA source and no [p.N]. Those questions name no policy word, so
the manual was not in the prompt; the reply came from retrieval and its
[S#] markers were taken out before it was shown. A manual excerpt's [S#] is
cited as the printed page its sentence restates, in the sentence, with the
section as the source (`citeRetrievedAnswer`). The first PTO tier cites p.41
(a tied page counts every passage on it the sentence restates), the
jury-duty summons cites Jury Duty on p.47 (a sentence that names its section
is cited there), a marker the sentence reads through ("at [p.47]") is
re-pointed in place or goes with its word, and a passage before a page's
first heading is labelled with the section it continues. The manual is also
loaded for a question whose best retrieved excerpt is from the manual or that
names a printed heading word ("What is COBRA?"); a full-manual turn sends only
pinned documents beside the manual and is not asked again without it (parity
with Ask Sunny's code). Ported to Ask Sunny in the same session (#139's
branch there).

Rebuilt on main on 11 Nov 2026 (QA's stale-PR cleanup of #139): QA ruled
that all of it, including the parts the PR shipped unflagged, sits behind the
one new default-off flag `FULL_MANUAL_WIDE_GATE_ENABLED`. The wide gate itself
stays Bubbles-only: Ask Sunny already loads the manual for these questions
(its gate reads the intent extraction, its HR-policy words and the activity
taxonomy). The server-ask.ts lines await Coding-2. Regression test:
`src/lib/ai/full-manual-sweep-runtime.test.ts`.
