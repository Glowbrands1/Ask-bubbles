#!/bin/bash
S=${GATE_SCRATCH:?set GATE_SCRATCH};  B=$S/bisect5; mkdir -p $B/tmp; cd "${GATE_TREE:?set GATE_TREE}"
for F in $(cat $S/flip5-flags.txt); do
  [ -s $B/$F.json ] && continue
  env -i PATH=$PATH HOME=$HOME TMPDIR=$B/tmp LANG=C.UTF-8 NODE_ENV=test CHAT_GLOSSARY_ENABLED=true $F=true FLAG_CLASSIFY_ON=CHAT_GLOSSARY_ENABLED,$F REPLAY_RECORD=$B/$F.jsonl.part node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=$B/$F.json.part $(cat $S/f5-files.txt) >/dev/null 2>&1
  mv $B/$F.jsonl.part $B/$F.jsonl; mv $B/$F.json.part $B/$F.json; echo "$(date +%T) $F done" >> $B/progress.log
done
echo ALLDONE >> $B/progress.log
