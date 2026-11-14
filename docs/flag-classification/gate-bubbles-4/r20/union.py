import re,sys
p=sys.argv[1]; s=open(p).read()
def rep(m):
    a=m.group(1).rstrip('\n'); b=m.group(2)
    return a+"\n}\n\n/**\n"+b
s2,n=re.subn(r'^<<<<<<< ours\n(.*?)^=======\n(.*?)^>>>>>>> theirs\n',rep,s,flags=re.S|re.M)
open(p,'w').write(s2); print(p,n)
