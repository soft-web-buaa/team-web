import numpy as np
from scipy.optimize import linear_sum_assignment, milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
def unlimited(N,want):
    cost=np.full((N,N),1e6)
    for i in range(N):
        cost[i,i]=0.0
        for j in want[i]: cost[i,j]=-1.0
    r,c=linear_sum_assignment(cost)
    perm=dict(zip(r.tolist(),c.tolist())); seen=set(); lens=[]
    for i in range(N):
        if i in seen: continue
        cur=i; cyc=[]
        while cur not in seen:
            seen.add(cur); cyc.append(cur); cur=perm[cur]
        if len(cyc)>1: lens.append(len(cyc))
    return lens
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
N=60; trials=30; caps=(2,3,4,5,6)
print("N=%d, each holds 1 item, accepts k random other items, %d trials; numbers = %% of people who get a swap"%(N,trials))
for k in (2,3,5):
    rng=np.random.default_rng(500+k)
    res={L:[] for L in caps}; inf=[]; longest=[]; s3=[]; s5=[]
    for _ in range(trials):
        want=[set(int(x) for x in rng.choice([j for j in range(N) if j!=i],size=k,replace=False)) for i in range(N)]
        cy=enum_cycles(N,want,6)
        for L in caps: res[L].append(pack(N,[c for c in cy if len(c)<=L]))
        lens=unlimited(N,want); inf.append(sum(lens))
        if lens:
            tot=sum(lens); longest.append(max(lens))
            s3.append(sum(l for l in lens if l<=3)/tot); s5.append(sum(l for l in lens if l<=5)/tot)
    row="  ".join("cap%d=%.1f%%"%(L,100*np.mean(res[L])/N) for L in caps)
    print("k=%d  %s  unlimited=%.1f%%"%(k,row,100*np.mean(inf)/N))
    print("      unlimited-solution longest ring: mean %.1f, max %d; share of swappers in rings<=3: %.0f%%, <=5: %.0f%%"%(np.mean(longest),max(longest),100*np.mean(s3),100*np.mean(s5)))
