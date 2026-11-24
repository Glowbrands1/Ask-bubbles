# 2026-11-21 — the manual's text shows "store", never "salon" (QA's live re-test, item 7 / A5)

**Stays Bubbles-only: Ask Sunny is untouched.** QA, on Pau's account with the agent loop on: "The quoted Late Opening
policy text shows the word "salon" in Ask Bubbles." The shared JBA Policy Manual says salon; Pau wants Bubbles never to
say salon. `MANUAL_DISPLAY_WORDS` in `config/company/knowledge.ts` (salon → store, salons → stores; whole words, case
kept) is applied by `lib/knowledge/manual-display-words.ts` where manual text reaches a manager: source excerpts
(`excerptTextForDisplay`), the wording the loop's read_policy gives the reply to quote, the policy-change reply's quote,
and a form's saved Direct policy (the draft route and `chat-policy-change.ts`, wording lines only; the Source line stays
as printed). Never the stored chunks, retrieval queries, manual titles or headings.

Ask Sunny's manual and app both say salon, so the sibling needs nothing. If the module is ever ported, the sibling's
config gives an empty `MANUAL_DISPLAY_WORDS`.

Known gaps (old chat path, loop off): the answering model is given the full manual as stored, so a free-text answer may
still quote "salon" (the source cards under it read store); and the card's "Policy cited from the JBA Policy Manual"
block (`violation-policy.ts`, a protected module) still quotes the chunk as stored.
