# 2026-11-21 — the six EPP forms are hidden in Ask Bubbles

**Stays Bubbles-only: Ask Sunny keeps its EPPs.** Pau, via QA2: the EPP forms (sdit-epp, tsd-epp, asd-sdit-epp, fttc-epp,
dmit-epp-tsd, dmit-epp-dmit) are plans for the sibling company's roles; Buff City Soap does not use those roles and
none has ever been saved here. They join `HIDDEN_TEMPLATE_KEYS` (hide only: no rename, no delete, reversible), so the
template list, the chooser, the chat's forms library and proposals, and the create API leave them out; asking chat for
"an EPP" or "SDIT EPP" opens none. The agent loop's `creatableTemplates` must read the same filtered list when it is
ported (told to the loop's coder).
