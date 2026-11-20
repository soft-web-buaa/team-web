"""Can a crowd of self-reported (my weight, won?) pairs reveal which lottery rule a course used?
Rules: P = weighted draw without replacement, S = strict priority by weight (random tie-break), U = uniform lottery.
Likelihood families (1 parameter each): P: 1-exp(-lam*w); S: step at threshold t (soft edge); U: constant p."""
import numpy as np
rng = np.random.default_rng(77)
M, CAP = 60, 30
W_VALUES = np.array([100, 70, 50, 30, 10]); W_PROBS = np.array([.25, .15, .20, .20, .20])

def world(rule):
    w = rng.choice(W_VALUES, M, p=W_PROBS).astype(float)
    if rule == 'P':
        keys = rng.random(M) ** (1 / w); win = np.zeros(M, bool); win[np.argsort(-keys)[:CAP]] = True
    elif rule == 'S':
        order = np.lexsort((rng.random(M), -w)); win = np.zeros(M, bool); win[order[:CAP]] = True
    else:
        win = np.zeros(M, bool); win[rng.permutation(M)[:CAP]] = True
    return w, win

def ll(p, y):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.sum(y * np.log(p) + (1 - y) * np.log(1 - p))

LAMS = np.concatenate([np.linspace(0.001, 0.05, 50), np.linspace(0.06, 0.5, 30)])
THR = np.array([5, 15, 25, 35, 45, 55, 60, 65, 75, 85, 95], float)
PS = np.linspace(0.02, 0.98, 49)

def classify(w, y):
    best = {}
    best['P'] = max(ll(1 - np.exp(-l * w), y) for l in LAMS)
    best['S'] = max(ll(np.where(w > t, 0.97, 0.03), y) for t in THR)    # soft step: rare noise allowed
    best['U'] = max(ll(np.full_like(w, p), y) for p in PS)
    return max(best, key=best.get), best

print("accuracy of picking the true rule from n self-reports (each rule 600 worlds). rows: truth, cols: n_reports")
for n in (6, 12, 24, 48):
    out = []
    conf = {r: {c: 0 for c in 'PSU'} for r in 'PSU'}
    for rule in 'PSU':
        for _ in range(600):
            w, win = world(rule)
            idx = rng.choice(M, n, replace=False)
            pred, _ = classify(w[idx], win[idx].astype(float))
            conf[rule][pred] += 1
    acc = {r: conf[r][r] / 600 for r in 'PSU'}
    print("n=%2d  P %.0f%%  S %.0f%%  U %.0f%%   | P mistaken as S/U: %.0f%%/%.0f%%" % (n, 100 * acc['P'], 100 * acc['S'], 100 * acc['U'], 100 * conf['P']['S'] / 600, 100 * conf['P']['U'] / 600))
