import json,sys,difflib
k,ids=sys.argv[1],sys.argv[2:]
def load(f):
  r={}
  for l in open(f):
    o=json.loads(l); r[(o['id'],o['mode'])]=o
  return r
off,on=load(k+'/off-1.replay.jsonl'),load(k+'/on-1.replay.jsonl')
for key in sorted(off):
  if key[0] not in ids: continue
  a,b=off[key],on.get(key)
  for i,(ta,tb) in enumerate(zip(a['turns'],b['turns'])):
    for fld in ('reply','updated'):
      x,y=json.dumps(ta.get(fld),indent=0,ensure_ascii=False) if fld=='updated' else (ta.get(fld) or ''), json.dumps(tb.get(fld),indent=0,ensure_ascii=False) if fld=='updated' else (tb.get(fld) or '')
      if x!=y:
        print(f'=== {key} turn {i+1} {fld} ok {a["ok"]}->{b["ok"]}')
        for d in difflib.unified_diff(x.splitlines(),y.splitlines(),lineterm='',n=0):
          if not d.startswith(('---','+++','@@')): print('  ',d[:300])
