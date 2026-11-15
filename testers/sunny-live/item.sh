#!/bin/bash
# usage: item.sh <tag> "<text>" — one fresh-chat send, then salon fields + card Salon line
out=$(node turn.js s38h "$1" "$2" 2>&1)
echo "$out" | grep -E "^(REPLY_UTC|START_UTC|ELAPSED_S|CONV|ERR)"
f=$(ls -t ../s38h-bodies/s38h-$1-* 2>/dev/null | head -1); [ -n "$f" ] && python3 info.py "$f" && cp "$f" ../resp/
conv=$(echo "$out" | grep -o 'CONV conv_[a-z0-9]*' | cut -d' ' -f2); [ -n "$conv" ] && node salon.js "$conv"
