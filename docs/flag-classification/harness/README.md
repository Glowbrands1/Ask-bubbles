# Gate harness (scratch tools used for the 7 Nov 2026 Bubbles gates)

Dev-only helpers around the pre-flip 3+3 gate. Nothing here runs in CI or touches a model, a database or Vercel. Every child run uses a clean env (PATH, HOME, TMPDIR, LANG, NODE_ENV=test).

## Set up
- Make a detached worktree at the exact sha or tree QA names: `git worktree add --detach <dir> <sha>`. Then `ln -s <repo>/node_modules <dir>/node_modules`, after checking that `package-lock.json` matches.
- `export GATE_TREE=<dir> GATE_SCRATCH=<a scratch dir>`. Run everything from `$GATE_TREE`.
- **Preview tree:** start from the base sha, run `git fetch origin pull/N/head && git merge --no-edit FETCH_HEAD` for each PR in order, and `git merge --abort` (record the PR) on a conflict. Report `git rev-parse HEAD^{tree}`.

## The 3+3 gate
- `flag-classify-gate.ts` is the sibling app's `scripts/flag-classify.ts` (it has `--and`; this app's copy does not). It adds one thing: `GATE_NAME` sets the output name.
- `flag-classify-reuse.ts` adds `REUSE_OFF=<a kept dir>`, which copies `off-N.json` and `off-N.replay.jsonl` from a run with an identical OFF instead of running OFF again.
- Command:

```bash
GATE_NAME=R3B TMPDIR=$GATE_SCRATCH/tmp-x node <harness>/flag-classify-gate.ts \
  --flag <FIRST> --and <REST,comma> \
  --with CHAT_GLOSSARY_ENABLED[,<live flags not yet in production-flags.json>] \
  --runs 3 --keep src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms
```

- **OFF** = `src/config/production-flags.json` (the replay pack forces its "on" list true) + `--with`. **ON** = OFF + `--flag`/`--and`.
- An env var cannot turn off a flag the file lists as on. To get OFF without it, move it to "off" in the worktree's copy, uncommitted, and say so in the report.
- Seed `docs/flag-classification/<NAME>.classes.json` from earlier gates, without their REGRESSION rows. Seeds are hints: re-read every changed row.
- `--keep` leaves the kept dir (`off-N.json`, `on-N.json`, `*.replay.jsonl`) in TMPDIR. All the scripts below read it.

## Classify, bisect, scan
- **show.py** `<kept dir> <case id …>`: OFF vs ON turns, [production] mode.
- **bisect5.sh / bisect-r3.sh**: each flag alone (the OFF env + that flag, one run). bisect5 runs the changed files; bisect-r3 runs all four paths with the 18 flip-6 flags as the base. Edit the flag-list file names and base flags for the next gate.
- **attrib5.py** `<kept dir> <bisect dir> <flags file> <NAME.md> <out.json>`: for each changed row, the flag(s) whose solo run reproduces it. Rows with no single flag are interactions: run groups, then minimize.
- **minimize.py** `<test file> <-t pattern> test|record <test substring | "id [mode]"> <off jsonl|-> FLAG,FLAG,…`: greedy removal down to the minimal flag set that still reproduces one change.
- **Solo scan:** compare each shipped flag's solo run against OFF for passed→failed rows the combined run hides. A partner flag can mask a regression (SALES_SHORTFALL_OBJECT without SALES_OBSERVATION_ACCOUNT).
- **scan.py** `<kept dir>`, the record scan:
  - empty replies
  - artifact strings (undefined, null, NaN, `<name>`, `{{`)
  - scrubbed app words, "applicable company policy", 401k or retirement text, streamed envelopes, another company's words
  - offered names ("use **X**") per run, which must be identical across runs
- **Also check in the records:**
  - the same question asked twice in a row (new in ON?)
  - new "draft … for" names, lost Policy lines, an Issue that starts with at/on/for
  - the completion check: the off-roster/offer records are ok, an offer with a follow-up ends READY, and no near miss is offered "use"

## Classes
- **INTENDED**: an OPEN case that now holds, or a reply that changes as the flag means it to (read).
- **INTENDED-HARNESS**: a flag's own off-pin, a byte or prompt identity test, or a test whose "off" half assumes an unset env.
- **REGRESSION**: put it against the single flag that causes it.
- **FLAKY** is automatic. **UNCLASSIFIED**: nothing ships until it is 0.

## Limits
- A 3+3 takes about 40–45 min on 4 cores. Run one heavy job at a time: two together caused spawn timeouts.
- The replay pack stubs the models. A clean gate does not prove the live model path: CA_REQUEST_NOT_PRIOR_COACHING held in replay and was rolled back live. Check a flag that changes model-facing routing live, or add a case built from the live reply.
