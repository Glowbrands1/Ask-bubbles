import json,sys,difflib
# usage: rdiff.py <keptdir> <case-id-prefix> [mode]
K,pref=sys.argv[1],sys.argv[2]; mode=sys.argv[3] if len(sys.argv)>3 else None
def load(arm):
    out={}
    for l in open(f"{K}/{arm}-1.replay.jsonl"):
        r=json.loads(l)
        if r["id"].startswith(pref) and (mode is None or r["mode"].startswith(mode)): out[(r["id"],r["mode"])]=r
    return out
a,b=load("off"),load("on")
for k in sorted(a):
    o,n=a[k],b.get(k)
    if n and o["ok"]==n["ok"] and [t["reply"] for t in o["turns"]]==[t["reply"] for t in n["turns"]]: continue
    print(f"=== {k[0]} [{k[1][:40]}] off ok={o['ok']} on ok={n and n['ok']}")
    if n and not n["ok"]: print("   ON error:", (n.get("error") or "")[:400])
    for i,(to,tn) in enumerate(zip(o["turns"],n["turns"] if n else [])):
        if to["reply"]==tn["reply"]: continue
        print(f"  turn {i+1} Q: {to['question'][:200]}")
        for d in difflib.unified_diff(to["reply"].split("\n"),tn["reply"].split("\n"),lineterm="",n=0):
            if not d.startswith(("---","+++","@@")): print("    ",d[:260])
