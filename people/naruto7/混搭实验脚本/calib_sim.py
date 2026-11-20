import numpy as np
from scipy.stats import norm
rng=np.random.default_rng(0); alpha=0.1
def iscore(l,u,y): return (u-l)+(2/alpha)*np.maximum(0,l-y)+(2/alpha)*np.maximum(0,y-u)
y=rng.standard_normal(2_000_000); ws=np.linspace(0.5,3.0,51)
e=[iscore(-w,w,y).mean() for w in ws]
print("truth~N(0,1): best symmetric half-width=%.2f (true 95%% quantile=1.645)"%ws[int(np.argmin(e))])
y=np.exp(rng.standard_normal(400_000)); q=np.quantile(y,np.linspace(0,1,2001)[1:-1])
ls=np.quantile(y,[0.01,0.02,0.03,0.04,0.05,0.06,0.08,0.10,0.15]); us=np.quantile(y,[0.85,0.90,0.92,0.94,0.95,0.96,0.97,0.98,0.99])
best=min(((iscore(l,u,y).mean(),a,b) for a,l in zip([0.01,0.02,0.03,0.04,0.05,0.06,0.08,0.10,0.15],ls) for b,u in zip([0.85,0.90,0.92,0.94,0.95,0.96,0.97,0.98,0.99],us)))
print("truth~lognormal: best (lower level, upper level) = (%.2f, %.2f); expected 5%% and 95%%"%(best[1],best[2]))
print("always-guess-huge-interval score vs honest: honest=%.2f, width-50 interval=%.2f"%(iscore(np.quantile(y,0.05),np.quantile(y,0.95),y).mean(),iscore(0,50,y).mean()))
for cov in (0.55,0.62,0.90):
    z=norm.ppf((1+cov)/2); s=1/z; c0=1.645*s
    print("coverage %.0f%% for stated 90%% intervals -> widen factor ~%.2f (normal-error assumption)"%(100*cov,c0))
print("estimating widen factor c0 from n questions: ratio chat/c0, 10th/50th/90th percentile over 20000 sims")
for c0 in (1.0,2.2):
    for n in (10,20,40,80):
        s=c0/1.645; z=np.abs(rng.normal(0,s,(20000,n))); est=np.quantile(z,0.9,axis=1)/c0
        print("  c0=%.1f n=%2d: %.2f / %.2f / %.2f"%(c0,n,*np.percentile(est,[10,50,90])))
print("SE of measured coverage with n=20: true 90%% -> %.1f pp, true 55%% -> %.1f pp"%(100*np.sqrt(.9*.1/20),100*np.sqrt(.55*.45/20)))
