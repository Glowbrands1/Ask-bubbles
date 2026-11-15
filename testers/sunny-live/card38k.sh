#!/bin/bash
out=$(node turn.js s38k "$1" "$2" 2>&1)
echo "$out" | grep -E "^(REPLY_UTC|START_UTC|ELAPSED_S|CONV|ERR|SAVED)" | cut -c1-200
f=$(ls -t ../s38k-bodies/s38k-$1-* 2>/dev/null | head -1); [ -n "$f" ] && cp "$f" ../resp/ && python3 -c "
import json; b=json.load(open('$f'))['body']; fp=b.get('formProposal') or {}
print('FP', {k:fp.get(k) for k in ('employeeName','formDate','status','locationResolution')})
[print('  ',l) for l in b['content'].split('\n') if any(w in l.lower() for w in ('policy','observation','other','date:','action plan'))]"
