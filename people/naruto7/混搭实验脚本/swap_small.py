"""Closed-cycle swap success at class-like sizes (N = 20 / 30 / 40). Needs swap_caps.py in the same folder
(its helper functions are re-used by exec-ing the part of that file before the 'N=60; trials=30' line)."""
import numpy as np
src = open('swap_caps.py', encoding='utf8').read()
head = src.split("N=60; trials=30")[0]
exec(head)
trials = 60
print("each person holds 1 unique item and accepts k random other items; %% of people who get a swap; %d trials" % trials)
for N in (20, 30, 40):
    for k in (3, 5):
        rng = np.random.default_rng(700 + N + k); res = {L: [] for L in (2, 3, 4, 5)}; inf = []
        for _ in range(trials):
            want = [set(int(x) for x in rng.choice([j for j in range(N) if j != i], size=k, replace=False)) for i in range(N)]
            cy = enum_cycles(N, want, 5)
            for L in res: res[L].append(pack(N, [c for c in cy if len(c) <= L]))
            inf.append(sum(unlimited(N, want)))
        print("N=%d k=%d  " % (N, k) + "  ".join("cap%d=%.0f%%" % (L, 100 * np.mean(res[L]) / N) for L in res) + "  unlimited=%.0f%%" % (100 * np.mean(inf) / N))
