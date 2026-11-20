"""Hand-drawn curve -> short formula, dictionary + greedy forward selection (OMP-like) with BIC.
Tests whether a browser-sized search can recover the intended formula family from jittery 'hand-drawn' data."""
import numpy as np
rng = np.random.default_rng(8)

X = np.linspace(-3, 3, 400)
TRUE = {
    "2sin(3x)+0.5x":      lambda x: 2 * np.sin(3 * x) + 0.5 * x,
    "x^3-2x":             lambda x: x ** 3 - 2 * x,
    "exp(-x^2)cos(4x)":   lambda x: np.exp(-x ** 2) * np.cos(4 * x),
    "|x|":                lambda x: np.abs(x),
    "1/(1+x^2)":          lambda x: 1 / (1 + x ** 2),
    "x^2/2-1":            lambda x: x ** 2 / 2 - 1,
}

def dictionary(x):
    cols, names = [np.ones_like(x)], ["1"]
    for p in (1, 2, 3, 4): cols.append(x ** p); names.append("x^%d" % p)
    for k in np.arange(0.5, 6.01, 0.5):
        cols.append(np.sin(k * x)); names.append("sin(%.1fx)" % k)
        cols.append(np.cos(k * x)); names.append("cos(%.1fx)" % k)
    for nm, f in (("exp(x)", np.exp(x)), ("exp(-x)", np.exp(-x)), ("exp(-x^2)", np.exp(-x ** 2)),
                  ("|x|", np.abs(x)), ("1/(1+x^2)", 1 / (1 + x ** 2)), ("tanh(x)", np.tanh(x))):
        cols.append(f); names.append(nm)
    # products of exp(-x^2) with cos/sin at the same grid
    for k in np.arange(1, 6.01, 1.0):
        cols.append(np.exp(-x ** 2) * np.cos(k * x)); names.append("exp(-x^2)cos(%.0fx)" % k)
    return np.array(cols).T, names

def draw_like_human(f, n=60, wobble=0.04, noise=0.015):
    xs = np.sort(rng.uniform(-3, 3, n))
    y = f(xs)
    rngy = np.ptp(f(X))
    # low-frequency wobble (hand tremor/drift) + small white noise, as fractions of the range
    wob = sum(rng.normal(0, wobble * rngy / (j + 1)) * np.sin(rng.uniform(0.3, 1.5) * (j + 1) * xs + rng.uniform(0, 6.28)) for j in range(3))
    return xs, y + wob + rng.normal(0, noise * rngy, n)

def greedy_bic(xs, ys, maxterms=3):
    A, names = dictionary(xs)
    chosen = []; best_bic = np.inf; best = None
    n = len(xs)
    for _ in range(maxterms):
        cand = None
        for j in range(A.shape[1]):
            if j in chosen: continue
            S = chosen + [j]
            coef, res, rk, sv = np.linalg.lstsq(A[:, S], ys, rcond=None)
            rss = np.sum((A[:, S] @ coef - ys) ** 2)
            bic = n * np.log(rss / n + 1e-12) + len(S) * np.log(n)
            if cand is None or bic < cand[0]: cand = (bic, S, coef, rss)
        if cand[0] < best_bic - 2:
            best_bic = cand[0]; chosen = cand[1]; best = cand
        else: break
    return best, names

def poly_fit(xs, ys, deg=8):
    c = np.polyfit(xs, ys, deg)
    return c

print("%-20s %-44s %8s %9s %9s" % ("true formula", "recovered terms", "rel.err", "poly8err", "extrap"))
for nm, f in TRUE.items():
    ok_rel = []; ok_poly = []; ex = []; found_family = 0; T = 20
    shown = None
    for _ in range(T):
        xs, ys = draw_like_human(f)
        (bic, S, coef, rss), names = greedy_bic(xs, ys)
        A, _ = dictionary(X)
        yhat = A[:, S] @ coef
        rngy = np.ptp(f(X))
        ok_rel.append(np.sqrt(np.mean((yhat - f(X)) ** 2)) / rngy)
        pc = poly_fit(xs, ys); ok_poly.append(np.sqrt(np.mean((np.polyval(pc, X) - f(X)) ** 2)) / rngy)
        # extrapolation: x in [3,4.5]
        Xe = np.linspace(3, 4.5, 50); Ae, _ = dictionary(Xe)
        ex.append(np.sqrt(np.mean((Ae[:, S] @ coef - f(Xe)) ** 2)) / rngy)
        if shown is None: shown = " + ".join("%.2f*%s" % (c, names[j]) for c, j in zip(coef, S))
    print("%-20s %-44s %7.1f%% %8.1f%% %8.0f%%" % (nm, shown[:44], 100 * np.mean(ok_rel), 100 * np.mean(ok_poly), 100 * np.mean(ex)))
print("rel.err = RMS(fit - truth)/range over [-3,3], mean of 20 hand-drawn-like samples; extrap = same on x in [3,4.5]")
