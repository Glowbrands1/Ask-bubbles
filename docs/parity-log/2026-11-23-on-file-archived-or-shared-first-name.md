# An archived form is not on file, and a first-name-only form shared at its store is not attributed (QA and Pau, 23 Nov 2026)

**Fix (Ask Bubbles):** `finalizedPriorsOnFile` in `src/lib/ai/agent-loop/tools.ts`.

The sibling app's live chat behind Pau's review: "create a ca for <P> she was wearing sandals at work 9/11" was saved with
"Prior actions: Corrective Action Form, Written Warning — 09/10/2026, as you said." The line came from two ARCHIVED
finalized Written CAs filed under the person's first name alone. The forms-on-file reader used `listInstances("all")`,
archived forms included, and `samePerson` matches a one-word name on its first name. Here #1089 offers forms on file
rather than adding them, so those forms would have been OFFERED.

- Now an archived form is never on file: the reader uses the "active" view and drops any row with `archivedAt`.
- A form filed under the first name alone IS this person's (Pau: "its right"), unless another person with that first
  name is at the form's store (Pau: "there might be other Paulynes in store, or Kim or Mary"). That means another roster
  person there, or a former employee with a form there under a fuller name. Then the form is attributed to neither. A
  form with no store recorded is checked against everyone.

Replay: `nov23-agent-loop-on-file-archived-or-shared-first-name-cases.ts`, with the invented Briony Kask and other
Brionys. Three cases fail before the fix and pass after: archived under the first name, archived under the full name, and
a first name shared at the form's store. Three controls are offered: the same first name at another store, a unique
first name, and a full name.

**The sibling app:** fixed in the same session, with the rest of the fix for its live bug (prior actions only from the
manager's own words, and "as you said" only with prior_actions_evidence; the port of #1089). See its PR.

**Superseded (Pau, 23 Nov 2026, archiving removed):** Bubbles has no archived forms any more, so the archived-form half of this entry is moot here; its archived replay/test cases were removed on purpose.
