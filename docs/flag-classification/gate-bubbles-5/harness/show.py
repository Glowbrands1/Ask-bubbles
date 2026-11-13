import json,sys,difflib
d=sys.argv[1]
def load(p):
    r={}
    for l in open(p):
        if l.strip():
            x=json.loads(l); r[f"{x['id']} [{x['mode']}]"]=x
    return r
a=load(d+'/off-1.replay.jsonl'); b=load(d+'/on-1.replay.jsonl')
for k in sorted(set(a)|set(b)):
    x=a.get(k); y=b.get(k)
    if json.dumps(x and {'ok':x['ok'],'t':x['turns']})==json.dumps(y and {'ok':y['ok'],'t':y['turns']}): continue
    print('='*8,k,'OFF ok=',x and x['ok'],'ON ok=',y and y['ok'])
    if x and not x['ok']: print('  OFF err:',x['error'][:300])
    if y and not y['ok']: print('  ON err:',y['error'][:300])
    xt=x['turns'] if x else []; yt=y['turns'] if y else []
    for i in range(max(len(xt),len(yt))):
        p=xt[i] if i<len(xt) else None; q=yt[i] if i<len(yt) else None
        if p==q: continue
        print(f'  turn {i}: Q: {(p or q)["question"][:200]!r}')
        if (p or {}).get('updated')!=(q or {}).get('updated'): print('   updated OFF',p and p['updated'],'ON',q and q['updated'])
        for l in difflib.unified_diff(((p or {}).get('reply') or '').splitlines(),((q or {}).get('reply') or '').splitlines(),'off','on',n=0,lineterm=''):
            print('   ',l[:300])
