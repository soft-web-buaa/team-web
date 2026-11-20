"""Equilibrium-aware recommendation for the weight lottery (toy; assumed rule: weighted draw w/o replacement, a student may win several courses).
Followers all use ONE recommended allocation a (sum 100). We iterate best responses so that a is (approximately) a best reply to the crowd that uses it."""
import numpy as np
rng = np.random.default_rng(5)
K = 3; CAP = np.array([30, 30, 30]); N = 200; POP = np.array([.5, .3, .2])

def base_bids(n):
    first = rng.choice(K, n, p=POP); B = np.zeros((n, K))
    for i, f in enumerate(first):
        B[i, f] = 100 * (0.6 + 0.4 * rng.random()); rest = 100 - B[i, f]
        oth = [c for c in range(K) if c != f]; w = rng.dirichlet(np.ones(2))
        for c, x in zip(oth, w): B[i, c] = rest * x
    return B

def draw(B):
    n = B.shape[0]; won = np.zeros((n, K), bool)
    for c in range(K):
        pos = np.where(B[:, c] > 0)[0]
        if len(pos) <= CAP[c]: won[pos, c] = True; continue
        p = B[pos, c] / B[pos, c].sum(); won[rng.choice(pos, size=CAP[c], replace=False, p=p), c] = True
    return won

CANDS = [np.array([a, b, 100 - a - b], float) for a in range(0, 101, 10) for b in range(0, 101 - a, 10)]

def world(f, a, T):
    """yield (bids matrix, n_nonfollowers) for T trials; followers use allocation a"""
    nf = N - int(N * f)
    for _ in range(T):
        B = base_bids(N)[:nf]
        F = np.tile(a, (N - nf, 1)) if a is not None else base_bids(N - nf)
        yield np.vstack([B, F]), nf

def dev_prob(b, f, a, T=140):
    ok = 0
    for B, nf in world(f, a, T):
        ok += draw(np.vstack([b[None, :], B]))[0].any()
    return ok / T

def group_prob(f, a, T=300):
    pf = pn = 0
    for B, nf in world(f, a, T):
        w = draw(B).any(1); pn += w[:nf].mean(); pf += w[nf:].mean()
    return pf / T, pn / T

for f in (0.3, 0.6):
    base_f, base_n = group_prob(f, None)
    a = np.array([0., 0., 100.])          # start from the naive 'all-in coldest'
    print("followers %d%% | baseline (nobody uses the tool): %.1f%%" % (100 * f, 100 * base_f))
    for it in range(4):
        pf, pn = group_prob(f, a)
        scores = [dev_prob(b, f, a) for b in CANDS]
        j = int(np.argmax(scores))
        print("  iter %d  rec=%s  followers %.1f%% non-followers %.1f%% | best single deviation %s -> %.1f%% (gain %+.1f pp)" % (
            it, a.astype(int).tolist(), 100 * pf, 100 * pn, CANDS[j].astype(int).tolist(), 100 * scores[j],
            100 * (scores[j] - dev_prob(a, f, a))))
        a = 0.5 * a + 0.5 * CANDS[j]   # damped update (rounded to the 10-grid for display only)
    pf, pn = group_prob(f, a)
    print("  final rec %s: followers %.1f%% non-followers %.1f%%" % (np.round(a).astype(int).tolist(), 100 * pf, 100 * pn))
