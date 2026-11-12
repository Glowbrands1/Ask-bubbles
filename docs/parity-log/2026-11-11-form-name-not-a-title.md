## 11 Nov 2026: FORM_NAME_NOT_A_TITLE_ENABLED — Ask Sunny only

**Not ported to this app: the EPP templates it would act on are the sibling app's, and they are being hidden here.**

QA's prod-env reading (10 Nov 2026, D5) found it in this app's `ai/store-woven-form-flow.test.ts`. "Create an SDIT EPP
for <name> at Store 236" set the card's Job Title to "SDIT" (and a TSD EPP to "TSD"). `statedJobTitle`
(`forms/proposal.ts`) read the requested form's own name as the employee's title, and TYPED_NAME lets a stated title
beat Woven's.

Ask Sunny has the same defect in `extractJobTitle` and is fixed there behind FORM_NAME_NOT_A_TITLE_ENABLED (a title word
straight before "EPP" is the form's name; a later mention of the person's title still is one).

Here the only EPP templates (`sdit-epp`, `tsd-epp`, `asd-sdit-epp`, `fttc-epp`, `dmit-epp-tsd`, `dmit-epp-dmit`) are the
sibling company's programs. They are being hidden in this app (#197 rebuild), and this app has no EPP of its own whose
name collides with a job title. QA ruled (11 Nov 2026): a parity entry, not a port. If this app gets an EPP of its own
named after a position, port the mechanism then.
