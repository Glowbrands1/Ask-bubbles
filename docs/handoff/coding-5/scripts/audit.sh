#!/bin/bash
cd "$1"; git fetch -q origin main
for num in $2; do
  if ! git fetch -q origin "refs/pull/$num/head:refs/remotes/pr/$num" 2>/dev/null; then echo -e "$num\tNOFETCH"; continue; fi
  ref=refs/remotes/pr/$num; base=$(git merge-base origin/main $ref)
  ahead=$(git cherry origin/main $ref | grep -c '^+')
  files=$(git diff --name-only $base $ref | wc -l)
  added=$(git diff $base $ref -- src/lib/config/chat-quality-flags.ts | grep -oE '^\+.*envFlag\("[A-Z0-9_]+"' | grep -oE '"[A-Z0-9_]+"' | tr -d '"' | sort -u)
  fl=""; for f in $added; do if git grep -q "envFlag(\"$f\")" origin/main -- src/lib/config/chat-quality-flags.ts; then fl="$fl $f:main"; else fl="$fl $f:NEW"; fi; done
  c=$(git merge-tree --write-tree origin/main $ref >/dev/null 2>&1 && echo ok || echo CONFLICT)
  age=$(git log -1 --format=%cs $ref)
  echo -e "$num\tahead=$ahead\tfiles=$files\t$c\t$age\t$fl"
done
