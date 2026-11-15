#!/bin/bash
# usage: lset.sh <set> "<turn1>" ["<turn2>" ...]   — one new chat, turns in order
set_=$1; shift; conv=""; i=1
for t in "$@"; do
  out=$(./lt.sh "$set_" "$i" "$t" $conv)
  echo "$out" | grep -v '^FIRST_WORDS'
  [ -z "$conv" ] && conv=$(echo "$out" | grep -o 'CONV conv_[a-z0-9]*' | head -1 | cut -d' ' -f2)
  [ -z "$conv" ] && { echo "NO CONV - stop"; exit 1; }
  echo "-----"
  i=$((i+1))
done
