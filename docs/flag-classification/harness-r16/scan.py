"""Record scan over a flag-classify --keep dir: python3 -I scan.py <dir>"""
import json, re, sys, glob, os, collections

d = sys.argv[1]
OFFER = re.compile(r"\buse \*\*([^*]+)\*\*|\*\*use ([^*]+)\*\*", re.I)
DRAFT_FOR = re.compile(r"\bdraft(?:ed|ing)?\b[^.\n]{0,60}?\bfor \*{0,2}([A-Z][\w'’-]+(?: [A-Z][\w'’-]+){0,2})")
CHECKS = {
    "empty reply": lambda r: r.strip() == "",
    "artifact": lambda r: re.search(r"undefined|\bnull\b|\[object Object\]|\bNaN\b|<name>|\{\{", r),
    "scrubbed own words": lambda r: re.search(r"The employee (more|question|form)\b|\bthe employee more question", r, re.I),
    "applicable company policy": lambda r: re.search(r"applicable company policy", r, re.I),
    "retirement/401k": lambda r: re.search(r"401\s?\(?k\)?|retirement", r, re.I),
    "streamed envelope": lambda r: re.search(r'^\s*(data:|\{"type"\s*:|event:)', r, re.M),
    "salon/Sun Tan": lambda r: re.search(r"\bsalon\b|Sun Tan City", r, re.I),
}
for mode in ("off", "on"):
    files = sorted(glob.glob(os.path.join(d, f"{mode}-*.replay.jsonl")))
    print(f"== {mode}: {len(files)} runs")
    offered_per_run = []
    for f in files:
        recs = [json.loads(l) for l in open(f) if l.strip()]
        offered = collections.Counter()
        hits = collections.defaultdict(list)
        drafts = collections.Counter()
        notok = sum(1 for r in recs if not r["ok"])
        for r in recs:
            for t in r["turns"]:
                rep = t.get("reply") or ""
                for m in OFFER.finditer(rep):
                    offered[(m.group(1) or m.group(2)).strip()] += 1
                for m in DRAFT_FOR.finditer(rep):
                    drafts[m.group(1)] += 1
                for name, fn in CHECKS.items():
                    if fn(rep):
                        hits[name].append(f"{r['id']} [{r['mode']}]")
        offered_per_run.append(offered)
        print(f"  {os.path.basename(f)}: {len(recs)} records, not ok {notok}")
        for name in CHECKS:
            if hits[name]:
                print(f"    {name}: {len(hits[name])} e.g. {sorted(set(hits[name]))[:6]}")
        print(f"    draft-for names: {dict(drafts)}")
    if offered_per_run:
        same = all(o == offered_per_run[0] for o in offered_per_run)
        print(f"  offered names (identical across runs: {same}): {dict(sorted(offered_per_run[0].items()))}")
        if not same:
            for i, o in enumerate(offered_per_run):
                print(f"    run {i+1}: {dict(sorted(o.items()))}")
