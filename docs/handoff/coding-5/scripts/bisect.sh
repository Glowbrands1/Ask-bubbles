#!/bin/bash
# usage: bisect.sh  — finds a minimal failing subset of production "on" flags (greedy halving)
T=src/app/api/forms/owner-retest-e2e.test.ts
fails() { local e=""; for f in "$@"; do e="$e $f=true"; done; env $e timeout 300 npx vitest run $T -t "mishandled cash" 2>&1 | grep -qE "Tests  1 passed" && return 1 || return 0; }
mapfile -t ALL < <(node -e 'const b=require("./src/config/production-flags.json");console.log((b.on||[]).join("\n"))')
cur=("${ALL[@]}")
# delta-debugging style: try removing chunks
n=2
while [ ${#cur[@]} -ge 2 ]; do
  size=$(( (${#cur[@]} + n - 1) / n )); removed=0
  for ((i=0; i<${#cur[@]}; i+=size)); do
    cand=("${cur[@]:0:i}" "${cur[@]:i+size}")
    if [ ${#cand[@]} -gt 0 ] && fails "${cand[@]}"; then cur=("${cand[@]}"); n=$(( n>2 ? n-1 : 2 )); removed=1; echo "now ${#cur[@]}"; break; fi
  done
  if [ $removed -eq 0 ]; then
    if [ $n -ge ${#cur[@]} ]; then break; fi
    n=$(( n*2 > ${#cur[@]} ? ${#cur[@]} : n*2 ))
  fi
done
echo "MINIMAL: ${cur[*]}"
