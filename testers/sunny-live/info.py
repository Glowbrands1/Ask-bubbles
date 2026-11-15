import json,sys
b=json.load(open(sys.argv[1]))['body']; fp=b.get('formProposal') or {}
print('locationId', fp.get('locationId'), '| locationName', fp.get('locationName'), '| resolution', fp.get('locationResolution'), '| status', fp.get('status'))
for l in b['content'].split('\n'):
    if any(w in l.lower() for w in ('salon','observation','which')): print('  ', l)
