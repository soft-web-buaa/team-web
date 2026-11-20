import numpy as np
mu=np.array([8.0,5.0,3.0]); T=60
def lam(t): return 10+14*np.exp(-((t-30)/10.0)**2)
def waterfill(est,mu,n):
    lo,hi=0.0,(est.max()+n)/mu.min()+1.0
    for _ in range(60):
        mid=(lo+hi)/2
        if np.maximum(0.0,mid*mu-est).sum()>n: hi=mid
        else: lo=mid
    return np.maximum(0.0,hi*mu-est)
def run(policy,p,tau,comply,habit,seed):
    rng=np.random.default_rng(seed)
    Q=np.zeros(3); hist=[Q.copy()]; sent=[]; W=[]
    for t in range(T):
        A=int(rng.poisson(lam(t)))
        n_app=int(rng.binomial(A,p)) if policy!='none' else 0
        c=np.zeros(3)
        if A-n_app>0: c+=rng.multinomial(A-n_app,habit)
        rec=np.zeros(3)
        if n_app>0:
            snap=hist[max(0,t-tau)].copy()
            if policy=='naive': rec[np.argmin(snap/mu)]=n_app
            else:
                est=snap.copy()
                for m in range(max(0,t-tau),t): est=np.maximum(0.0,est+sent[m]-mu)
                x=waterfill(est,mu,n_app); rec=rng.multinomial(n_app,x/x.sum()).astype(float)
            fol=np.array([rng.binomial(int(rec[i]),comply) for i in range(3)],float)
            c+=fol
            rest=n_app-int(fol.sum())
            if rest>0: c+=rng.multinomial(rest,habit)
        sent.append(rec.copy())
        w=(Q+0.5*c)/mu
        for i in range(3):
            if c[i]>0: W.extend([w[i]]*int(c[i]))
        Q=np.maximum(0.0,Q+c-mu); hist.append(Q.copy())
    W=np.array(W); return W.mean(),np.percentile(W,95)
S=200
habits={'H1(0.4/0.4/0.2)':np.array([.4,.4,.2]),'H2(uniform)':np.array([1/3,1/3,1/3]),'H3(capacity-matched)':mu/mu.sum()}
rows=[]
for hn,h in habits.items():
    base=np.mean([run('none',0,0,1,h,s) for s in range(S)],axis=0)
    print("%s baseline mean=%.2f p95=%.2f"%(hn,*base))
    for tau in (0,2,5,8):
        for p in (0.5,1.0):
            for cp in (1.0,0.6):
                r={}
                for pol in ('naive','coord'):
                    r[pol]=np.mean([run(pol,p,tau,cp,h,s) for s in range(S)],axis=0)
                rows.append((hn,tau,p,cp,base,r['naive'],r['coord']))
n=len(rows)
nw=sum(1 for r in rows if r[5][0]>r[4][0]*1.02); cw=sum(1 for r in rows if r[6][0]>r[4][0]*1.02)
cb=sum(1 for r in rows if r[6][0]<r[5][0]*0.98); nb=sum(1 for r in rows if r[5][0]<r[6][0]*0.98)
print("configs=%d | naive worse than no-app (mean wait +2%%): %d | coord worse than no-app: %d | coord better than naive: %d | naive better than coord: %d"%(n,nw,cw,cb,nb))
print("--- selected rows: habit tau p comply | none | naive | coord (mean/p95)")
for r in rows:
    if r[0].startswith('H1') and r[2]==1.0 and r[1] in (0,5,8):
        print("%s tau=%d p=%.1f comply=%.1f | %.2f/%.2f | %.2f/%.2f | %.2f/%.2f"%(r[0][:2],r[1],r[2],r[3],*r[4],*r[5],*r[6]))
print("--- where naive is worse than no-app:")
for r in rows:
    if r[5][0]>r[4][0]*1.02: print("%s tau=%d p=%.1f comply=%.1f | none %.2f | naive %.2f | coord %.2f"%(r[0][:2],r[1],r[2],r[3],r[4][0],r[5][0],r[6][0]))
