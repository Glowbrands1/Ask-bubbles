import json,difflib,sys
ck=sys.argv[1]; ids=sys.argv[2:]
def load(m): return {(r["id"],r["mode"]):r for r in map(json.loads,open(f"{ck}/{m}-1.replay.jsonl"))}
o,n=load("off"),load("on")
for k in sorted(n):
  if ids and k[0] not in ids: continue
  a,b=o.get(k),n[k]
  if a and json.dumps(a["turns"])==json.dumps(b["turns"]) and a["ok"]==b["ok"]: continue
  print("=====",k[0],"|",k[1][:40],"| off ok",a and a["ok"],"| on ok",b["ok"])
  if a and a["error"]: print("  off err:",a["error"][:300].replace("\n"," / "))
  if b["error"]: print("  on err:",b["error"][:300].replace("\n"," / "))
  for i,(x,y) in enumerate(zip(a["turns"],b["turns"])):
    if x==y: continue
    print(f" T{i+1} Q:",x["question"][:160].replace("\n"," / "))
    if x["updated"]!=y["updated"]: print("   updated:",x["updated"],"->",y["updated"])
    for l in difflib.unified_diff(x["reply"].splitlines(),y["reply"].splitlines(),lineterm="",n=0):
      if not l.startswith(("---","+++","@@")): print("   ",l[:260])
