# 2026-11-21 — a card's person is named by the manager in this request: ported, default off

**Ported from the sibling app (c3a2350, #1193).** Behind CARD_PERSON_THIS_REQUEST_ENABLED (same name in both apps, default
off, listed "off" in `src/config/production-flags.json`). The outside audit's wrong-person risk (approved by Pau,
21 Nov 2026; it happened in this app on 18 Nov 2026): the agent loop's `personNamedOrPicked` seated a roster person when
any manager turn in the chat held their name, or any earlier card in the chat was theirs. With the flag on, a person is
seated only when:

- the manager named them in this request: the turn that asks, or a manager turn after the chat's last card and after the
  last manager turn that named a different roster person (`ai/agent-loop/person-in-request.ts`), which keeps the f059
  story-then-ask flow; or
- a recorded confirmation (a spelling confirmed, a name question answered), the card on screen or the open draft; or
- an earlier card for them, only while no different person was named since.

A name the model passes that is nobody on the roster is taken only from the manager's words of this request; otherwise
the loop asks who the form is for. The app's own replies and tool notes were never read by these checks and still are
not. With a card on screen, this chat's latest card or a draft open for one person, a card for a DIFFERENT person is made
only when the manager's own words ask for another form (`new_form_evidence`, this message) or correct the person: a
person named inside an account ("<Y>, the store manager, messaged <X> …") never takes the form from <X> (QA2's 17 Nov
case, this app's old path, conv_mwk2t40v27izanu; reason `person_change_not_asked`).

Differences from the sibling app: this app's loop has no `reason-codes.test.ts` and its `flags-off-parity.test.ts` keeps
no new-flags list, so neither is touched; the replay cases turn the loop on through `t.loopModel` (this app's pack) and
list only the new flag in `fixFlags`. Replay: `nov21-agent-loop-card-person-this-request-cases.ts`, the loop roster's
invented people at the pack's store. The old chat path is not touched (as in the sibling app).
