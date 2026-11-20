import numpy as np
def run(N, m, T=4000, burn=1000, S=2, seed=0):
    rng = np.random.default_rng(seed)
    P = 2 ** m
    tab = rng.choice(np.array([-1, 1], dtype=np.int8), size=(N, S, P))
    score = np.zeros((N, S))
    mu = int(rng.integers(P))
    ar = np.arange(N)
    A_hist = []
    for t in range(T + burn):
        best = np.argmax(score + rng.random((N, S)) * 1e-6, axis=1)
        a = tab[ar, best, mu].astype(np.int32)
        A = int(a.sum())
        win = -1 if A > 0 else 1                      # minority side
        score += (tab[:, :, mu] == win)                # +1 to strategies that picked the minority
        mu = ((mu << 1) | (1 if win > 0 else 0)) & (P - 1)
        if t >= burn: A_hist.append(A)
    A_hist = np.array(A_hist, float)
    return (A_hist ** 2).mean() / N, abs(A_hist.mean()) / N
N = 301
print("N=%d players, S=2 strategies, T=4000; sigma^2/N (random play = 1.0)" % N)
for m in range(2, 13):
    v = np.mean([run(N, m, seed=s)[0] for s in range(3)])
    print("m=%2d alpha=2^m/N=%6.3f  sigma^2/N=%6.2f" % (m, 2 ** m / N, v))
