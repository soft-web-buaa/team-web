"""Toy model of a weight-bid lottery for oversubscribed courses (NOT the verified BUAA rule).
Rule assumed: each student spreads 100 points over courses; for each course, applicants are drawn
without replacement with probability proportional to their points on that course until capacity
is filled; a student keeps every course won (no one-course limit). Used only to show what a
simulator could compute."""
import numpy as np
rng = np.random.default_rng(11)

COURSES = 3
CAP = np.array([30, 30, 30])
N_OTHERS = 199            # other students
POP = np.array([0.5, 0.3, 0.2])   # share of others who consider each course their first choice

def others_bids():
    first = rng.choice(COURSES, N_OTHERS, p=POP)
    bids = np.zeros((N_OTHERS, COURSES))
    for i, f in enumerate(first):
        s = rng.random()
        bids[i, f] = 100 * (0.6 + 0.4 * s)            # most points on first choice
        rest = 100 - bids[i, f]
        others = [c for c in range(COURSES) if c != f]
        w = rng.dirichlet(np.ones(len(others)))
        for c, x in zip(others, w): bids[i, c] = rest * x
    return bids

def draw(bids_all, cap):
    """bids_all: (n, courses). returns boolean (n, courses) won."""
    n, k = bids_all.shape
    won = np.zeros((n, k), bool)
    for c in range(k):
        w = bids_all[:, c].copy()
        pos = np.where(w > 0)[0]
        if len(pos) <= cap[c]:
            won[pos, c] = True; continue
        p = w[pos] / w[pos].sum()
        pick = rng.choice(pos, size=cap[c], replace=False, p=p)
        won[pick, c] = True
    return won

def trial_prob(me, T=1500):
    ok_any = ok_c = 0
    wins = np.zeros(COURSES)
    for _ in range(T):
        B = others_bids()
        allb = np.vstack([me[None, :], B])
        w = draw(allb, CAP)[0]
        ok_any += w.any(); wins += w
    return ok_any / T, wins / T

strategies = {
    "all-in hottest (course 0)": np.array([100., 0, 0]),
    "all-in coldest (course 2)": np.array([0., 0, 100]),
    "even split 33/33/34": np.array([33., 33, 34]),
    "tilt to cold 10/30/60": np.array([10., 30, 60]),
    "hedge 0/40/60": np.array([0., 40, 60]),
}
print("200 students (me + 199), 3 courses, capacity 30 each, others' first-choice shares 50/30/20 %")
print("P(win >=1 course) and per-course win prob, 1500 trials each")
for name, me in strategies.items():
    a, per = trial_prob(me)
    print("%-28s any=%.0f%%  per-course=%s" % (name, 100 * a, "/".join("%.0f" % (100 * x) for x in per)))
# crude grid search over my 100 points in steps of 10 for P(any)
best = []
T = 600
for a in range(0, 101, 10):
    for b in range(0, 101 - a, 10):
        me = np.array([a, b, 100 - a - b], float)
        p, _ = trial_prob(me, T)
        best.append((p, tuple(me)))
best.sort(reverse=True)
print("grid search (600 trials per point, step 10) top 3:", [(round(100 * p), m) for p, m in best[:3]])
print("worst 3:", [(round(100 * p), m) for p, m in best[-3:]])
