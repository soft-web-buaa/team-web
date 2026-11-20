import numpy as np, time
from scipy.sparse.csgraph import dijkstra
from scipy.sparse import csr_matrix
R=C=14
nid=lambda r,c:r*C+c
edges=[];Ls=[]
for r in range(R):
    for c in range(C):
        for dr,dc in [(0,1),(1,0),(1,1),(1,-1)]:
            r2,c2=r+dr,c+dc
            if 0<=r2<R and 0<=c2<C:
                edges.append((nid(r,c),nid(r2,c2))); Ls.append(float(np.hypot(dr,dc)))
edges=np.array(edges); Ls=np.array(Ls); E=len(Ls); N=R*C
B=[nid(1,1),nid(1,12),nid(6,6),nid(12,1),nid(12,12),nid(2,7),nid(8,12),nid(10,4)]
A=np.zeros((E,N)); A[np.arange(E),edges[:,0]]=1; A[np.arange(E),edges[:,1]]=-1
def solve(D,s,t):
    g=D/Ls
    Lap=A.T@(g[:,None]*A)
    keep=[i for i in range(N) if i!=t]
    b=np.zeros(N); b[s]=1.0
    p=np.zeros(N)
    p[keep]=np.linalg.solve(Lap[np.ix_(keep,keep)]+1e-12*np.eye(N-1),b[keep])
    return g*(A@p)
def f(q,gam=1.8): return q**gam/(1+q**gam)
rng=np.random.default_rng(1)
D=np.ones(E); t0=time.time()
for it in range(1500):
    s,t=rng.choice(B,2,replace=False)
    Q=np.abs(solve(D,s,t)); D=np.maximum(D+0.2*(f(Q)-D),1e-6)
print("iterations=1500 grid=%dx%d nodes=%d edges=%d time=%.1fs"%(R,C,N,E,time.time()-t0))
sym=lambda rows,cols,w:csr_matrix((np.r_[w,w],(np.r_[rows,cols],np.r_[cols,rows])),shape=(N,N))
Gfull=sym(edges[:,0],edges[:,1],Ls)
dfull,pred=dijkstra(Gfull,indices=B,return_predecessors=True)
eidx={(int(u),int(v)):i for i,(u,v) in enumerate(edges)}
used=set()
for a,s in enumerate(B):
    for t in B:
        if t==s: continue
        cur=t
        while cur!=s:
            pr=int(pred[a,cur]); used.add(eidx[(min(cur,pr),max(cur,pr))]); cur=pr
dfull=dfull[:,B]
print("full_grid_total_length=%.1f  union_of_all_shortest_paths_length=%.1f (edges=%d)"%(Ls.sum(),Ls[list(used)].sum(),len(used)))
iu=np.triu_indices(len(B),1)
for thr in (0.02,0.05,0.1):
    keep=D>thr
    G=sym(edges[keep,0],edges[keep,1],Ls[keep])
    dk=dijkstra(G,indices=B)[:,B]
    conn=bool(np.isfinite(dk[iu]).all())
    det=float((dk[iu]/dfull[iu]).mean()) if conn else float('nan')
    print("threshold=%.2f kept_edges=%d total_length=%.1f all_buildings_connected=%s mean_detour=%.3f"%(thr,keep.sum(),Ls[keep].sum(),conn,det))
