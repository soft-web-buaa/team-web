import numpy as np
from scipy.optimize import linear_sum_assignment, milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
def unlimited(N,want):
    cost=np.full((N,N),1e6)
    for i in range(N):
        cost[i,i]=0.0
        for j in want[i]: cost[i,j]=-1.0
    r,c=linear_sum_assignment(cost)
    return int(sum(1 for i,j in zip(r,c) if i!=j))
def enum_cycles(N,want,maxlen):
    out=[]
    def dfs(start,path,vis):
        cur=path[-1]
        for nxt in want[cur]:
            if nxt==start:
                if len(path)>=2: out.append(tuple(path))
            elif nxt>start and nxt not in vis and len(path)<maxlen:
                vis.add(nxt); path.append(nxt); dfs(start,path,vis); path.pop(); vis.discard(nxt)
    for s in range(N): dfs(s,[s],{s})
    return out
def pack(N,cycles):
    if not cycles: return 0
    m=len(cycles); M=lil_matrix((N,m))
    for idx,cy in enumerate(cycles):
        for v in cy: M[v,idx]=1
    c=-np.array([len(cy) for cy in cycles],float)
    res=milp(c=c,constraints=LinearConstraint(M.tocsr(),-np.inf,1),integrality=np.ones(m),bounds=Bounds(0,1))
    return int(round(-res.fun))
N=60; trials=40; k=3
print("N=%d k=%d trials=%d; item j has popularity ~ 1/rank^alpha; %% of people who get a swap"%(N,k,trials))
for alpha in (0.0,0.8,1.2):
    rng=np.random.default_rng(900+int(alpha*10))
    pop=1.0/np.arange(1,N+1)**alpha
    acc={L:[] for L in (2,3,4,5)}; inf=[]
    for _ in range(trials):
        perm=rng.permutation(N); pw=pop[np.argsort(perm)]
        want=[]
        for i in range(N):
            cand=np.array([j for j in range(N) if j!=i]); pr=pw[cand]; pr=pr/pr.sum()
            want.append(set(int(x) for x in rng.choice(cand,size=k,replace=False,p=pr)))
        cy=enum_cycles(N,want,5)
        for L in acc: acc[L].append(pack(N,[c for c in cy if len(c)<=L]))
        inf.append(unlimited(N,want))
    print("alpha=%.1f  "%alpha+"  ".join("cap%d=%.1f%%"%(L,100*np.mean(acc[L])/N) for L in acc)+"  unlimited=%.1f%%"%(100*np.mean(inf)/N))
