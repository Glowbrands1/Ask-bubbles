## 14 Nov 2026: ON_FILE_LINE_NOT_THE_POLICY_ENABLED stays Ask Sunny only (for now)

The sibling app's live bug (Pau's morning scan, 13 Nov 2026 22:40-22:45Z, via QA): a dress-code request sent again
word for word was carded "Policy: Late Opening — read from this request". Its intent reader (INTENT_EXTRACTION) reads the
whole chat, the app's own replies included; with no policy in the manager's words it took the heading the app's "On file"
listing named (a Late Opening CA on file), the app wrote it onto the turn as "Policy reference: Late Opening …", and the
card read it as the request's policy. Fixed there behind ON_FILE_LINE_NOT_THE_POLICY_ENABLED (`ai/on-file-heading.ts`,
`ai/intent-extraction.ts`; Glowbrands1/ask-sunny branch `claude/on-file-line-not-the-policy`).

Ask Bubbles was checked on `main` 2d83917d through the real chat route with production's flags, the same 4-turn chat with
an invented person, the same Late Opening CA on file, the live "On file in the Forms Register" line on each reply and the
reader's Late Opening heading scripted on the resent turn: no card names Late Opening. INTENT_EXTRACTION_ENABLED is off in
this app's production, so the reader whose heading carried the listing's policy never runs. Not ported: the mechanism
(`headingOnlyOnFile`, the guard after `decideIntentTurn`) ports as is if INTENT_EXTRACTION is switched on here; with it on
in the harness this chat stops earlier on another invariant ("I still need" without a question), so the port could not be
shown to change anything today.
