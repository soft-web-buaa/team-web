import numpy as np
rng = np.random.default_rng(5)

# ---- 1) Dawid-Skene (one-coin) vs majority vote with spammers ----
def world(per_item, n_items=200, n_workers=30, mix=(0.25, 0.55, 0.20), accs=(0.5, 0.75, 0.92)):
    truth = rng.integers(0, 2, n_items)
    acc = np.array(accs)[rng.choice(3, n_workers, p=mix)]
    L = []
    for i in range(n_items):
        for w in rng.choice(n_workers, per_item, replace=False):
            L.append((i, w, truth[i] if rng.random() < acc[w] else 1 - truth[i]))
    return truth, L, n_items, n_workers

def mv(L, n):
    s = np.zeros(n); c = np.zeros(n)
    for i, w, l in L: s[i] += l; c[i] += 1
    r = s / c
    return np.where(r == 0.5, rng.integers(0, 2, n), (r > 0.5).astype(int))

def ds(L, n, m, iters=40):
    post = np.zeros(n); c = np.zeros(n)
    for i, w, l in L: post[i] += l; c[i] += 1
    post /= c
    for _ in range(iters):
        num = np.ones(m); den = 2 * np.ones(m)
        for i, w, l in L:
            num[w] += post[i] if l == 1 else 1 - post[i]; den[w] += 1
        a = np.clip(num / den, 0.02, 0.98)
        lg = np.zeros(n)
        for i, w, l in L:
            llr = np.log(a[w] / (1 - a[w])); lg[i] += llr if l == 1 else -llr
        post = 1 / (1 + np.exp(-lg))
    return (post > 0.5).astype(int)

print('Dawid-Skene vs majority (200 items, 30 workers, 25%% spammers), mean of 40 worlds')
for k in (3, 5, 8):
    a = b = 0
    for _ in range(40):
        t, L, n, m = world(k)
        a += (mv(L, n) == t).mean(); b += (ds(L, n, m) == t).mean()
    print('labels/item=%d  MV %.1f%%  DS %.1f%%' % (k, 100 * a / 40, 100 * b / 40))

# ---- 2) forecasting arena: how many questions to rank forecasters reliably ----
print('\nforecast arena: 4 bots with error SD 0.03/0.06/0.10/0.15; loss = squared error vs observed share')
sds = np.array([0.03, 0.06, 0.10, 0.15])
for n_resp in (30, 60, 150):
    row = []
    for K in (5, 10, 20, 40):
        best1 = full = 0; T = 3000
        for _ in range(T):
            p = rng.uniform(0.15, 0.85, K)
            ph = rng.binomial(n_resp, p) / n_resp
            f = np.clip(p[None, :] + rng.normal(0, 1, (4, K)) * sds[:, None], 0, 1)
            loss = ((f - ph[None, :]) ** 2).mean(1)
            order = np.argsort(loss)
            best1 += order[0] == 0; full += (order == np.arange(4)).all()
        row.append('K=%d: best#1 %.0f%% fullorder %.0f%%' % (K, 100 * best1 / T, 100 * full / T))
    print('n_resp=%d | ' % n_resp + ' | '.join(row))

# ---- 3) randomized response: width of 95%% CI for prevalence 0.3 ----
print('\nrandomized response (forced-response, theta = prob of truthful answer), true prevalence 0.30')
for theta in (0.5, 0.75):
    lam = theta * 0.3 + (1 - theta) / 2
    out = []
    for n in (40, 100, 300, 1000):
        se = np.sqrt(lam * (1 - lam) / n) / theta
        out.append('n=%d +-%.0fpp' % (n, 100 * 1.96 * se))
    print('theta=%.2f | ' % theta + ' | '.join(out))
print('direct question (no RR): n=40 +-%.0fpp  n=100 +-%.0fpp' % (100 * 1.96 * np.sqrt(.21 / 40), 100 * 1.96 * np.sqrt(.21 / 100)))
