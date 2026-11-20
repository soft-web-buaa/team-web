"""Cycles (cap 3) versus cycles plus altruist chains (non-simultaneous gifts, the last giver donates to a free pool).
Edge i->j: i accepts j's item. Chain from altruist a: p1 accepts a's item, p2 accepts p1's item, ... each chain member gets something they accept."""
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
rng = np.random.default_rng(41)

def cycles_upto(N, want, L, nodes):
    out = set(); nodes = set(nodes)
    def dfs(start, cur, path):
        for j in want[cur]:
            if j not in nodes: continue
            if j == start and len(path) >= 2: out.add(tuple(path))
            elif j > start and j not in path and len(path) < L: dfs(start, j, path + [j])
    for s in nodes: dfs(s, s, [s])
    return [list(c) for c in out]

def chains(N, want, alt, L, people):
    inv = {i: [p for p in people if i in want[p]] for i in range(N)}
    out = []
    def ext(path):
        out.append(list(path))
        if len(path) == L: return
        for q in inv[path[-1]]:
            if q not in path: ext(path + [q])
    for a in alt:
        for p1 in inv[a]: ext([p1])
    return out, {a: [i for i, c in enumerate(out)] for a in alt}

def solve(N, want, alt, people, Lc, Lchain):
    cyc = cycles_upto(N, want, Lc, people)
    ch, _ = chains(N, want, alt, Lchain, people) if (alt and Lchain) else ([], None)
    # chain ownership by altruist: recompute to know which altruist starts each chain
    owners = []
    if ch:
        for c in ch:
            owners.append([a for a in alt if a in want[c[0]]])
    cols = [(set(c), 'cyc', None) for c in cyc]
    for c, ow in zip(ch, owners):
        for a in ow: cols.append((set(c), 'chain', a))
    if not cols: return 0
    m = len(cols); rows = N
    M = lil_matrix((rows, m))
    for idx, (members, kind, a) in enumerate(cols):
        for v in members: M[v, idx] = 1
        if kind == 'chain': M[a, idx] = 1
    c = -np.array([len(mem) for mem, _, _ in cols], float)
    res = milp(c=c, constraints=LinearConstraint(M.tocsr(), -np.inf, 1), integrality=np.ones(m), bounds=Bounds(0, 1))
    return int(round(-res.fun))

N = 40; trials = 40
print("N=40 people (incl. altruists who accept nothing); each ordinary person accepts k random items; %% of ORDINARY people who get something; %d trials" % trials)
for k in (2, 3):
    for m_alt in (0, 1, 2, 4):
        base = []; with_chain = []
        for _ in range(trials):
            alt = list(range(m_alt)); people = list(range(m_alt, N))
            want = [set() for _ in range(N)]
            for i in people:
                want[i] = set(int(x) for x in rng.choice([j for j in range(N) if j != i], size=k, replace=False))
            base.append(solve(N, want, [], people, 3, 0))
            with_chain.append(solve(N, want, alt, people, 3, 6))
        n_ord = N - m_alt
        print("k=%d altruists=%d | cycles(cap3) %.0f%% | cycles+chains(len<=6) %.0f%% | gain %.1f pp" % (
            k, m_alt, 100 * np.mean(base) / n_ord, 100 * np.mean(with_chain) / n_ord, 100 * (np.mean(with_chain) - np.mean(base)) / n_ord))
