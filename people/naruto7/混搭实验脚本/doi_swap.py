import json, re, time, urllib.request
def get(doi):
    req = urllib.request.Request("https://api.crossref.org/works/" + doi + "?mailto=cite-proto@example.com", headers={"User-Agent": "cite-proto/0.2 (mailto:cite-proto@example.com)"})
    with urllib.request.urlopen(req, timeout=25) as r:
        m = json.load(r)["message"]
    return (m.get("title") or [""])[0], [a.get("family", "") for a in m.get("author", [])], m["issued"]["date-parts"][0][0]
tok = lambda s: set(re.findall(r"[a-z0-9]+", s.lower()))
PAPERS = {
 "10.1038/nature14539": "Deep learning",
 "10.2307/1914185": "Prospect theory: An analysis of decision under risk",
 "10.1038/nature21054": "A solution to the single-question crowd wisdom problem",
 "10.1126/science.1177894": "Rules for biologically inspired adaptive network design",
 "10.1038/35035023": "Simulating dynamical features of escape panic",
 "10.1198/016214506000001437": "Strictly proper scoring rules, prediction, and estimation",
}
meta = {}
for d in PAPERS:
    meta[d] = get(d); time.sleep(0.5)
def verdict(cited_title, doi):
    t, au, yr = meta[doi]
    a, b = tok(cited_title), tok(t)
    cov = len(a & b) / max(1, len(b))
    return cov
dois = list(PAPERS)
ok = sum(verdict(PAPERS[d], d) >= 0.8 for d in dois)
print("correct (title, DOI) pairs flagged OK: %d/%d" % (ok, len(dois)))
caught = tot = 0
for i, d in enumerate(dois):
    for j, e in enumerate(dois):
        if i == j: continue
        tot += 1
        caught += verdict(PAPERS[d], e) < 0.8     # cite title of d but DOI of e
print("swapped pairs (real DOI, wrong title) flagged: %d/%d" % (caught, tot))
for d in dois: print("  ", d, "->", meta[d][0][:60], meta[d][2])
