# f099: a form the library does not have is said so, with the forms that exist (23 Nov 2026, board f099; the old chat)

**Sibling app: needs checking, not ported in this pull request.** Ask Sunny's old chat has the same proposal path
(`server-ask.ts`, `form-full-remap.ts`'s `namesFormOutsideRemap`, `form-proposal.ts`). This session has read-only access
to the sibling repository, so QA routes the check and the port. Port the mechanism only: the sibling's own library
titles decide what is "outside", and no form name is copied.

The board: with a Coaching card open, asking for a form that doesn't exist ("store manager interview") re-offered the
Coaching card. `remapShouldRun` already kept the remap off such a turn, but the proposal flow then ran with the open
card's template and proposed it again; in a fresh chat the same words got "Which form do you need?" and the menu, with
nothing saying that form doesn't exist.

Now a turn whose own words ask for a form outside the library, and name no library title (`namesFormNotInLibrary`),
is a forms turn answered in `server-ask.ts` before the proposal flow (`form-not-in-library.ts`): "There's no <the form's
own words> form in the forms library, so I can't start it." The form's name is trimmed to the words after the article
(`formNameNotInLibrary`), never the whole message. Then the forms this person can create follow, as the chooser lists
them: the menu in a fresh chat, or, with a card on screen (whose menu NO_SELECTION_ON_OPEN_CARD leaves off), named in the
reply with "Your <form> card is still open above." No card is proposed, so the open card stays as it was.

Replay: `nov23-f099-form-not-in-library-cases.ts` (open Coaching card; fresh chat; control: "she also skipped her
interview training" stays on the card). The board's wording, as the original turns were not found. Unit:
`hidden-form-no-card-oct25.test.ts` (three expectations changed on purpose, each commented).
