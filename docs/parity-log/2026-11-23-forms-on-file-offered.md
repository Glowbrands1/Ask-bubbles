# Forms on file are offered, never added to Prior actions by the AI (Pau, 23 Nov 2026)

**Fix (Ask Bubbles):** `src/lib/ai/agent-loop/tools.ts`, `card-record.ts`, `run.ts`, `rules-book.ts`.

Pau's ruling reverses the old f029 behaviour. The card's Prior actions hold only steps the manager stated: typed, or
accepted with a yes to the app's offer. propose_form no longer fills Prior actions from `finalizedPriorsOnFile`. When
this person has finalized forms on file from before the incident (the #1083 date filter still applies), the result
carries `prior_on_file.ask_exactly`, e.g. "<Name> has a Verbal CA on file from 10/02/2026. Want me to add it to Prior
actions?". The rules book tells the model to end its reply with it. The card record keeps the offered dates
(`onFileOffered`). A later propose_form for the same person that lists the form's line or date (the manager's yes)
keeps it, and a step added later never removes a form the card already holds.

Replay: `nov23-forms-on-file-not-added-offered`, `nov23-forms-on-file-model-adds-unasked-not-kept`,
`nov23-forms-on-file-yes-adds-it`, `nov23-forms-on-file-manager-typed-step-lands`. These cases were updated to the
ruling, each with a comment: `nov21-agent-loop-prior-actions-from-file-never-as-you-said`,
`nov21-agent-loop-include-in-prior-actions-adds-only-there`, `nov22-a13-adding-prior-step-keeps-on-file-line`,
`nov23-u09-forms-on-file-before-incident-only`.

**The sibling app: same behaviour, port pending.** Its propose_form still fills Prior actions from the forms on file
and makes no offer. The port carries the mechanism (offer fact, the offered dates on the card record, the rules-book
line), not this app's wording. It goes to the sibling's coder through QA, titled `Port from Ask Bubbles (<sha>): …`.
