import json,sys,difflib,collections,re
K=sys.argv[1]
def load(arm):
    return {(r["id"],r["mode"]):r for r in map(json.loads,open(f"{K}/{arm}-1.replay.jsonl"))}
a,b=load("off"),load("on")
cnt=collections.Counter(); cases=collections.defaultdict(set)
ASK=re.compile(r"what happened",re.I)
newask=[];lostask=[]
for k in a:
    o,n=a[k],b.get(k)
    if not n: continue
    for i,(to,tn) in enumerate(zip(o["turns"],n["turns"])):
        if to["reply"]==tn["reply"]: continue
        for d in difflib.unified_diff(to["reply"].split("\n"),tn["reply"].split("\n"),lineterm="",n=0):
            if d.startswith(("---","+++","@@")): continue
            key=re.sub(r"\*\*[^*]+\*\*","**X**",d)[:160]
            cnt[key]+=1; cases[key].add(k[0])
        ao=bool(ASK.search(to["reply"])); an=bool(ASK.search(tn["reply"]))
        if an and not ao: newask.append((k,i,to["question"][:120]))
        if ao and not an: lostask.append((k,i,to["question"][:120]))
for key,c in cnt.most_common(40): print(c,len(cases[key]),key)
print("NEW ASK", len(newask)); [print(" ",x) for x in newask]
print("LOST ASK", len(lostask)); [print(" ",x) for x in lostask]
