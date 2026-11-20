import numpy as np, time
from scipy.sparse import csr_matrix, diags
from scipy.sparse.linalg import spsolve
from scipy.sparse.csgraph import dijkstra, minimum_spanning_tree
R=C=14; nid=lambda r,c:r*C+c
edges=[];Ls=[]
for r in range(R):
    for c in range(C):
        for dr,dc in [(0,1),(1,0),(1,1),(1,-1)]:
            r2,c2=r+dr,c+dc
            if 0<=r2<R and 0<=c2<C:
                edges.append((nid(r,c),nid(r2,c2))); Ls.append(float(np.hypot(dr,dc)))
edges=np.array(edges); Ls=np.array(Ls); E=len(Ls); N=R*C
B=[nid(1,1),nid(1,12),nid(6,6),nid(12,1),nid(12,12),nid(2,7),nid(8,12),nid(10,4)]
A=csr_matrix((np.r_[np.ones(E),-np.ones(E)],(np.r_[np.arange(E),np.arange(E)],np.r_[edges[:,0],edges[:,1]])),shape=(E,N))
def solve(D,s,t):
    g=D/Ls; Lap=(A.T@diags(g)@A).tocsc()
    keep=np.array([i for i in range(N) if i!=t]); b=np.zeros(N); b[s]=1.0
    sub=(Lap[keep][:,keep]+diags(np.full(N-1,1e-12))).tocsc()
    p=np.zeros(N); p[keep]=spsolve(sub,b[keep]); return g*(A@p)
f=lambda q,gam=1.8:q**gam/(1+q**gam)
sym=lambda rr,cc,w:csr_matrix((np.r_[w,w],(np.r_[rr,cc],np.r_[cc,rr])),shape=(N,N))
dfull,pred=dijkstra(sym(edges[:,0],edges[:,1],Ls),indices=B,return_predecessors=True)
dB=dfull[:,B]; iu=np.triu_indices(len(B),1)
eidx={(int(u),int(v)):i for i,(u,v) in enumerate(edges)}
def evaluate(mask):
    dk=dijkstra(sym(edges[mask,0],edges[mask,1],Ls[mask]),indices=B)[:,B]
    conn=bool(np.isfinite(dk[iu]).all())
    return conn,float(Ls[mask].sum()),(float((dk[iu]/dB[iu]).mean()) if conn else None)
T=minimum_spanning_tree(csr_matrix(dB)).tocoo(); tree=set()
for a,b_ in zip(T.row,T.col):
    cur=B[b_]; s=B[a]
    while cur!=s:
        pr=int(pred[a,cur]); tree.add(eidx[(min(cur,pr),max(cur,pr))]); cur=pr
m=np.zeros(E,bool); m[list(tree)]=True
conn,length,det=evaluate(m)
print("MST_baseline: edges=%d length=%.1f connected=%s mean_detour=%.3f"%(len(tree),length,conn,det))
thrs=[0.005,0.01,0.02,0.03,0.04,0.05,0.07,0.1]; stats={t:[] for t in thrs}; t0=time.time()
for seed in range(1,6):
    rng=np.random.default_rng(seed); D=np.ones(E)
    for it in range(1500):
        s,t=rng.choice(B,2,replace=False)
        Q=np.abs(solve(D,s,t)); D=np.maximum(D+0.2*(f(Q)-D),1e-6)
    for th in thrs: stats[th].append(evaluate(D>th)+(int((D>th).sum()),))
print("5 seeds x 1500 iterations, %.0fs total"%(time.time()-t0))
for th in thrs:
    ok=[x for x in stats[th] if x[0]]
    msg="thr=%.3f connected %d/5"%(th,len(ok))
    if ok: msg+="  mean_edges=%.0f mean_length=%.1f mean_detour=%.3f"%(np.mean([x[3] for x in ok]),np.mean([x[1] for x in ok]),np.mean([x[2] for x in ok]))
    print(msg)
