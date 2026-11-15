import json,sys
b=json.load(open(sys.argv[1]))['body']; fp=b.get('formProposal') or {}
print('locationId', fp.get('locationId'), '| resolution', fp.get('locationResolution'), '| status', fp.get('status'), '| warningLevel', fp.get('warningLevel'))
lines=b['content'].split('\n')
for l in lines:
    ll=l.lower()
    if any(w in ll for w in ('policy','on file','form monitoring','observation','salon','dress','late opening','attendance','standards')): print('  ', l)
print('  citations:', [ (c.get('documentTitle'), c.get('locator'), (c.get('excerpt') or '')[:40]) for c in (b.get('citations') or [])])
