#!/bin/bash
S=/tmp/claude-0/-home-user/912290dc-9393-589b-b14c-9fb4b59a3836/scratchpad; B=$S/bisect-r16c; cd /home/user/gate/r16c
BASE="CHAT_GLOSSARY_ENABLED"
while read -r ENTRY; do
  KEY=${ENTRY//,/+}; KEY=${KEY:0:90}
  [ -s $B/$KEY.json ] && continue
  FL=$(echo $ENTRY | tr ',' ' ')
  ENVS=$(for f in $BASE $FL; do echo -n "$f=true "; done); ON=$(echo $BASE $FL | tr ' ' ',')
  env -i PATH=$PATH HOME=$HOME TMPDIR=$B/tmp LANG=C.UTF-8 NODE_ENV=test $ENVS FLAG_CLASSIFY_ON=$ON REPLAY_RECORD=$B/$KEY.jsonl.part node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=$B/$KEY.json.part --exclude src/lib/ai/flags-off-parity.test.ts --exclude '**/node_modules/**' $(cat $S/r16c-files.txt) >/dev/null 2>&1
  mv $B/$KEY.jsonl.part $B/$KEY.jsonl; mv $B/$KEY.json.part $B/$KEY.json; echo "$(date +%T) $KEY" >> $B/progress.log; echo ran $KEY; exit 0
done < $S/r16c-solo.txt
echo ALLDONE; exit 3
