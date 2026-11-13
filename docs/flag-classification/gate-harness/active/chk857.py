import json,sys,re,collections
K=sys.argv[1]
def load(arm): return {(r["id"],r["mode"]):r for r in map(json.loads,open(f"{K}/{arm}-1.replay.jsonl"))}
a,b=load("off"),load("on")
CR="Create the draft here"
noask=[];asks=collections.Counter();prod=set();allc=set()
for k in a:
    o,n=a[k],b[k]
    for i,(to,tn) in enumerate(zip(o["turns"],n["turns"])):
        if to["reply"]==tn["reply"]: continue
        allc.add(k[0])
        if k[1]=="production" or k[1]=="open": prod.add(k[0])
        if CR in to["reply"] and CR not in tn["reply"]:
            m=re.search(r"[^\n]*what happened[^\n]*",to["reply"],re.I)
            if not m: noask.append((k,i,to["question"][:100],to["reply"][-300:]))
            else: asks[re.sub(r"\*\*[^*]+\*\*","X",m.group(0))[:120]]+=1
print("distinct cases",len(allc),"prod/open",len(prod))
for x,c in asks.most_common(): print(c,x)
print("CREATE LOST WITHOUT ASK",len(noask))
for x in noask: print(x)
