#!/bin/bash
# usage: mergeone.sh <ref>  -> merges; keep-both on the flags file only; reports other conflicts
cd /home/user/gate/r6
export GIT_AUTHOR_NAME=gate GIT_AUTHOR_EMAIL=gate@local GIT_COMMITTER_NAME=gate GIT_COMMITTER_EMAIL=gate@local
r=$1
if git merge -q --no-ff --no-edit refs/$r >/dev/null 2>&1; then echo "$r clean"; exit 0; fi
files=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
if [ "$files" = "src/lib/config/chat-quality-flags.ts " ]; then
  f=src/lib/config/chat-quality-flags.ts
  git show :1:$f > /tmp/b && git show :2:$f > /tmp/o && git show :3:$f > /tmp/t && git merge-file --union -p /tmp/o /tmp/b /tmp/t > $f
  python3 /tmp/fixflags.py; git add -A; git commit -q --no-edit; echo "$r keep-both (flags file)"; exit 0
fi
echo "$r REAL CONFLICT: $files"; exit 2
