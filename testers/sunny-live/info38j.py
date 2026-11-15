import json,sys
b=json.load(open(sys.argv[1]))['body']; fp=b.get('formProposal') or {}
print('locationId', fp.get('locationId'), '| resolution', fp.get('locationResolution'), '| employeeRole', repr(fp.get('employeeRole')), '| status', fp.get('status'))
for l in b['content'].split('\n'):
    ll=l.lower()
    if any(w in ll for w in ('salon','observation','job title','which')): print('  ', l)
