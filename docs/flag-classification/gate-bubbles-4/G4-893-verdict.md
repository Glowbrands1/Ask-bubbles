# G4-893 verdict: CARD_ACCOUNT_DROPS_NON_FACTS_ENABLED @2f880fe9 (merged on main 9e899d73) — NO-GO

1 OFF + 1 ON on production's flags (413): 15651 tests; 779 failing off, 809 on. 72 changed: INTENDED 30, INTENDED-HARNESS 2, REGRESSION 40.

- INTENDED: all 15 of #893's open cases hold (three-turn QA case + probes 1–14: hedges, denials, history, role and store dropped; the fact kept).
- REGRESSION (live behaviour changes with the flag on):
  1. 11 main guards of CARD_CHECKED_AGAINST_WORDS (live) fail:
     - "she works at West Dodge" (also "West Dodg", "Omah") now adds "she works" as a fact;
     - "then she walked out" loses "then";
     - joined facts are rewritten: "…and left early" -> "…and she left early", "skipped half of it" -> "she skipped…", "argued" -> "she argued".
  2. Holding replay cases get a new Issue on production's path:
     - "I need a corrective action form for Wynne Sarrow for counting the drawer early…" (sf-b6, 3 cases × 2 modes);
     - the pasted review "Below in UPT, Average Sale, Conversion but i need it to be in the format of Tamsyn ca…" (b4 / sf-s22, 3 cases × 2);
     - "the meeting was actually on 10-19-26; sorry, the verbal ca was on 9-2-26 not 9-2-26" (corrected-date q6);
     - "for Late Opening…" / "for not attending…" (leading "for");
     - "She had 24 transactions and She was below in … and She units per transaction" (nov2-p1a);
     - "Team Member; he was late…".
  3. e2e: corrective-action-dm-feedback ("no payroll deduct" keeps the Issue: "for violating visitors at work policy…") and owner-retest (person correction keeps the account) fail.
- Eval: 35/35; b12 baseline fail both columns; p50 119/118 ms.
- vs 17z (65b7951d): conflicts only in chat-quality-flags.ts. vs #890: chat-quality-flags.ts + incident-issue.ts.
