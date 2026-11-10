# Off here on purpose, but its off-reason is fixed: SENSITIVE_DEFAULTS_REDACT_ENABLED (live in the sibling app)

QA's round-6 flag audit (8 Nov 2026). The flag is off in this app's production; the Vercel variable's comment says it
spliced a canned "default password formats or Social Security digits" sentence into ordinary Paycor/Revel answers.

That bug is fixed in code, here and in the sibling app (the module `ai/sensitive-defaults.ts` is the same in both):
QA live, 26 Oct 2026, found the note spliced into "whats our password policy", "how do i reset my paycor password",
"How do I reset my Revel password" and others, and `src/lib/ai/password-note-scope-oct26.test.ts` now asserts that
each of those questions reads the same with the flags on as off, with no note and no "default password formats" or
"social security" sentence; the manual's own "Do not use default passwords" rule still reaches the model. All six
`src/lib/ai/password-*.test.ts` files pass on main e7a7ba9c (333 tests). The flag is live in the sibling app.

So no ticket. Whether to turn it on here is QA's call: it needs a gate run with the flag on and a live check of the
Paycor, Revel and myGLOW reset questions and "whats our password policy" against this app's real knowledge base,
which the tests cannot see.
