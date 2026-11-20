import numpy as np
mu=np.array([8.0,5.0,3.0]); habit=np.array([0.4,0.4,0.2]); T=60
def lam(t): return 10+14*np.exp(-((t-30)/10.0)**2)
def waterfill(est,mu,n):
    lo,hi=0.0,(est.max()+n)/mu.min()+1.0
    for _ in range(60):
        mid=(lo+hi)/2
        if np.maximum(0.0,mid*mu-est).sum()>n: hi=mid
        else: lo=mid
    return np.maximum(0.0,hi*mu-est)
def run(policy,p,tau,seed):
    rng=np.random.default_rng(seed)
    Q=np.zeros(3); hist=[Q.copy()]; sent=[]; W=[]
    for t in range(T):
        A=int(rng.poisson(lam(t)))
        n_app=int(rng.binomial(A,p)) if policy!='none' else 0
        c=np.zeros(3)
        if A-n_app>0: c+=rng.multinomial(A-n_app,habit)
        mine=np.zeros(3)
        if n_app>0:
            snap=hist[max(0,t-tau)].copy()
            if policy=='naive':
                mine[np.argmin(snap/mu)]=n_app
            elif policy=='soft':
                pr=np.exp(-(snap/mu)/2.0); pr/=pr.sum()
                mine+=rng.multinomial(n_app,pr)
            elif policy=='coord':
                est=snap.copy()
                for m in range(max(0,t-tau),t):
                    est=np.maximum(0.0,est+sent[m]-mu)
                x=waterfill(est,mu,n_app)
                mine+=rng.multinomial(n_app,x/x.sum())
        sent.append(mine.copy()); c+=mine
        w=(Q+0.5*c)/mu
        for i in range(3):
            if c[i]>0: W.extend([w[i]]*int(c[i]))
        Q=np.maximum(0.0,Q+c-mu); hist.append(Q.copy())
    W=np.array(W)
    return W.mean(),np.percentile(W,95)
S=300
r=[run('none',0,0,s) for s in range(S)]
print("baseline_no_app mean_wait=%.2f p95=%.2f"%(np.mean([x[0] for x in r]),np.mean([x[1] for x in r])))
for tau in (0,5):
    for pol in ('naive','soft','coord'):
        for p in (0.2,0.5,1.0):
            r=[run(pol,p,tau,s) for s in range(S)]
            print("stale=%dmin %-5s adoption=%.1f mean_wait=%5.2f p95_wait=%5.2f"%(tau,pol,p,np.mean([x[0] for x in r]),np.mean([x[1] for x in r])))
