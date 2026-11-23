# The manager's explicit job title overrides Woven's (23 Nov 2026, Pau's ruling via QA): matches Ask Sunny #1251

**Sibling app: already there.** Ask Sunny #1251 (6f3447f, branch `claude/job-title-explicit-override`) built the same
rule first. QA asked this app to match its names, and it does: `job_title` + `job_title_evidence`, reason code
`job_title_not_instructed`, kept-title fact `job_title_as_you_said`, and the in-passing check `titleBesideName`. Ask
Sunny's own entry is `docs/parity-log/2026-11-23-job-title-explicit-override.md` on that branch.

Pau's ruling: the card uses Woven's title by default. When the manager explicitly tells the AI which title to put on the
form ("no, use Shift Lead", "put her title as <title>"), the AI follows the manager. A title said in passing, beside the
person's name, never does.

- propose_form takes `job_title` with `job_title_evidence` (the manager's words from this request). Code checks three
  things: the words are the manager's (answer evidence, scope "request"); they hold the title, typed, spelled out, or
  as the company's title list reads it; and they are not the title right beside the person's name (`titleBesideName`:
  the title, or the list's patterns for it, next to the full or first name with only a comma or article between).
  Otherwise `job_title_not_instructed` hands it back and Woven's title stays.
- A kept title is the card's and is what Create saves. It is written as the company's title list writes it when it is
  one of its titles ("AGM" → "Assistant General Manager"), else as typed (spelled out). The fact is
  `job_title_as_you_said`; the reply reads "**Job title:** <title>, as you said.", and title_differs is not given.
- Without it: Woven's title, as before. title_differs now offers another title, and an empty Woven title is still filled
  from the manager's words (job_title_from_your_words).
- This app's own differences from the sibling: the title list (Bubbles' Woven positions) and the placeholders in the
  rules-book examples (no person's name). This app has no rules-book fixture files or reason-codes test.

Replay: `nov23-agent-loop-job-title-manager-override-cases.ts` (invented Fenna Prewitt and Corwin Ashby). Four cases fail
on origin/main and pass after: the company-title override, the not-on-the-list override, a quote without the title
handed back, and the title beside the name handed back. Two controls pass on both: a title in passing that the model
leaves out, and the empty-Woven fill.
