# SOURCES_ON_TOPIC (Ask Sunny, 24 Nov 2026): not ported to Ask Bubbles yet

**Change in Ask Sunny.** QA's live test: "What are the top coaching priorities in a Daily Stats report?" was answered
from the coaching framework, and its only source card was the Confidential Information Policy, JBA Policy Manual p.22.
Sunny's fix (SOURCES_ON_TOPIC_ENABLED, default off, `src/lib/ai/on-topic-sources.ts`) works only on a question its
Daily Stats gate opens (`src/lib/ai/daily-stats-gate.ts`): a coaching-priorities question shows the Daily Stats
Interpretation Framework's card when the answer had it (the chat path's pinned framework; the loop's `read_stats` and
`search_knowledge`), and cards none of whose words is the question's are dropped when they would be the only ones.

**Ask Bubbles: not ported.** This app has none of the pieces the mechanism hangs on:

- no Daily Stats Interpretation Framework role (`src/lib/knowledge/document-roles.ts` and `PINNED_KNOWLEDGE_ROLES` in
  `src/config/company/knowledge.ts` pin only the Performance Management Framework);
- no Daily Stats gate on the chat path (`src/lib/ai/daily-stats-gate.ts` does not exist);
- no `read_stats` in the agent loop (`src/lib/ai/agent-loop/data-tools.ts`: "No read_stats: this app has no reports
  reader for the loop yet", Pau's decision 1).

So "cite the framework" has no framework to cite, and the "unrelated card" rule has no gate to scope it to: applied to
every question, a word-overlap check would drop legitimate cards ("can I wear a hoodie?" cites Dress Code, with no word
in common). When Bubbles gets a KPI interpretation framework or a report gate, port `on-topic-sources.ts` with it, keyed
to that gate, with a replay case in a manager's words.
