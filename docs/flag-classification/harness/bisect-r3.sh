#!/bin/bash
S=${GATE_SCRATCH:?set GATE_SCRATCH};  B=$S/bisect-r3; mkdir -p $B/tmp; cd "${GATE_TREE:?set GATE_TREE}"
BASE=$( (echo CHAT_GLOSSARY_ENABLED; cat $S/flip5d-flags.txt) | tr '\n' ' ')
for F in $(cat $S/r3-flags.txt); do
  [ -s $B/$F.json ] && continue
  ENVS=$(for f in $BASE $F; do echo -n "$f=true "; done); ON=$(echo $BASE $F | tr ' ' ',')
  env -i PATH=$PATH HOME=$HOME TMPDIR=$B/tmp LANG=C.UTF-8 NODE_ENV=test $ENVS FLAG_CLASSIFY_ON=$ON REPLAY_RECORD=$B/$F.jsonl.part node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=$B/$F.json.part --exclude src/lib/ai/flags-off-parity.test.ts --exclude '**/node_modules/**' src/lib/ai src/lib/forms src/app/api/chat src/app/api/forms >/dev/null 2>&1
  mv $B/$F.jsonl.part $B/$F.jsonl; mv $B/$F.json.part $B/$F.json; echo "$(date +%T) $F done" >> $B/progress.log
done
echo ALLDONE >> $B/progress.log
