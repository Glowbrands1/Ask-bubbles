# A2: an admin's card never saves a form with no store (23 Nov 2026, QA's live re-run on 9340334 + #1072)

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny shares `createInlineForm` and the loop's
store paths (salon ↔ store). This session has read-only access to the sibling repository, so QA routes the check and
the port.

A2 (admin/global; the person terminated in Woven; no store named): the card never asked which store, and Create saved
the draft with location null. #1072's Create guard blocked only a card that was asking.

1. **The card asks** (`agent-loop/tools.ts`). An admin's card with no store gets the person's one Woven store (an active
   person's, or a former employee's as U26 reads it). With none or several, it asks which store, with every store
   offered, as a global non-admin's card does (U29). The rules book's which_store line now covers an admin too. For a
   former employee, Woven's primary store is not readable: the directory facts drop terminated rows, as in production.
   So A2's person is asked about, which the tester listed as acceptable.
2. **Create refuses any agent-loop card with no store** (`features/chat/create-inline-form.ts`), with the same one-line
   answer, unless the manager stated the form is for no store. That is U04's no_store: the card carries `noStoreStated`,
   set server-side by propose_form, so "Filed with no store, as you said." still works. The regular chat's admin cards
   (`not_applicable`, "your account covers every location") are left as they are, by QA's ruling; an every-store picker
   for them is on Monday's list.

Replay: `nov23-agent-loop-a2-admin-no-store-asks-cases.ts` (A2 verbatim, masked as Wren Tollefsen; a former employee with
no store; a former employee at one store; an active person at two stores). The U04 case and the f140 cases are the
controls. Unit: `create-inline-form.test.ts` (A2 refused; U04 created; the regular chat's admin card created).
