import json, re, time, urllib.parse, urllib.request

MAIL = "mailto=team@example.com"

def tok(s):
    return set(re.findall(r"[a-z0-9]+", s.lower()))

# (label, kind, citation string)
REAL = [
 "Granovetter, M. S. (1973). The strength of weak ties. American Journal of Sociology, 78(6), 1360-1380.",
 "Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291.",
 "Prelec, D., Seung, H. S., & McCoy, J. (2017). A solution to the single-question crowd wisdom problem. Nature, 541, 532-535.",
 "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521, 436-444.",
 "Watts, D. J., & Strogatz, S. H. (1998). Collective dynamics of 'small-world' networks. Nature, 393, 440-442.",
 "Arthur, W. B. (1994). Inductive reasoning and bounded rationality. American Economic Review, 84(2), 406-411.",
 "Challet, D., & Zhang, Y.-C. (1997). Emergence of cooperation and organization in an evolutionary game. Physica A, 246, 407-418.",
 "Shapley, L., & Scarf, H. (1974). On cores and indivisibility. Journal of Mathematical Economics, 1(1), 23-37.",
 "Roth, A. E., Sonmez, T., & Unver, M. U. (2004). Kidney exchange. Quarterly Journal of Economics, 119(2), 457-488.",
 "Tero, A., et al. (2010). Rules for biologically inspired adaptive network design. Science, 327, 439-442.",
 "Gneiting, T., & Raftery, A. E. (2007). Strictly proper scoring rules, prediction, and estimation. Journal of the American Statistical Association, 102, 359-378.",
 "Warner, S. L. (1965). Randomized response: A survey technique for eliminating evasive answer bias. Journal of the American Statistical Association, 60, 63-69.",
]
LOWCOV = [  # real works, but often outside Crossref (conference papers w/o DOI, books, Chinese books)
 "Vaswani, A., et al. (2017). Attention is all you need. Advances in Neural Information Processing Systems 30.",
 "Surowiecki, J. (2004). The Wisdom of Crowds. Doubleday.",
 "周志华. 机器学习[M]. 北京: 清华大学出版社, 2016.",
]
FAKE = [
 "Hartmann, L., & Okonkwo, B. (2019). Herd dynamics in algorithmic queue recommendation. Journal of Behavioral Operations, 14(3), 211-229.",
 "Zhang, W., & Liu, H. (2021). Surprisingly popular aggregation under correlated priors. Management Science, 67(8), 4881-4899.",
 "Rivera, M. (2018). Calibration drift in student probabilistic forecasts. Journal of Educational Psychology, 110(5), 701-716.",
 "Nakamura, T., Ibarra, C., & Weiss, D. (2020). Capped-cycle exchange for campus course seats. Games and Economic Behavior, 122, 312-330.",
 "Kowalski, J., & Brandt, F. (2017). A theory of unreliable crowds. Nature Human Behaviour, 1, 0221.",
 "Muller, S. (2016). Slime mold heuristics for pedestrian path design. Transportation Research Part B, 91, 55-72.",
 "Li, Y., & Chen, X. (2022). Large language models as El Farol bar players: a minority game study. Artificial Intelligence, 310, 103745.",
 "Anderson, P. K. (2015). Queueing with stale information in cafeterias. Operations Research Letters, 43(4), 401-406.",
 "王磊, 李娜. 基于多智能体的高校食堂排队优化研究[J]. 计算机应用研究, 2019, 36(7): 2012-2016.",
 "Okafor, N. (2020). Peer prediction without common priors in classroom polling. Journal of Economic Education, 51(3), 233-248.",
]
MUT = [  # real paper, wrong metadata (typical LLM slip)
 ("year", "Granovetter, M. S. (1974). The strength of weak ties. American Journal of Sociology, 80(2), 15-30."),
 ("author", "Kahneman, D., & Thaler, R. (1979). Prospect theory: An analysis of decision under risk. Econometrica, 47(2), 263-291."),
 ("journal", "LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Science, 521, 436-444."),
 ("year", "Roth, A. E., Sonmez, T., & Unver, M. U. (2008). Kidney exchange. Quarterly Journal of Economics, 119(2), 457-488."),
]

def query(c):
    q = urllib.parse.quote(c)
    url = "https://api.crossref.org/works?query.bibliographic=%s&rows=3&select=title,author,issued,container-title,DOI,score&%s" % (q, MAIL)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "citecheck-proto/0.1 (mailto:team@example.com)"}), timeout=25) as r:
                return json.load(r)["message"]["items"]
        except Exception as e:
            time.sleep(2)
    return []

def verdict(c, items):
    qt = tok(c)
    best = None
    for it in items:
        title = (it.get("title") or [""])[0]
        tt = tok(title)
        if not tt: continue
        cov = len(tt & qt) / len(tt)
        yr = (it.get("issued", {}).get("date-parts") or [[None]])[0][0]
        fam = ((it.get("author") or [{}])[0].get("family") or "").lower()
        cont = tok((it.get("container-title") or [""])[0])
        yr_ok = yr is not None and str(yr) in c
        au_ok = bool(fam) and fam.split()[0].lower() in c.lower()
        ct_ok = (not cont) or len(cont & qt) / len(cont) >= 0.5
        cand = (cov, yr_ok, au_ok, ct_ok, title[:60], yr)
        if best is None or cand[0] > best[0]: best = cand
    if best is None: return "NOTFOUND", None
    cov, yr_ok, au_ok, ct_ok, title, yr = best
    if cov >= 0.8:
        return ("EXISTS" if (yr_ok and au_ok and ct_ok) else "MISMATCH"), best
    return "NOTFOUND", best

rows = []
def run(label, c):
    items = query(c)
    v, b = verdict(c, items)
    rows.append((label, v))
    print("%-8s %-9s cov=%s | %s" % (label, v, ("%.2f" % b[0]) if b else "-", c[:70]))
    time.sleep(0.4)

for c in REAL: run("real", c)
for c in LOWCOV: run("lowcov", c)
for c in FAKE: run("fake", c)
for k, c in MUT: run("mut-" + k, c)

def cnt(lbl, v): return sum(1 for l, x in rows if l.startswith(lbl) and x == v)
def tot(lbl): return sum(1 for l, x in rows if l.startswith(lbl))
print()
print("real  : EXISTS %d/%d, MISMATCH %d, NOTFOUND %d" % (cnt("real", "EXISTS"), tot("real"), cnt("real", "MISMATCH"), cnt("real", "NOTFOUND")))
print("lowcov: EXISTS %d/%d, MISMATCH %d, NOTFOUND %d" % (cnt("lowcov", "EXISTS"), tot("lowcov"), cnt("lowcov", "MISMATCH"), cnt("lowcov", "NOTFOUND")))
print("fake  : NOTFOUND %d/%d, MISMATCH %d, EXISTS(false pass) %d" % (cnt("fake", "NOTFOUND"), tot("fake"), cnt("fake", "MISMATCH"), cnt("fake", "EXISTS")))
print("mutant: MISMATCH %d/%d, EXISTS(false pass) %d, NOTFOUND %d" % (cnt("mut", "MISMATCH"), tot("mut"), cnt("mut", "EXISTS"), cnt("mut", "NOTFOUND")))
