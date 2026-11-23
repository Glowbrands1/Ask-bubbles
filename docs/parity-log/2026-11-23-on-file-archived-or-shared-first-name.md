# An archived form, or one under a shared first name alone, is not on file (QA, 23 Nov 2026)

**Fix (Ask Bubbles):** `finalizedPriorsOnFile` in `src/lib/ai/agent-loop/tools.ts`.

The sibling app's live chat behind Pau's review: "create a ca for <P> she was wearing sandals at work 9/11" was saved with
"Prior actions: Corrective Action Form, Written Warning — 09/10/2026, as you said." The line came from two ARCHIVED
finalized Written CAs filed under the person's first name alone. The forms-on-file reader used `listInstances("all")`,
archived forms included, and `samePerson` matches a one-word name on its first name. Here #1089 offers forms on file
rather than adding them, so those forms would have been OFFERED.

- Now an archived form is never on file: the reader uses the "active" view and drops any row with `archivedAt`.
- A form under one word only counts as this person's only when exactly one roster person answers to that word, and it is
  this person.

Replay: `nov23-agent-loop-on-file-archived-or-shared-first-name-cases.ts`, with the invented people Briony Kask and
another Briony. Three cases fail before the fix and pass after: archived under the first name, archived under the full
name, and a shared first name. Two controls are offered as before: a unique first name and a full name.

**The sibling app:** fixed in the same session, with the rest of the fix for its live bug (prior actions only from the
manager's own words, and "as you said" only with prior_actions_evidence; the port of #1089). See its PR.
