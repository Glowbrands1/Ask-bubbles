## 10 Nov 2026: a new person's coaching card never takes the previous person's date (#236) — not needed here

The sibling app's October pull request #236 (conv_mvoetxo92fraflz, still live there on 10 Nov 2026): after <A>'s
coaching card for an incident on 10-16-26, "create a coaching document for <B>" gave <B> a card dated 10/16/2026 and
asked which of <A>'s dates (9/28, 10/16) goes on <B>'s form. The sibling's fix is CROSS_PERSON_DATE_OWN_TURNS_ENABLED
(ask-sunny 2732494e): the intent read's earlier facts and a Coaching Form's date come from <B>'s own turns.

This app holds with production's flags (replay, 10 Nov 2026): <B>'s card carries no date of <A>'s and asks nothing
about them. The sibling's chat is added here as nov10-cross-person-date-{lower,sentence,caps}, a guard.

Not the same bug: this app's #166, <B>'s Corrective Action card carrying <A>'s "no payroll deduct", is still live
here. It is pinned as the open replay case nov10-cross-person-payroll-*, and fixed separately.
