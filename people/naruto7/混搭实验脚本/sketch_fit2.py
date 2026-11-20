"""Hand-drawn curve -> formula: greedy forward selection vs exhaustive best subset (<=3 terms), BIC.
'recovered' = after dropping terms whose contribution is < 5% of std(y), the remaining term set equals the true term set."""
import numpy as np, itertools, time
rng = np.random.default_rng(8)
X = np.linspace(-3, 3, 400)

def dictionary(x):
    cols, names = [np.ones_like(x)], ["1"]
    for p in (1, 2, 3, 4): cols.append(x ** p); names.append("x^%d" % p)
    for k in np.arange(0.5, 6.01, 0.5):
        cols.append(np.sin(k * x)); names.append("sin(%.1fx)" % k)
        cols.append(np.cos(k * x)); names.append("cos(%.1fx)" % k)
    for nm, f in (("exp(x)", np.exp(x)), ("exp(-x)", np.exp(-x)), ("exp(-x^2)", np.exp(-x ** 2)),
                  ("|x|", np.abs(x)), ("1/(1+x^2)", 1 / (1 + x ** 2)), ("tanh(x)", np.tanh(x))):
        cols.append(f); names.append(nm)
    for k in np.arange(1, 6.01, 1.0):
        cols.append(np.exp(-x ** 2) * np.cos(k * x)); names.append("exp(-x^2)cos(%.0fx)" % k)
    return np.array(cols).T, names

TRUE = {
    "2sin(3x)+0.5x":    (lambda x: 2 * np.sin(3 * x) + 0.5 * x, {"sin(3.0x)", "x^1"}),
    "x^3-2x":           (lambda x: x ** 3 - 2 * x, {"x^3", "x^1"}),
    "exp(-x^2)cos(4x)": (lambda x: np.exp(-x ** 2) * np.cos(4 * x), {"exp(-x^2)cos(4x)"}),
    "|x|":              (lambda x: np.abs(x), {"|x|"}),
    "1/(1+x^2)":        (lambda x: 1 / (1 + x ** 2), {"1/(1+x^2)"}),
    "x^2/2-1":          (lambda x: x ** 2 / 2 - 1, {"x^2", "1"}),
}

def draw_like_human(f, n=60, wobble=0.04, noise=0.015):
    xs = np.sort(rng.uniform(-3, 3, n)); y = f(xs); r = np.ptp(f(X))
    wob = sum(rng.normal(0, wobble * r / (j + 1)) * np.sin(rng.uniform(0.3, 1.5) * (j + 1) * xs + rng.uniform(0, 6.28)) for j in range(3))
    return xs, y + wob + rng.normal(0, noise * r, n)

def bic(A, y, S):
    coef = np.linalg.lstsq(A[:, S], y, rcond=None)[0]
    rss = np.sum((A[:, S] @ coef - y) ** 2); n = len(y)
    return n * np.log(rss / n + 1e-12) + len(S) * np.log(n), coef

def greedy(A, y, maxk=3):
    chosen, best = [], np.inf; res = None
    for _ in range(maxk):
        cand = None
        for j in range(A.shape[1]):
            if j in chosen: continue
            b, c = bic(A, y, chosen + [j])
            if cand is None or b < cand[0]: cand = (b, chosen + [j], c)
        if cand[0] < best - 2: best = cand[0]; chosen = cand[1]; res = cand
        else: break
    return res

def exhaustive(A, y, maxk=3):
    best = None
    for k in range(1, maxk + 1):
        for S in itertools.combinations(range(A.shape[1]), k):
            b, c = bic(A, y, list(S))
            if best is None or b < best[0] - 1e-9: best = (b, list(S), c)
    return best

def score(res, A, names, y, truth):
    b, S, c = res
    keep = [j for j, cj in zip(S, c) if abs(cj) * A[:, j].std() > 0.05 * y.std() or names[j] in ("1",) and abs(cj) > 0.05 * y.std()]
    return set(names[j] for j in keep) == truth

T = 12
print("%-18s | recovered true term set: greedy / exhaustive | rel.err in range: greedy / exhaustive | extrapolation x in [3,4.5]: greedy / exhaustive" % "formula")
t0 = time.time()
for nm, (f, truth) in TRUE.items():
    rg = re = 0; eg = ee = []; xg = xe = []
    eg, ee, xg, xe = [], [], [], []
    for _ in range(T):
        xs, ys = draw_like_human(f)
        A, names = dictionary(xs); Af, _ = dictionary(X); Ae, _ = dictionary(np.linspace(3, 4.5, 50))
        g = greedy(A, ys); e = exhaustive(A, ys)
        rg += score(g, A, names, ys, truth); re += score(e, A, names, ys, truth)
        rngy = np.ptp(f(X)); xe_t = np.linspace(3, 4.5, 50)
        for res, E, XX in ((g, eg, xg), (e, ee, xe)):
            S, c = res[1], res[2]
            E.append(np.sqrt(np.mean((Af[:, S] @ c - f(X)) ** 2)) / rngy)
            XX.append(np.sqrt(np.mean((Ae[:, S] @ c - f(xe_t)) ** 2)) / rngy)
    print("%-18s | %2d/%d / %2d/%d | %.1f%% / %.1f%% | %.0f%% / %.0f%%" % (nm, rg, T, re, T, 100 * np.mean(eg), 100 * np.mean(ee), 100 * np.mean(xg), 100 * np.mean(xe)), flush=True)
print("%.0f s" % (time.time() - t0))
