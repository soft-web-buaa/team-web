"""Course-lottery herding: what happens if a recommender sends many students to the 'coldest' course?
Assumed rule (NOT verified): each course draws applicants without replacement, probability proportional
to points bid on that course, until capacity. Followers go all-in on ONE course."""
import numpy as np
rng = np.random.default_rng(23)

K = 3
CAP = np.array([30, 30, 30])
N = 200
POP = np.array([0.5, 0.3, 0.2])

def base_bids(n):
    first = rng.choice(K, n, p=POP)
    B = np.zeros((n, K))
    for i, f in enumerate(first):
        B[i, f] = 100 * (0.6 + 0.4 * rng.random())
        rest = 100 - B[i, f]
        oth = [c for c in range(K) if c != f]
        w = rng.dirichlet(np.ones(2))
        for c, x in zip(oth, w): B[i, c] = rest * x
    return B

def draw(B):
    n = B.shape[0]
    won = np.zeros((n, K), bool)
    for c in range(K):
        pos = np.where(B[:, c] > 0)[0]
        if len(pos) <= CAP[c]:
            won[pos, c] = True; continue
        p = B[pos, c] / B[pos, c].sum()
        won[rng.choice(pos, size=CAP[c], replace=False, p=p), c] = True
    return won

def expected_demand(B_nf):
    """total points per course from non-followers, a stand-in for what a recommender would observe"""
    return B_nf.sum(0)

def coordinated_shares(B_nf, n_f, iters=300):
    """pick follower shares s (sum=1) so that predicted P(win) is equal across courses (water-filling).
    predicted P(win) for an all-in follower on course c ~ CAP / (points_nf[c]/100 + n_f*s[c]) clipped to 1"""
    s = np.ones(K) / K
    D = B_nf.sum(0) / 100.0
    for _ in range(iters):
        p = np.minimum(1, CAP / (D + n_f * s))
        s = s * (p.mean() / p) ** 0.5
        s /= s.sum()
    return s

def run(f, mode, T=300):
    nf = N - int(N * f); n_f = N - nf
    res_f = []; res_n = []; res_all = []
    for _ in range(T):
        Bn = base_bids(N)
        B_nf = Bn[:nf]
        if n_f > 0:
            if mode == "none":
                B_f = Bn[nf:]
            elif mode == "naive":
                cold = np.argmin(B_nf.sum(0) / CAP)
                B_f = np.zeros((n_f, K)); B_f[:, cold] = 100
            else:
                s = coordinated_shares(B_nf, n_f)
                pick = rng.choice(K, n_f, p=s)
                B_f = np.zeros((n_f, K)); B_f[np.arange(n_f), pick] = 100
            B = np.vstack([B_nf, B_f])
        else:
            B = B_nf
        won = draw(B).any(1)
        res_n.append(won[:nf].mean())
        if n_f > 0: res_f.append(won[nf:].mean())
        res_all.append(won.mean())
    return np.mean(res_n), (np.mean(res_f) if res_f else float('nan')), np.mean(res_all)

print("200 students, 3 courses x cap 30 (90 seats total), others' first-choice shares 50/30/20")
print("P(win >=1 course): followers | non-followers | everyone")
for f in (0.1, 0.3, 0.6):
    for mode in ("none", "naive", "coord"):
        nfp, fp, allp = run(f, mode)
        print("followers=%2d%% %-6s followers %5.1f%% | non-followers %5.1f%% | all %5.1f%%" % (100 * f, mode, 100 * fp, 100 * nfp, 100 * allp))
