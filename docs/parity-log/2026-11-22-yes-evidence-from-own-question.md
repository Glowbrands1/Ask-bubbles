# The evidence for "yes" to the app's own "… for <P> … Is that the one you mean?" (22 Nov 2026, QA's follow-up, both apps)

**Sibling app: needs the port, not done in this pull request.** QA logged this for both apps. Ask Sunny's
`formsOnFileAskedFor` (bca3bca, #1219) has the same gap. This session has read-only access to the sibling repository, so
QA assigns the port. Port the mechanism only.

In 1 of 6 live runs of the port of bca3bca (#1051), the model found the form by date and asked "I found a Corrective
Action Form dated 11/20 for <P> for lateness. Is that the one you mean?", and the manager's "yes please" was refused as
privacy_not_this_person. The port reads only the app's reply right before the QUOTED message. Here the model quoted
either the manager's earlier request (which names nobody, so there is no reply before it) or the app's own question
(which `verifyEvidence` refuses, since the app's turns carry no id the model sees).

Now, in `agent-loop/tools.ts`:
- `formsOnFileAsked` accepts the app's own question right before the message being answered. The model quotes it under
  that message's id (or the question's own id), and the quote must really be in it. The ask is then the manager's reply.
- `formsOnFileAskedFor`: when the cited manager turn names nobody, the app's question right before the current message
  names this person, and no manager turn from the cited one to now names anyone, the ask is about them.

The person only ever comes from the app's own question in this request.

Replay: `nov22-agent-loop-yes-evidence-from-own-question-cases.ts` (invented Fenna Prewitt / Ozren Brack). The two
"opens" cases fail before and pass after. The two controls (Ozren's forms; another person named in between) stay closed.
