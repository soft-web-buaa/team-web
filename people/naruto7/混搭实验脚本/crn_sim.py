"""Does a FIXED, scripted crowd (everyone faces the same crowd sequence) rank players more reliably than a live mixed population?
Players: policies with different true expected payoff. Environment: 3 windows, payoff = min(1, cap/load). Crowd = 39 background agents.
Live: each player's crowd is freshly random every round and independent per player. Fixed: all players face the same crowd sequence (common random numbers)."""
import numpy as np
rng = np.random.default_rng(99)
K = 3; N = 40; CAP = np.array([.45, .35, .20]) * N
P_EQ = CAP / CAP.sum()

# player policies: probability vector over windows. true skill = expected payoff vs a stationary crowd
def make_players(n=30):
    pols = []
    for i in range(n):
        eps = rng.uniform(0, 0.6)                       # distance from equilibrium
        d = rng.dirichlet(np.ones(K))
        pols.append((1 - eps) * P_EQ + eps * d)
    return np.array(pols)

def crowd_loads(T, bg=39, mode='mix'):
    """background load counts per window per round (39 agents; mixture of eq mixers and stickers)"""
    L = np.zeros((T, K))
    for t in range(T):
        ch = rng.choice(K, bg, p=P_EQ)
        L[t] = np.bincount(ch, minlength=K)
    return L

def payoff(w, load_bg):
    return np.minimum(1.0, CAP[w] / (load_bg[w] + 1))

def true_skill(pols, M=4000):
    L = crowd_loads(M)
    return np.array([np.mean([sum(p[w] * payoff(w, L[t]) for w in range(K)) for t in range(0, M, 4)]) for p in pols])

def observed(pols, T, fixed):
    n = len(pols); out = np.zeros((n, T))
    shared = crowd_loads(T) if fixed else None
    for i, p in enumerate(pols):
        L = shared if fixed else crowd_loads(T)
        ch = rng.choice(K, T, p=p)
        out[i] = [payoff(ch[t], L[t]) for t in range(T)]
    return out

def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b)); return np.corrcoef(ra, rb)[0, 1]

pols = make_players(30)
ts = true_skill(pols)
print("30 players, true skill spread (expected payoff) %.3f..%.3f; Spearman(observed mean payoff, true skill), mean of 80 runs" % (ts.min(), ts.max()))
for T in (10, 20, 40, 80):
    live = []; fix = []
    for _ in range(80):
        live.append(spearman(observed(pols, T, False).mean(1), ts))
        fix.append(spearman(observed(pols, T, True).mean(1), ts))
    print("T=%2d rounds | live (independent crowds) %.2f | fixed shared crowd %.2f" % (T, np.mean(live), np.mean(fix)))
