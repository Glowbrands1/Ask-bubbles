#!/bin/bash
# rp.sh <n> <ids...>: run the replay pack cases for ids in /home/user/gate/t<n> with production flags only
S=/tmp/claude-0/-home-user-Ask-bubbles/4fbceaaf-95b1-5b3c-bd6d-9b6a855a14a6/scratchpad
n=$1; shift; pat=$(IFS='|'; echo "$*")
cd /home/user/gate/t$n
for f in $(tr ',' ' ' < $S/prodenv-b972.csv); do export $f=true; done
unset FLAG_CLASSIFY_ON
npx vitest run src/app/api/chat/replay-pack/replay-pack-e2e.test.ts -t "$pat" --reporter=verbose > $S/rp-$n.log 2>&1
echo "#$n rc=$? $(grep -E 'Tests ' $S/rp-$n.log | tail -1)"
