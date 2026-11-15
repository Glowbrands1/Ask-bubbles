#!/bin/bash
# usage: item38i.sh <tag> "<text>" [conv]
out=$(node turn.js s38i "$1" "$2" $3 2>&1)
echo "$out" | grep -E "^(REPLY_UTC|START_UTC|ELAPSED_S|CONV|ERR)"
f=$(ls -t ../s38i-bodies/s38i-$1-* 2>/dev/null | head -1); [ -n "$f" ] && python3 info38i.py "$f" && cp "$f" ../resp/
