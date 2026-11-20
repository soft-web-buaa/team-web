"""Congestion arena: does 'advantage over the equilibrium policy, given the SAME realized others' choices' rank players more reliably than raw payoff?
3 windows with capacities; payoff = min(1, cap/load). Equilibrium (ideal free distribution): choose window w with prob cap_w/N."""
import numpy as np
rng = np.random.default_rng(31)

N = 40
CAP = np.array([0.45, 0.35, 0.20]) * N
K = 3
P_EQ = CAP / CAP.sum()

def payoff(w, load):                      # load includes the player
    return np.minimum(1.0, CAP[w] / load[w])

def play(T, mix):
    """mix: dict type -> count. returns types array, raw payoff (N,T), advantage (N,T)"""
    types = np.concatenate([[t] * c for t, c in mix.items()])
    assert len(types) == N
    raw = np.zeros((N, T)); adv = np.zeros((N, T))
    last_load = np.ones(K) * N / K
    fav = rng.integers(0, K, N)
    wts = np.ones((N, K))
    for t in range(T):
        ch = np.zeros(N, int)
        for i, ty in enumerate(types):
            if ty == 'chaser':   ch[i] = int(np.argmin(last_load / CAP))
            elif ty == 'sticker': ch[i] = fav[i]
            elif ty == 'eq':     ch[i] = rng.choice(K, p=P_EQ)
            elif ty == 'learner':
                p = wts[i] / wts[i].sum(); ch[i] = rng.choice(K, p=p)
        load = np.bincount(ch, minlength=K).astype(float)
        for i in range(N):
            raw[i, t] = payoff(ch[i], load)
            # expected payoff of equilibrium policy given others' realized choices (exact)
            others = load.copy(); others[ch[i]] -= 1
            exp_eq = sum(P_EQ[w] * min(1.0, CAP[w] / (others[w] + 1)) for w in range(K))
            adv[i, t] = raw[i, t] - exp_eq
        # learners: multiplicative weights with full-information hindsight payoffs
        for i, ty in enumerate(types):
            if ty == 'learner':
                others = load.copy(); others[ch[i]] -= 1
                hind = np.array([min(1.0, CAP[w] / (others[w] + 1)) for w in range(K)])
                wts[i] *= np.exp(2.0 * hind); wts[i] /= wts[i].sum() / K
        last_load = load
    return types, raw, adv

def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return np.corrcoef(ra, rb)[0, 1]

mix = {'chaser': 8, 'sticker': 8, 'eq': 18, 'learner': 6}
print("N=40: 8 chasers, 8 stickers, 18 equilibrium mixers, 6 multiplicative-weights learners; capacities 45/35/20 %")
for T in (20, 40, 80):
    rel_raw = []; rel_adv = []; m = {k: [] for k in mix}; z = []
    for s in range(60):
        types, raw, adv = play(T, mix)
        h = T // 2
        rel_raw.append(spearman(raw[:, :h].mean(1), raw[:, h:].mean(1)))
        rel_adv.append(spearman(adv[:, :h].mean(1), adv[:, h:].mean(1)))
        for k in mix: m[k].append(adv[types == k].mean())
        # can we tell a chaser from an equilibrium player? z-score of mean advantage
        zc = adv[types == 'chaser'].mean(1) / (adv[types == 'chaser'].std(1) / np.sqrt(T) + 1e-9)
        z.append(np.mean(zc < -2))
    print("T=%3d rounds | split-half rank reliability: raw payoff %.2f vs advantage %.2f | mean advantage chaser %+.3f sticker %+.3f eq %+.3f learner %+.3f | chasers flagged at z<-2: %.0f%%" % (
        T, np.mean(rel_raw), np.mean(rel_adv), np.mean(m['chaser']), np.mean(m['sticker']), np.mean(m['eq']), np.mean(m['learner']), 100 * np.mean(z)))
