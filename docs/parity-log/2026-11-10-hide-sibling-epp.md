# Bubbles-only: the six EPP templates copied from Ask Sunny are hidden here; Ask Sunny keeps them

Rebuild of #197 (QA decision 26 Oct 2026; QA's October triage, 10 Nov 2026: still offered on main 37dc1b8a, an
admin's "create an sdit epp for <employee>" gives an sdit-epp card).

The SDIT, TSD, ASD-SDIT and FTTC EPPs and both DMIT EPP readings (`sdit-epp`, `tsd-epp`, `asd-sdit-epp`, `fttc-epp`,
`dmit-epp-tsd`, `dmit-epp-dmit`) came over from Ask Sunny with the library and carry its content; Buff City Soap has no
EPP of its own yet (its metrics are deferred by Pau, 10 Nov 2026). They are added to `HIDDEN_TEMPLATE_KEYS`
(`src/config/company/forms/hidden.ts`). Config only: the templates themselves are not edited; rows, versions and any
filed form stay, and nothing lists, proposes or creates them. Removing the lines brings them back once Bubbles' own EPP
exists.

Not ported: they are Ask Sunny's own plans, and Sunny-only content stays Sunny-only. Tests:
`src/lib/forms/hidden-epp-oct26.test.ts`, `src/app/api/chat/hidden-epp-no-card-oct26.test.ts`.
