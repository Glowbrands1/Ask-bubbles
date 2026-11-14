# G4-849 verdict (claude/reland-849 @1563370e on main 9e899d73)

Per flag:
- POLICY_DASH_LINE_PAGE_ENABLED: GO. The open case nov12-17q-1 holds ("Standards of Conduct (JBA Policy Manual p.12) — ringing up a sale inaccurately").
  Visible side effect, in 151 replay rows: every "**Policy:** Standards of Conduct — <what>" card (sales, MSB, wrong items) now has a page, so the card cites a known section. POLICY_CITATION, which is on in production, then appends the Standards of Conduct excerpt block, as it already does for "…, as you said" lines. No case changes outcome.
  Test to fix before the flip: the policy-page-on-card.test.ts guard on main lists "**Policy:** Attendance — missing the monthly meeting …" as unchanged; with the flag on, that line gets p.14.
- ADDED_ACCOUNT_ON_CARD_ENABLED: NO-GO. It is redundant on main: CARD_CHECKED_AGAINST_WORDS (bce91f8, in production) already puts "she also …" on the card, and this flag adds the fact a second time.
  Cases: nov12-17q-7-also-left-register-unlocked-on-card, nov13-17rc-added-detail-kept-on-card, nov8-policy-set-aside-stays-off (5 rows).
  Example: "**Issue:** she was late on 11/…; she left the register unlocked. She also left the register unlocked".
  Recommendation: drop it from #849, or never flip it.

Run: 1 OFF + 1 ON, 15570 tests; 779 failing off, 784 on. 161 changed: INTENDED 2, INTENDED-ADJACENT 151 + 1 (test guard), INTENDED-HARNESS 3, REGRESSION 5.
Eval with both flags: 35/35; b12 is the main baseline fail, in both columns; p50 103 ms off / 101 ms on.

## Delta on claude/reland-849 @396d8142 (QA's ruling, 05:09Z: this version ships; #895 superseded)
- ADDED_ACCOUNT_ON_CARD is dropped (module, test, route step, flag). Both item 7 cases are status fixed (fixFlags CARD_CHECKED_AGAINST_WORDS), and case 7 also asserts the register appears once. The production-fixes.ts entry is removed.
- The Attendance dash line moved to POLICY_DASH_LINE_PAGE's flag-off case.
- tsc 0, eslint clean.
- policy-page-on-card: 19/19 off. With the flag on, 18/19; the one failure is the WORN_CLOTHING off-test, which is harness-only (WORN_CLOTHING is on in production).
- Replay pack, production flags: OFF 1933 pass, 24 expected fail, 0 fail. ON (POLICY_DASH_LINE_PAGE): 1933 pass, 23 expected fail, 1 "Expect test to fail" = nov12-17q-1, the open case holding, harness-only.
- Verdict: POLICY_DASH_LINE_PAGE GO @396d8142.
