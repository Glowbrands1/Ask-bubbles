import re,sys
s=sys.stdin.read()
m=re.search(r'CHAT_QUALITY_FLAG_NAMES[^=]*=\s*\[(.*?)\]',s,re.S)
print("\n".join(sorted(set(re.findall(r'"([A-Z_0-9]+)"',m.group(1))))) if m else "")
