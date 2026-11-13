#!/bin/bash
# usage: codedelta.sh <worktree> <outprefix>  — production flags of that tree, replay pack + place-answer unit test
S=/tmp/claude-0/-home-user-Ask-bubbles/36b45174-6117-53a7-898e-3ebed59a3cae/scratchpad
cd $1; W=$($S/h/prodenv.sh .)
env -i PATH=$PATH HOME=$HOME TMPDIR=$S/tmp LANG=C.UTF-8 NODE_ENV=test REPLAY_RECORD=$2.replay.jsonl FLAG_CLASSIFY_ON=$W $(echo $W | tr ',' '\n' | sed 's/$/=true/') \
  node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=$2.json --exclude src/lib/ai/flags-off-parity.test.ts --exclude '**/node_modules/**' src/app/api/chat/replay-pack src/lib/forms/off-roster-place-answer.test.ts > $2.log 2>&1
echo "exit $?" >> $2.log
