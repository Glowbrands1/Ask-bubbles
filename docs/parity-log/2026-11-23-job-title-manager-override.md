# The manager's explicit job title overrides Woven's (23 Nov 2026, Pau's ruling via QA)

**Sibling app: needs the port, not done in this pull request.** Ask Sunny's loop has the same rule (the roster title
always wins; a typed title fills only an empty one; title_differs says what the manager called them). This session has
read-only access to the sibling repository, so QA routes the port. Port the mechanism, not this app's title list.

Pau's ruling: the card uses Woven's title by default. When the manager explicitly tells the AI to use a different title
for this person ("no, use <title>", "put her title as <title>"), the AI follows the manager.

- propose_form takes `job_title` with `job_title_evidence`: the manager's own words of this request asking for that
  title. They are checked as the other evidence fields are (answer evidence, scope "request"), and the quote must hold
  the title, typed or as the company's title list reads it. No word list over the manager's messages.
- With valid evidence, the card's job title is the manager's. It is written as the company's title list writes it when
  it is one of its titles ("AGM" → "Assistant General Manager"), otherwise as typed. Create sends it, so the saved form
  has it. The card says `job_title_set` ("Job title set to <title>, as you asked."), and title_differs is not raised.
- Without that evidence, Woven's title wins as before. A title mentioned in passing is title_differs. An empty Woven
  title is still filled from the manager's words (job_title_from_your_words).
- Rules book: a `job_title` line (only on an explicit ask; never a title in passing), and title_differs points to it.

Replay: `nov23-agent-loop-job-title-manager-override-cases.ts` (invented Fenna Prewitt and Corwin Ashby). Both override
cases fail on origin/main and pass after. Three controls pass on both: a quote that does not hold the title, a title in
passing, and the empty-Woven fill.
