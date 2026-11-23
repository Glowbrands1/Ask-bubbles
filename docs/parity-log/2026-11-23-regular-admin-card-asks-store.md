# The regular chat's admin card asks which store; Create never saves one with no store (23 Nov 2026, QA after A2 #1087)

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny shares `createInlineForm` and the old chat's
every-salon card ("Your account covers every salon"). This session has read-only access to the sibling repository, so QA
routes the check and the port (store ↔ salon).

A2 (#1087) left the regular chat's admin cards as they were (QA's ruling (i)): a login that covers every store got a ready
card with `not_applicable` and "Your account covers every store, so the form won't name one", and Create saved the form
with location null. Now:

1. **The card asks which store** (`forms/every-store-picker.ts`, run last on the regular chat's answer in
   `app/api/chat/route.ts`). Such a card stays ready, but every store is offered on it to pick (`needs_selection`), as the
   loop's A2 card is. The app's own "won't name one" sentence becomes "Which store is this about? Choose the store on the
   card before you create the draft, so it is not filed with no store." A store named in the manager's words, or the
   person's one Woven store, already resolves the card and leaves it as it is. Loop cards are left to the loop.
2. **Create refuses any card with no store** (`features/chat/create-inline-form.ts`), the regular chat's as the loop's,
   unless the manager stated the form is for no store (U04's `noStoreStated`, the loop's).

The protected `location-scope.ts` and `form-proposal.ts` are unchanged. Replay:
`nov23-regular-admin-card-asks-store-cases.ts`. Expectations changed on purpose, each commented: the admin cases that
pressed Create without a store now pick one (`nov10-same-request-follow-ups`, `nov11-title-before-name`), and
`create-inline-form.test.ts`'s regular-chat admin control is now refused.
