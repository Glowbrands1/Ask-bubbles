#!/bin/bash
S=/tmp/claude-0/-home-user-Ask-bubbles/41362221-2fed-57a9-8109-f63b71f98b64/scratchpad; cd /home/user/gate/base853
PROD=$(python3 -c "import json;d=json.load(open('src/config/production-flags.json'));print(' '.join(sorted(set(d['on']+d.get('assumedOn',[])))))")
envs=""; for f in $PROD; do envs="$envs $f=true"; done
rm -f $S/ck/base853.replay.jsonl
env -i PATH=$PATH HOME=$HOME LANG=C.UTF-8 NODE_ENV=test TMPDIR=$S/tmp REPLAY_RECORD=$S/ck/base853.replay.jsonl FLAG_CLASSIFY_ON=$(echo $PROD | tr ' ' ',') $envs node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=$S/ck/base853.json src/app/api/chat/replay-pack/replay-pack-e2e.test.ts > $S/logs/base853.txt 2>&1
echo "rc=$?"
