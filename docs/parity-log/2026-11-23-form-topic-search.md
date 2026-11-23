# 2026-11-23 — forms on file by topic (FORM_TOPIC_SEARCH_ENABLED) — ported from Ask Sunny #1266

**Ported from Ask Sunny #1266 (merged as 0caa7fc78), behind this app's own switch, default off.** QA's direction
(23 Nov 2026): port the mechanism after the Sunny merge, one commit, its own off flag.

A manager asks "any forms about cash handling at my stores this month?" or "who's been written up for dress code?" and
gets the matching forms. find_past_forms with a topic (`about`) and no employee:

- reads exactly the forms the Forms Register shows this manager (`chatFormsActor`, `instanceListFilterFor`,
  `visibleInstances`, the same read as a period list), narrowed by the period and kind of form when given;
- reads those forms' saved text only (`forms/form-topic-search.ts`): the account fields, Policy Violated, and the ticked
  offense, coaching type and topics and review types, never the quoted manual or the Action Plan. The field keys are
  the same in both apps' templates;
- keeps a form when its saved text holds every word of the topic, and returns form, date, first name, store, policy and
  level, 25 at most, with counts by code (total, people, by_form) and "showing N of M";
- runs only when the manager's own words ask about forms on file (`forms_on_file_evidence`).

Default off (production-flags.json "off"); with it off, a topic-only call is refused plainly (`topic_search_off`).

**Bubbles' own:** stores, not salons; the Forms Register (the config's `formsPageName`); the result's place key is
`store`, as in this app's period list; the replay case uses this pack's staff and stores (West Dodge, Bellevue). No
Sun Tan City content was copied.
