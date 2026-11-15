#!/bin/bash
# usage: item38j.sh <tag> "<text>" [conv]
out=$(node turn.js s38j "$1" "$2" $3 2>&1)
echo "$out" | grep -E "^(REPLY_UTC|START_UTC|ELAPSED_S|CONV|ERR)"
f=$(ls -t ../s38j-bodies/s38j-$1-* 2>/dev/null | head -1); [ -n "$f" ] && python3 info38j.py "$f" && cp "$f" ../resp/
conv=${3:-$(echo "$out" | grep -o 'CONV conv_[a-z0-9]*' | cut -d' ' -f2)}; [ -n "$conv" ] && node salon.js "$conv"
