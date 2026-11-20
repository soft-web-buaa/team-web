"""How often does adding a link make the user-equilibrium commute worse in a random grid network (toy)?
Grid 5x5, both directions, link time t = a + b*x. Frank-Wolfe user equilibrium with exact line search (quadratic Beckmann objective).
Added link: a=2, b=0.01 (high-capacity tunnel) between two random nodes at grid distance >= 3."""
import numpy as np, networkx as nx, sys, time
rng = np.random.default_rng(2026)

def build(n=5):
    G = nx.DiGraph()
    for (u, v) in nx.grid_2d_graph(n, n).edges():
        a = rng.uniform(4, 12)
        b = rng.choice([0.005, 0.15], p=[0.4, 0.6]) * rng.uniform(0.7, 1.3)
        for s, t in ((u, v), (v, u)):
            G.add_edge(s, t, a=a, b=b)
    return G

def ue_cost(G, ods, iters=200):
    E = list(G.edges()); idx = {e: i for i, e in enumerate(E)}
    a = np.array([G[u][v]['a'] for u, v in E]); b = np.array([G[u][v]['b'] for u, v in E])
    x = np.zeros(len(E))
    def aon(cost):
        for i, (u, v) in enumerate(E): G[u][v]['c'] = cost[i]
        y = np.zeros(len(E))
        for o, d, q in ods:
            p = nx.dijkstra_path(G, o, d, weight='c')
            for s, t in zip(p[:-1], p[1:]): y[idx[(s, t)]] += q
        return y
    x = aon(a.copy())
    for k in range(iters):
        y = aon(a + b * x); d = y - x
        den = (b * d * d).sum()
        lam = 1.0 if den < 1e-12 else float(np.clip(-((a + b * x) * d).sum() / den, 0, 1))
        x = x + lam * d
    c = a + b * x
    return float((x * c).sum() / sum(q for _, _, q in ods))

def random_ods(G, K=6, q=30.):
    nodes = list(G.nodes()); out = []
    while len(out) < K:
        o, d = nodes[rng.integers(len(nodes))], nodes[rng.integers(len(nodes))]
        if abs(o[0] - d[0]) + abs(o[1] - d[1]) >= 4: out.append((o, d, q))
    return out

def add_tunnel(G):
    H = G.copy(); nodes = list(H.nodes())
    while True:
        u, v = nodes[rng.integers(len(nodes))], nodes[rng.integers(len(nodes))]
        if abs(u[0] - v[0]) + abs(u[1] - v[1]) >= 3 and not H.has_edge(u, v): break
    H.add_edge(u, v, a=2.0, b=0.01); H.add_edge(v, u, a=2.0, b=0.01)
    return H

t0 = time.time(); N = 100; worse = better = same = 0; rel = []
for _ in range(N):
    G = build(); ods = random_ods(G)
    before = ue_cost(G, ods); after = ue_cost(add_tunnel(G), ods)
    r = (after - before) / before; rel.append(r)
    if r > 0.005: worse += 1
    elif r < -0.005: better += 1
    else: same += 1
rel = np.array(rel)
print("add a tunnel, %d random networks: worse %d%% | better %d%% | within +-0.5%% %d%% | median change %.1f%% | worst %+.1f%% | best %+.1f%%  (%.0fs)" % (
    N, 100 * worse // N, 100 * better // N, 100 * same // N, 100 * np.median(rel), 100 * rel.max(), 100 * rel.min(), time.time() - t0), flush=True)

# closing one two-way link: is there a link whose removal speeds everyone up?
t0 = time.time(); M = 40; gain = 0; best = []
for _ in range(M):
    G = build(); ods = random_ods(G); base = ue_cost(G, ods)
    und = [(u, v) for (u, v) in G.edges() if u < v]
    rng.shuffle(und); bestr = 0.0
    for (u, v) in und[:10]:
        H = G.copy(); H.remove_edge(u, v); H.remove_edge(v, u)
        if not all(nx.has_path(H, o, d) for o, d, _ in ods): continue
        r = (ue_cost(H, ods, iters=120) - base) / base
        bestr = min(bestr, r)
    best.append(bestr); gain += bestr < -0.01
best = np.array(best)
print("close one of 10 random two-way links, %d networks: at least one closure cuts the average commute by >1%% in %d%% of networks | best cut: median %.1f%%, max %.1f%%  (%.0fs)" % (
    M, 100 * gain // M, 100 * np.median(best), 100 * best.min(), time.time() - t0), flush=True)
