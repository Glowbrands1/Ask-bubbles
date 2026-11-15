#!/bin/bash
# usage: t.sh <round> <tag> "<text>" [conv]  (needs SUNNY_EMAIL/SUNNY_PASSWORD/MASKS in env)
out=$(node turn.js "$@" 2>&1)
echo "$out" | grep -E "^(REPLY_UTC|START_UTC|ELAPSED_S|CONV|SAVED|ERR)"
f=$(echo "$out" | grep -o '"f":"[^"]*' | head -1 | cut -d'"' -f4)
[ -n "$f" ] && python3 -c "
import json; b=json.load(open('$f'))['body']; print('CONTENT>>>'); print(b.get('content')); fp=b.get('formProposal') or {}
print('FP>>>', {k:fp.get(k) for k in ('employeeName','formDate','locationName','locationResolution','warningLevel','status')})"
