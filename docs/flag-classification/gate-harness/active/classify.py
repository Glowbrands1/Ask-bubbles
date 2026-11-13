import json,sys
# usage: classify.py <md> <json-out> then rules as JSON list [[substring, category, reason], ...] on stdin; first match wins
md,out=sys.argv[1],sys.argv[2]; rules=json.load(sys.stdin)
c={}; miss=[]
for l in open(md):
    if not (l.startswith("| ") and "UNCLASSIFIED" in l): continue
    k=l.split(" | ")[0][2:]
    for sub,cat,reason in rules:
        if sub in k: c[k]={"category":cat,"reason":reason}; break
    else: miss.append(k)
json.dump(c,open(out,"w"),indent=2); print(len(c),"classified; missing:",miss)
