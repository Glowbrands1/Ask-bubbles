# usage: rec.py <n> <classes.json path>  -> writes G5-<n>.md / .classes.json with categories filled
import json,sys,re,glob,os
n=sys.argv[1]; S=os.environ['S']; R=os.environ['R']
md=[p for p in glob.glob(f'{S}/rec/{n}/*.md')][0]
cls=json.load(open(sys.argv[2]))
out=[];counts={}
for l in open(md).read().split('\n'):
    if l.startswith('| ') and not l.startswith('| test') and not l.startswith('| ---'):
        cells=[c.strip() for c in re.split(r'(?<!\\)\|',l)[1:-1]]
        t=cells[0].replace('\\|','|')
        k=cls.get(t)
        if k and cells[3]=='UNCLASSIFIED':
            cells[3]=k['category'];cells[4]=k.get('twin','');cells[5]=k['reason'].replace('|','\\|')
        counts[cells[3]]=counts.get(cells[3],0)+1
        l='| '+' | '.join(cells)+' |'
    out.append(l)
s='\n'.join(out)
s=re.sub(r'^# .*',f'# G5-{n}: which tests it changes, and why',s,count=1)
s=re.sub(r'INTENDED \d+, INTENDED-HARNESS \d+, REGRESSION \d+, FLAKY \d+, UNCLASSIFIED \d+',', '.join(f'{c} {counts.get(c,0)}' for c in ['INTENDED','INTENDED-HARNESS','REGRESSION','FLAKY','UNCLASSIFIED']),s)
s=s.replace(S,'<scratch>')
open(f'{R}/G5-{n}.md','w').write(s)
json.dump(cls,open(f'{R}/G5-{n}.classes.json','w'),indent=1)
print(counts)
