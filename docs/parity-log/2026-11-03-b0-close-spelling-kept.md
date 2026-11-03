## 3 Nov 2026: a close misspelling the manager states stays as typed — closed as working-as-designed, both apps (no change)

Replay set b0 (name invented): with a Coaching card already showing the roster
person Wren Tazelaar, the manager wrote "Her name is wren tazelaal …" and the
card took the misspelling. Traced through the chat route with production's
flags: `checkTypedEmployee` (`ai/form-proposal.ts`) gets "unchecked" from
`matchEmployeeName`, because a name the manager states is kept as typed
(`installKeptTypedNames`, `forms/employee-match.ts`), with the close roster
name in the note under the card. That is the 24 Oct 2026 n2 rule ("a close
spelling stays as typed"). Pau, 3 Nov 2026 (via QA): closed as
working-as-designed; no code and no protected-file edit. The b0 form type
(Coaching Form, as the manager typed it) also stays. Ask Sunny: the same rule;
see its own entry.
