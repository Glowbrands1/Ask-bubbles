# Gate-Bubbles-5: #732 BC_NOT_A_NAME_ENABLED: tests GO; HOLD for Pau (protected forms/proposal.ts, no approval on record)

- PR head 8df0327d, merged --no-ff onto main aecb3342, clean, tsc clean. Also merges clean with #739 (both edit readTypedName).
- 1 OFF + 1 ON, production env (325 flags) +/- BC_NOT_A_NAME_ENABLED; src/lib/ai, src/lib/forms, src/app/api/chat, src/app/api/forms.
- 13760 tests, OFF 759 / ON 759 failing. Changed 0. Replay: 1458 records, none differs OFF vs ON.
- The 6 cases nov10-bc-not-a-name-{on,off}-roster-{lower,sentence,caps} are status "fixed": they hold in the production arm without the flag (another reader keeps "bc" off the card) and with it. The flag changes only readEmployeeMentions (unit test, which sets the env itself). No open case turns.
- Hold: the PR edits src/lib/forms/proposal.ts (protected; Pau approves its lines, cf. #739's "ok surname particles") in readTypedName and settle(). The PR body and commits record no approval and no docs/patches file. Needs Pau's ok for those lines before merge.
- Sibling: ported from Ask Sunny's branch claude/bc-not-a-name (edcda8b2), branch only per the PR.
