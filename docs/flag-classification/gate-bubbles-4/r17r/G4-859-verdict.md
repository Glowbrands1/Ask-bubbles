# Gate-Bubbles-4: #859 CLOSE_SPELLING_MATCH_ENABLED, head 4b8c0ead (Coding-4): NO-GO on one case, the rest GO
- Base main e5fd5b1c (395 production flags). Clean merge, tsc clean. 1 OFF + 1 ON. The ON arm drives the flag through FLAG_CLASSIFY_ON (production + flag), as Coding-4 asked.
- 15186 tests. Changed 12: INTENDED 8, INTENDED-HARNESS 2 (one pending), REGRESSION 2 (one case × its test row and replay record). Every row is one of #859's own nov13-close-spelling cases or tests. No other case or test changed: no name or roster case, no store case, no policy case outside nov13.
- Every changed case, OFF → ON:
  - (a) nov13-close-spelling-policy-anmals-in-the-workplace: "Woven does not see a section … for "anmals in the workplace"" → "**Policy:** Animals in the Workplace, as you said — the policy manual's section on page 30", with "Animals in the Workplace Policy, JBA Policy Manual p.30" and the excerpt. The heading is the manual's own.
  - (a) nov13-close-spelling-policy-vistors-at-work: → "Visitors in the Workplace … page 29", cited the same way.
  - (b) nov13-close-spelling-policy-two-headings-asks-which: "key holdr" → "Did you mean **Key Holder Guidelines** (page 60) or **Key Holder Requirements** (page 61)? Tell me which, and I'll cite it; I won't pick one for you." Neither is cited.
  - not confident: nov13-close-spelling-policy-not-confident-asks: "anmals in the wrkplace" (two words off) → "Did you mean **Animals in the Workplace** (page 30)?" Not cited.
  - REGRESSION, (a) not met: nov13-close-spelling-policy-care-and-clening ("… violating the care and clening policy, she left her station a mess at close today"). The Policy line stays "**Policy:** Other — cleaning duties left undone are recorded under Other on the Corrective Action Form, not the Standards of Conduct." in both arms, with no page and no citation. ON changes only the Action plan to "Management will review the Care and Cleaning of Equipment and Facilities policy with Marnie." The card now names a policy its own Policy line says it is not citing. The case passes because it only checks that the manual's spelling appears on the card. Two rulings meet here (cleaning left undone → Other, versus close spelling → cite the manual's heading and page); QA to decide which wins, then coding makes the Policy line and plan agree and tightens the case.
- Unchanged in both arms (hold):
  - (c) nov13-close-spelling-policy-shared-word-never-confident ("wrkplace" alone: no cite, no confident pick)
  - nov13-close-spelling-policy-exact-unchanged
  - (d) nov13-close-spelling-store-{at-kearny-ne, bare-kearny-comma-ne}: "**Store:** Kearney, NE, as you said". The store reading is the existing resolver; #859 adds no store code. An ambiguous store typo has no case in #859; the existing store suites are unchanged.
- (e) No name or roster case or test changed.
- INTENDED-HARNESS: close-spelling.test.ts "flag off: only the exact spelling names a heading" (the ON arm exports the flag); flags-off-parity "replay-pack, first half" (pending a clean-env run, as for #724 and #847).

## Delta on head ab75b8da (QA's ruling: a named policy wins over cleaning-is-Other): GO (flags-off-parity check pending)
- Merged ab75b8da onto the same tree. Every new hunk (ca-policy.ts, reply-matches-card.ts, close-policy-ask.ts, route.ts) runs only with CLOSE_SPELLING_MATCH on, so the first OFF arm still holds. New ON arm, tsc clean.
- Changed 23: INTENDED 20, INTENDED-HARNESS 3, REGRESSION 0. Every row is a nov13-close-spelling case or a close-spelling unit test, plus flags-off-parity.
- Compared with the first head's ON run, only nov13-close-spelling-policy-care-and-clening changed, and one case is new:
  - care-and-clening: "**Policy:** Care and Cleaning of Equipment and Facilities, as you said — the policy manual's section on page 21", cited "Care and Cleaning of Equipment and Facilities Policy, JBA Policy Manual p.21". The plan reads "Management will review the Care and Cleaning of Equipment and Facilities policy with Marnie". The Policy line and plan now agree.
  - new nov13-close-spelling-policy-cleaning-not-confident-keeps-other-asks ("care and clneaing"): it keeps "**Policy:** Other — cleaning duties left undone …" and adds "Did you mean **Care and Cleaning of Equipment and Facilities** (page 21)? … I won't pick one for you." The plan stays generic.
- Every other nov13 case is byte-identical to the first head (anmals/vistors cited; key holdr asks between the two; anmals in the wrkplace asks), and the store, shared-word and exact cases are unchanged.
- Pending as before: a clean-env flags-off-parity run.
