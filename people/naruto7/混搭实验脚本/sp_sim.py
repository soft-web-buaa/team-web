import numpy as np
rng = np.random.default_rng(2026)

def bayes_pred(pA, prior=0.5):
    a0, a1 = pA  # P(signal A | truth A), P(signal A | truth B)
    post_sA = a0 * prior / (a0 * prior + a1 * (1 - prior))
    post_sB = (1 - a0) * prior / ((1 - a0) * prior + (1 - a1) * (1 - prior))
    return post_sA * a0 + (1 - post_sA) * a1, post_sB * a0 + (1 - post_sB) * a1

def batch(n, kind, sigma, lam, trials=6000):
    pA = (0.35, 0.10) if kind == 'trap' else (0.75, 0.25)
    w = rng.integers(0, 2, trials)               # 0: truth A, 1: truth B
    p = np.where(w == 0, pA[0], pA[1])
    s = rng.random((trials, n)) < p[:, None]     # True: respondent answers A
    pa, pb = bayes_pred(pA)
    pred = np.where(s, pa + lam, pb - lam)       # lam: false-consensus shift toward own answer
    pred = np.clip(pred + rng.normal(0, sigma, pred.shape), 0, 1)
    share = s.mean(1)
    maj = np.where(share == 0.5, rng.random(trials) < 0.5, share > 0.5)
    sp = share > pred.mean(1)
    truth = (w == 0)
    return 100 * (maj == truth).mean(), 100 * (sp == truth).mean()

settings = [(0.05, 0.0), (0.15, 0.0), (0.15, 0.10), (0.15, 0.20)]
print('accuracy %, columns: majority | SP(sigma,lam) for', settings)
for kind in ('trap', 'normal'):
    for n in (20, 40, 80, 160, 400):
        res = [batch(n, kind, sg, lm) for sg, lm in settings]
        print('%-6s n=%-3d maj %.1f | ' % (kind, n, res[0][0]) + ' | '.join('%.1f' % r[1] for r in res))
