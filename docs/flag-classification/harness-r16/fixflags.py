import re,sys
f="src/lib/config/chat-quality-flags.ts"; L=open(f).read().split("\n"); out=[]; inside=False; fixes=0
for l in L:
    if re.match(r"^export function .*\{$",l): inside=True
    elif inside and l=="}": inside=False
    elif inside and (l.startswith("/**") or re.match(r"^ \* ",l) or l.startswith("// ")):
        out.append("}"); out.append(""); fixes+=1; inside=False
        if not l.startswith("/**") and not l.startswith("//"): out.append("/**")
    out.append(l)
open(f,"w").write("\n".join(out)); print("repairs",fixes)
