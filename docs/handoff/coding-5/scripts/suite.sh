#!/bin/bash
# usage: suite.sh <key> <worktree>
S=$SCRATCH
k=$1; d=$2; cd $d
[ -z "$(git status --short)" ] && echo "$k CLEAN" || echo "$k DIRTY"
npx vitest run --reporter=json --outputFile=$S/$k.json > $S/$k.log 2>&1; echo "$k exit $?"
node -e "const r=require('$S/$k.json');console.log(r.numPassedTests,r.numFailedTests);r.testResults.flatMap(f=>f.assertionResults.filter(a=>a.status==='failed').map(a=>f.name.split('/src/')[1]+' :: '+a.fullName.slice(0,160))).slice(0,15).forEach(x=>console.log(x))"
echo "$k head $(git rev-parse HEAD)"
