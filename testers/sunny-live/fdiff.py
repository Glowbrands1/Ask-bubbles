import json,sys
def load(f):
    j=json.load(open(f)); i=j['instance']
    d={v['fieldKey']:(v.get('value'),v.get('checked')) for v in j['values']}
    meta={k:i.get(k) for k in ['status','formDate','employeeName','employeeRole','locationName','templateName','finalizedAt']}
    return d,meta,len(j.get('events') or [])
a,am,ae=load(sys.argv[1]); b,bm,be=load(sys.argv[2])
print('META changes:', {k:(am[k],bm[k]) for k in am if am[k]!=bm[k]} or 'none', '| events', ae,'->',be)
for k in sorted(set(a)|set(b)):
    if a.get(k)!=b.get(k):
        print('CHANGED', k); print('   before:', json.dumps(a.get(k))[:900]); print('   after :', json.dumps(b.get(k))[:900])
print('unchanged fields:', [k for k in a if a.get(k)==b.get(k)])
