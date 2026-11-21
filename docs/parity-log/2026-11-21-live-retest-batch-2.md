# 2026-11-21 — live re-test batch 2 (items 8–13, 17)

**To be ported to the sibling app** (its own draft pull request), except where marked: the sibling app's agent loop
has the same code and rules-book lines.

- 8 (code): a prior step keeps the manual the manager named ("JBA Policy Manual").
- 9 (instruction + code): ask who before a card that tells another person's account; the card's account uses the
  first name, as the saved write-up does.
- 10 (code + instruction): a typed store that isn't one of the manager's offers the person's Woven stores (primary
  first) and then the manager's others, asked once, never "isn't one of your stores". The alias table stays empty.
  **Bubbles only:** the chosen store now reaches the card as `locationText`; the sibling app's `buildProposal` already
  reads `answeredSalonIds`.
- 11 (code + instruction): every later turn about a team card reaches its details; "noted / added" is never said
  without a tool showing the card or saving the form.
- 12 (instruction): a shared first name is asked once, by store, keeping what the manager said.
- 13 and 17 (code + instruction): a later turn about an uncreated team card remakes that card through coach_team,
  never a staff list or "one person at a time". Woven's policies are not synced into the knowledge base (every Woven
  policy is marked unverified), so the model says it cannot search them and never writes a policy's text.
