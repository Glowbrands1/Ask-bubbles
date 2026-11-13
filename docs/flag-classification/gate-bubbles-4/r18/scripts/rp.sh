#!/bin/bash
# rp.sh <n> <ids...>: run the replay pack cases for ids in /home/user/gate/t<n> with production flags only
S=/tmp/claude-0/-home-user-Ask-bubbles/1bbdb0c7-a1db-59ae-9e95-c329a87c99b7/scratchpad
n=$1; shift; pat=$(IFS='|'; echo "$*")
cd /home/user/gate/t$n
for f in $(tr ',' ' ' < $S/prodenv-6081.csv); do export $f=true; done
unset FLAG_CLASSIFY_ON
npx vitest run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts -t "$pat" --reporter=verbose > $S/rp-$n.log 2>&1
echo "#$n rc=$? $(grep -E 'Tests ' $S/rp-$n.log | tail -1)"
