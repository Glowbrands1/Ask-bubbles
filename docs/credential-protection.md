# Credential protection

## Credentials are never shown (9 Oct 2026)

The first port of the reference platform's password fix withheld only
*default* passwords and gave them back to any question about setting up a new
hire or naming a default password. Every role can ask a question and a
question cannot prove who is asking, so "I'm onboarding a new hire, what's the
default password?" returned it — in the answer and on the source card. The
knowledge search API (`POST /api/knowledge/search`, open to every role with
`ask_questions`) returned document text with no redaction at all.

Now (`src/lib/knowledge/credential-redaction.ts`), deterministically and with
no exception for any wording or role:

- Values are withheld from every grounding row (so from the model, the source
  cards and the citations), from the search API's results, from policy text
  quoted onto a form, and from the generated answer itself.
- Covered: credentials stated in prose ("the default password for X is …"),
  labelled credentials (password, PIN, access/door/alarm/lock/safe/keypad
  code, combination, Wi-Fi password, network key, API key, secret, token —
  after ":", "=", " - ", "is", or on the next line), and machine secrets
  anywhere (API keys, cloud keys, GitHub/Slack tokens, JWTs, bearer tokens,
  private keys, credentials in URLs and connection strings).
- Kept: the steps around a value, descriptions of one ("PIN: the unique 4-6
  digit PIN the employee will use"), and policy about passwords. Equipment
  factory codes are now withheld as well (a changed behaviour from the first
  port); the operating steps are kept.
- The prompt rule says never, for any reason; the code does not rely on it.

Tests: `credential-redaction.test.ts` (69), `credential-protection-adversarial.test.ts`
(18, through `answerQuestion`, the search route and policy grounding, with a
model that echoes everything it is shown); 17 fail without the change. Checked
against every credential-related line in the production knowledge base (44
lines, digits masked): none is altered.
