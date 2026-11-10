# Gate harness notes, round 17 (Gate-Bubbles, new account)

Use with docs/flag-classification/harness/ and harness-r16/ on claude/new-session-uvp0de. Copy both into one `$SCRATCH/harness/` dir (harness-r16 overrides harness).

Gotchas found re-running in a fresh sandbox:
- The r16 step/solo scripts hardcode the OLD scratchpad path. Replace it with your own (these copies use `$SCRATCH`; substitute the real path, or export it).
- `RESUME_DIR` must exist before the first step: flag-classify-resume.ts writes the checkpoint with writeFileSync and dies (ENOENT) after a full 15-min run otherwise. loop-r17b.sh does `mkdir -p` first. If it already died, copy `off-1.json` + `off-1.replay.jsonl` from the kept TMPDIR dir into RESUME_DIR and the run is reused.
- `--with $(cat .../prodenv.csv)`: point it at `$SCRATCH/harness/prodenv.csv` (the old script read it from the scratch root).
- Re-gating a release head whose production-flags.json already lists the flags: `git checkout <pre-flip commit> -- src/config/production-flags.json src/app/api/chat/replay-pack/production-fixes.ts` (uncommitted) so OFF = production.
- Release heads: build on current main; if the gated preview's merges conflict in chat-quality-flags.ts, merging the already-resolved preview branch onto main avoids redoing it (main must not touch that file).
- rdiff.py `<kept dir> <case id …>`: full OFF vs ON reply diff per turn (show.py truncates). For attribution, compare each solo `.jsonl` against off/on records.
- A 3+3 is ~90 min here (OFF ~13.5 min, ON ~16 min per run); solo runs on the touched test files ~8 min each.
