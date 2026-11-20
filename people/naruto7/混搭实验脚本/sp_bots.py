"""Surprisingly-popular (SP) with a fraction of AI bots in the respondent pool.
Trap question: truth A, but most humans answer B. Humans: Bayesian-consistent answers and predictions (as in sp_sim.py, sigma .15).
Bots (shared prior): answer B with prob 0.95 whatever the truth, and predict 'B share = 0.9' (they believe everyone else is like them).
Variant 'bot-aware SP' computes SP on humans only (bots tracked on a separate board)."""
import numpy as np
rng = np.random.default_rng(12)
pA = (0.35, 0.10)    # P(human gets signal A | truth A), P(... | truth B)

def bayes_pred(pA, prior=0.5):
    a0, a1 = pA
    psA = a0 * prior / (a0 * prior + a1 * (1 - prior)); psB = (1 - a0) * prior / ((1 - a0) * prior + (1 - a1) * (1 - prior))
    return psA * a0 + (1 - psA) * a1, psB * a0 + (1 - psB) * a1

def trial(n, f, sigma=0.15, trials=6000, bot_pa=0.05, bot_pred_A=0.10):
    nb = int(round(n * f)); nh = n - nb
    w = rng.integers(0, 2, trials); truthA = (w == 0)
    p = np.where(truthA, pA[0], pA[1])
    sh = rng.random((trials, nh)) < p[:, None]
    pa, pb = bayes_pred(pA)
    predh = np.clip(np.where(sh, pa, pb) + rng.normal(0, sigma, sh.shape), 0, 1)
    sb = rng.random((trials, nb)) < bot_pa                      # bots answer A with 5% regardless of truth
    predb = np.clip(bot_pred_A + rng.normal(0, 0.03, (trials, nb)), 0, 1)
    shareA_all = (sh.sum(1) + sb.sum(1)) / n; predA_all = (predh.sum(1) + predb.sum(1)) / n
    maj = shareA_all > 0.5
    sp_mix = shareA_all > predA_all
    sp_h = (sh.mean(1) > predh.mean(1)) if nh else np.zeros(trials, bool)
    return 100 * (maj == truthA).mean(), 100 * (sp_mix == truthA).mean(), 100 * (sp_h == truthA).mean()

print("n=40 respondents, trap question; accuracy %% (majority vote | SP on everyone | SP on humans only)")
for f in (0.0, 0.1, 0.2, 0.3, 0.5):
    m, s, h = trial(40, f)
    print("bots %2d%% | maj %.1f | SP-all %.1f | SP-humans-only %.1f" % (100 * f, m, s, h))
print("n=80 respondents")
for f in (0.0, 0.2, 0.5):
    m, s, h = trial(80, f)
    print("bots %2d%% | maj %.1f | SP-all %.1f | SP-humans-only %.1f" % (100 * f, m, s, h))
