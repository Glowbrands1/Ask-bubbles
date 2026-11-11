## 4 Nov 2026: the abbreviation glossary — port follows (CHAT_GLOSSARY_ENABLED, default off)

QA's overnight scan, sf-s12: "I need to make a corrective action for msb" read
"msb" as an employee ("I couldn't find **msb** in the Woven roster …"). MSB is
Must See Behaviors, the reason for the form. Pau approved the glossary text
byte for byte for both apps; it is `CHAT_GLOSSARY` in `src/lib/ai/glossary.ts`
and its test (`glossary.test.ts`) pins it with the expected text written
inline, the same string the sibling app's test will use. MSB only.

With the flag on: one extra context block just before the question in the main
answering call (`server-ask.ts` → `callClaude`, input `glossary`) and at the top
of the form-intake calls' user block (`reader/read.ts`, `intent-extraction.ts`,
`form-tool-understand.ts`); no system prompt changes. A name candidate that
folds to a table term is never the employee: `namesSomebody`
(readEmployeeMentions' filter), `keepTypedPerson` (resolveEmployee's last
step), the reader's `checkEmployee`, and `writeFormEdits` (refused,
`glossary_term`). The Corrective Action intake then asks the existing one
question, "Who is this form for? Tell me the employee's full name.". The
protected `proposal.ts` and `form-proposal.ts` are not edited: the guard sits
in the non-protected helpers they already call. The overnight scan's replay
case `nov4-scan-sf-s12-msb-not-a-person` (OPEN in production) holds with
`fixFlags: ["CHAT_GLOSSARY_ENABLED"]`.

Sibling app: same readers, same main call, same intake. Not ported in this
change; the sibling-app port follows in its own pull request, with the same
flag name, the same approved text and the same inline test string.
