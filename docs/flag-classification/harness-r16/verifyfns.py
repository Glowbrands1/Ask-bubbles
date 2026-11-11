import re,subprocess,sys
cur=open("src/lib/config/chat-quality-flags.ts").read()
def fns(s):
    out={}
    for m in re.finditer(r'(?:/\*\*(?:(?!\*/).)*?\*/\n)?export function (\w+)\(\)[^{]*\{\n.*?\n\}\n',s,re.S): out[m.group(1)]=m.group(0)
    return out
cf=fns(cur); bad=0
base=fns(subprocess.run(["git","show","origin/main:src/lib/config/chat-quality-flags.ts"],capture_output=True,text=True).stdout)
for n in sys.argv[1:]:
    pr=fns(subprocess.run(["git","show",f"refs/gate/s{n}:src/lib/config/chat-quality-flags.ts"],capture_output=True,text=True).stdout)
    for k,v in pr.items():
        if k in base: continue
        if k not in cf: print("MISSING",n,k); bad+=1
        elif cf[k]!=v: print("DIFF",n,k); bad+=1
print("checked; bad =",bad)
