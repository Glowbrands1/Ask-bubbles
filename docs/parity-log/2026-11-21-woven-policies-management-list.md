# Woven policies listed from the management table (board f105) — Bubbles only

**Fix (Ask Bubbles):** `WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED` (default off).
Ask Bubbles listed Woven policies from the Knowledge Center cards
(`POST /KnowledgeCenter/_Policies_List`), which carry no status and no audience,
so every policy was `publication_unverified` and none was ever searchable
("only the JBA manual counts"). With the switch on, policies are listed from
Woven's management table (`GET /Policy`): `data-status` gives publication, the
Audience column gives "Public" or a Targeted summary. A published "Public"
policy is shared (Pau's ruling, 22 Nov 2026, relayed by QA: "YES — Bubbles may
quote any company-wide ("Public") Woven policy, like Sunny"); the text still
comes from the verified Knowledge Center detail fragment.

**Ask Sunny:** not needed. Ask Sunny already lists policies from `GET /Policy`
(`src/lib/knowledge-sync/woven/adapters.ts`, `parsePolicyList`); this ports
that mechanism, and shares "Public" policies the same way. "Public" on any other
Bubbles item (File Library, communications) stays unshared (`bcs/policy.ts`).

**Not copied:** no Sun Tan City content, policy titles or company ids; the
sibling's parser is not imported (production modules may not import the
reference connector, `tenant-isolation.test.ts` #12).
