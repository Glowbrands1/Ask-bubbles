import json,sys
d=json.load(open(sys.argv[1])); v={x['fieldKey']:x for x in d['values']}
for k in ('offense_type','warning_type'):
    if k not in v: print(k, 'NOT PRESENT')
    if k in v: print(k, 'checked=', v[k]['checked'], 'filledBy=', v[k]['filledBy'])
for k in ('policy_violated','policy_language','action_plan','observation'):
    if k in v: print(k, '=', json.dumps(v[k]['value']), '| prov', json.dumps(v[k].get('provenance'))[:200])
print('events', [ (e['kind'], e.get('detail',{}).get('fields')) for e in d['events']])
