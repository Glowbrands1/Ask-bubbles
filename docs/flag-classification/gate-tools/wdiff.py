import json,sys,difflib,collections
ck=sys.argv[1]
def load(m):
    return {(r['id'],r['mode']):r for r in map(json.loads,filter(str.strip,open(f"{ck}/{m}-1.replay.jsonl")))}
off,on=load('off'),load('on')
pat=collections.Counter(); ex={}
for k in sorted(set(off)|set(on)):
    a,b=off.get(k),on.get(k)
    if not a or not b or json.dumps([a['ok'],a['turns']])==json.dumps([b['ok'],b['turns']]): continue
    for i,(ta,tb) in enumerate(zip(a['turns'],b['turns'])):
        for fld in ('reply','updated'):
            x,y=str(ta.get(fld)),str(tb.get(fld))
            if x==y: continue
            sm=difflib.SequenceMatcher(None,x,y)
            ch=[(op,x[i1:i2],y[j1:j2]) for op,i1,i2,j1,j2 in sm.get_opcodes() if op!='equal']
            sig=" | ".join(f"{op}:{p!r}->{q!r}" for op,p,q in ch)[:300]
            pat[sig]+=1; ex.setdefault(sig,[]).append(f"{k[0]}[{k[1][:12]}] t{i} {fld}")
    if len(a['turns'])!=len(b['turns']) or a['ok']!=b['ok']: pat[f"ok/turncount {a['ok']}->{b['ok']}"]+=1; ex.setdefault(f"ok/turncount {a['ok']}->{b['ok']}",[]).append(k[0])
for s,n in pat.most_common(): print(n, s, "\n    e.g.", ex[s][:3])
