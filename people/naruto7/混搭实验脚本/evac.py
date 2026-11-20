"""Helbing-style social-force evacuation: does a column in front of the exit help? 100 agents, 15x15 m room, 1 m door.
Parameters follow Helbing, Farkas, Vicsek (2000): m=80 kg, tau=0.5 s, A=2000 N, B=0.08 m, k=1.2e5, kappa=2.4e5, radii 0.25-0.35 m."""
import numpy as np, sys, time
A, B, K, KAPPA, M, TAU = 2000., 0.08, 1.2e5, 2.4e5, 80., 0.5
L = 15.
WALLS = [((0, 0), (L, 0)), ((0, L), (L, L)), ((0, 0), (0, L)), ((L, 0), (L, 7.0)), ((L, 8.0), (L, L))]
WALLS = [(np.array(a, float), np.array(b, float)) for a, b in WALLS]
g = lambda x: np.maximum(x, 0.)

def contact(diff, dist, ov, vel_i, vel_j=None):
    n = diff / dist[..., None]
    t = np.stack([-n[..., 1], n[..., 0]], -1)
    mag = A * np.exp(ov / B) + K * g(ov)
    dv = 0 if vel_j is None else ((vel_j - vel_i) * t).sum(-1)
    return n, t, mag, dv

def wall_f(P, V, R, p0, p1):
    d = p1 - p0; s = np.clip(((P - p0) @ d) / (d @ d), 0, 1); cp = p0 + s[:, None] * d
    diff = P - cp; dist = np.linalg.norm(diff, axis=1) + 1e-9; ov = R - dist
    n, t, mag, _ = contact(diff, dist, ov, V)
    return mag[:, None] * n - (KAPPA * g(ov) * (V * t).sum(1))[:, None] * t

def circle_f(P, V, R, c, rc):
    diff = P - c; dist = np.linalg.norm(diff, axis=1) + 1e-9; ov = R + rc - dist
    n, t, mag, _ = contact(diff, dist, ov, V)
    return mag[:, None] * n - (KAPPA * g(ov) * (V * t).sum(1))[:, None] * t

def agent_f(P, V, R):
    n_ = len(P)
    diff = P[:, None, :] - P[None, :, :]
    dist = np.linalg.norm(diff, axis=2) + np.eye(n_) * 1e9
    ov = R[:, None] + R[None, :] - dist
    n, t, mag, dv = contact(diff, dist, ov, V[:, None, :], V[None, :, :])
    mask = (ov > -0.5).astype(float)
    return ((mag * mask)[:, :, None] * n + (KAPPA * g(ov) * dv * mask)[:, :, None] * t).sum(1)

def run(n=100, v0=5., col=None, seed=0, dt=0.002, tmax=150.):
    rng = np.random.default_rng(seed)
    r = rng.uniform(0.25, 0.35, n); pos = []
    while len(pos) < n:
        p = rng.uniform(0.5, L - 0.5, 2)
        if col is not None and np.linalg.norm(p - col[:2]) < col[2] + 0.7: continue
        if all(np.linalg.norm(p - q) > 0.75 for q in pos): pos.append(p)
    pos = np.array(pos); vel = np.zeros((n, 2)); act = np.ones(n, bool); et = np.full(n, np.nan)
    door = np.array([L, 7.5]); t = 0.
    while act.any() and t < tmax:
        idx = np.where(act)[0]; P, V, R = pos[idx], vel[idx], r[idx]
        e = door - P; e /= np.linalg.norm(e, axis=1)[:, None]
        F = M * (v0 * e - V) / TAU + agent_f(P, V, R)
        for a, b in WALLS: F += wall_f(P, V, R, a, b)
        if col is not None: F += circle_f(P, V, R, col[:2], col[2])
        V = V + F / M * dt
        sp = np.linalg.norm(V, axis=1); V = V * np.minimum(1, 2 * v0 / (sp + 1e-9))[:, None]
        P = P + V * dt; pos[idx] = P; vel[idx] = V
        done = P[:, 0] > L + 0.3
        if done.any(): et[idx[done]] = t; act[idx[done]] = False
        t += dt
    return et

CONFIGS = {'none': None, 'col-sym': np.array([13.0, 7.5, 0.5]), 'col-asym': np.array([13.0, 7.0, 0.5])}
if __name__ == '__main__':
    seeds = [0, 1, 2]
    for v0 in (5., 2.):
        for name, col in CONFIGS.items():
            T90 = []; Tall = []; out = []
            t0 = time.time()
            for s in seeds:
                et = run(v0=v0, col=col, seed=s)
                ok = np.isfinite(et)
                out.append(ok.sum())
                T90.append(np.nanpercentile(et, 90) if ok.sum() >= 90 else np.nan)
                Tall.append(np.nanmax(et) if ok.all() else np.nan)
            print('v0=%.0f %-9s evacuated %s of 100 | T90 %s | Tall %s | %.0fs' % (
                v0, name, out, np.round(T90, 1).tolist(), np.round(Tall, 1).tolist(), time.time() - t0), flush=True)
