"""Braess paradox with N learning players. Edges: S-A cost x, A-T 45, S-B 45, B-T cost x, shortcut A-B 0 (x = players on the edge).
Routes: R1 S-A-T = xSA+45 ; R2 S-B-T = 45+xBT ; R3 S-A-B-T = xSA+xBT (only with shortcut).
Theory (continuous): without shortcut 20+45=65 ; with shortcut everyone takes R3 = 80."""
import numpy as np
N = 40

def route_costs(n, shortcut):
    n1, n2, n3 = n
    xsa, xbt = n1 + n3, n2 + n3
    c = [xsa + 45, 45 + xbt]
    if shortcut: c.append(xsa + xbt)
    return np.array(c, float)

def counterfactual(ch, shortcut):
    """cost each player would face on each route if they alone switched, given others' choices"""
    R = 3 if shortcut else 2
    n = np.bincount(ch, minlength=3)
    out = np.zeros((len(ch), R))
    for i, r in enumerate(ch):
        m = n.copy(); m[r] -= 1
        for k in range(R):
            mm = m.copy(); mm[k] += 1
            out[i, k] = route_costs(mm, shortcut)[k]
    return out

def run(shortcut, eta=0.08, eps=0.0, T=500, seed=0):
    rng = np.random.default_rng(seed)
    R = 3 if shortcut else 2
    w = np.ones((N, R)); hist = []
    for t in range(T):
        p = w / w.sum(1, keepdims=True)
        p = (1 - eps) * p + eps / R
        ch = np.array([rng.choice(R, p=p[i]) for i in range(N)])
        cf = counterfactual(ch, shortcut)
        own = cf[np.arange(N), ch]
        hist.append(own.mean())
        w *= np.exp(-eta * cf); w /= w.sum(1, keepdims=True) / R
    return np.mean(hist[-100:])

print("N=%d learners, mean travel time over the last 100 of 500 rounds, mean of 12 seeds" % N)
for eps in (0.0, 0.1):
    a = np.mean([run(False, eps=eps, seed=s) for s in range(12)])
    b = np.mean([run(True, eps=eps, seed=s) for s in range(12)])
    print("exploration %.1f: without shortcut %.1f | with shortcut %.1f | change %+.1f%%  (theory 65 -> 80)" % (eps, a, b, 100 * (b - a) / a))
