"""Honest-arena scoring test (congestion game, 3 windows).
Players report a probability vector over windows each round. The arena samples the action from it.
Scores compared against true skill (expected payoff vs a stationary crowd):
  sampled  : mean realized payoff (what a normal leaderboard does)
  EPGO     : mean over rounds of  sum_w p_w * payoff(w | others' realized loads)   (expected payoff given the crowd that actually showed up)
Crowd: 'live' = every player meets an independent random crowd; 'fixed' = all players meet the same scripted crowd sequence."""
import numpy as np
rng = np.random.default_rng(7)
K = 3; N = 40; CAP = np.array([.45, .35, .20]) * N; P_EQ = CAP / CAP.sum(); BG = 39

def make_players(n=30):
    out = []
    for _ in range(n):
        eps = rng.uniform(0, 0.6)
        out.append((1 - eps) * P_EQ + eps * rng.dirichlet(np.ones(K)))
    return np.array(out)

def crowd(T):
    return np.array([np.bincount(rng.choice(K, BG, p=P_EQ), minlength=K) for _ in range(T)], float)

def payoff_matrix(L):                       # (T, K): payoff if I pick window w given others' loads L
    return np.minimum(1.0, CAP[None, :] / (L + 1))

def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b)); return np.corrcoef(ra, rb)[0, 1]

pols = make_players(30)
PM_big = payoff_matrix(crowd(40000))
skill = PM_big.mean(0) @ pols.T
print("30 players; true skill spread %.3f..%.3f (std %.4f)" % (skill.min(), skill.max(), skill.std()))

def one_run(T, mode, score):
    n = len(pols); s = np.zeros(n)
    shared = payoff_matrix(crowd(T)) if mode == 'fixed' else None
    for i, p in enumerate(pols):
        PM = shared if shared is not None else payoff_matrix(crowd(T))
        if score == 'sampled':
            a = rng.choice(K, size=T, p=p)
            s[i] = PM[np.arange(T), a].mean()
        else:
            s[i] = (PM @ p).mean()
    return s

print("Spearman(score, true skill), mean of 100 runs")
for T in (5, 10, 20, 40):
    row = []
    for mode in ('live', 'fixed'):
        for score in ('sampled', 'EPGO'):
            row.append(np.mean([spearman(one_run(T, mode, score), skill) for _ in range(100)]))
    print("T=%2d | live+sampled %.2f | live+EPGO %.2f | fixed+sampled %.2f | fixed+EPGO %.2f" % ((T,) + tuple(row)))

# rank intervals by bootstrapping rounds, live+sampled vs fixed+EPGO
def rank_ci_width(T, mode, score, B=300):
    n = len(pols)
    # per-round score matrix (n, T)
    shared = payoff_matrix(crowd(T)) if mode == 'fixed' else None
    M = np.zeros((n, T))
    for i, p in enumerate(pols):
        PM = shared if shared is not None else payoff_matrix(crowd(T))
        if score == 'sampled':
            a = rng.choice(K, size=T, p=p); M[i] = PM[np.arange(T), a]
        else:
            M[i] = PM @ p
    ranks = np.zeros((B, n))
    for b in range(B):
        idx = rng.integers(0, T, T)
        ranks[b] = np.argsort(np.argsort(-M[:, idx].mean(1))) + 1
    lo = np.percentile(ranks, 2.5, axis=0); hi = np.percentile(ranks, 97.5, axis=0)
    return (hi - lo).mean(), np.mean((hi - lo) >= 10)
print("\n95% bootstrap rank interval, 30 players: mean width in ranks | share of players whose interval spans >=10 ranks")
for T in (20, 40, 80):
    a = np.mean([rank_ci_width(T, 'live', 'sampled') for _ in range(6)], axis=0)
    b = np.mean([rank_ci_width(T, 'fixed', 'EPGO') for _ in range(6)], axis=0)
    print("T=%2d | normal board (live, sampled): width %.1f, %.0f%% span>=10 | fixed crowd + EPGO: width %.1f, %.0f%% span>=10" % (T, a[0], 100 * a[1], b[0], 100 * b[1]))
