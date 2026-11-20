import numpy as np
from scipy.optimize import linear_sum_assignment, milp, LinearConstraint, Bounds
from scipy.sparse import lil_matrix
def best_unrestricted(N,want):
    cost=np.full((N,N),1e6)
    for i in range(N):
        cost[i,i]=0.0
        for j in want[i]: cost[i,j]=-1.0
    r,c=linear_sum_assignment(cost)
    return int(sum(1 for i,j in zip(r,c) if i!=j))
def cycles_upto(N,want,maxlen):
    cyc=[]
    for i in range(N):
        for j in want[i]:
            if j>i and i in want[j]: cyc.append((i,j))
    if maxlen>=3:
        for i in range(N):
            for j in want[i]:
                if j<=i: continue
                for k in want[j]:
                    if k<=i or k==j: continue
                    if i in want[k]: cyc.append((i,j,k))
    return cyc
def solve_cycles(N,cyc):
    if not cyc: return 0
    m=len(cyc); M=lil_matrix((N,m))
    for idx,cy in enumerate(cyc):
        for v in cy: M[v,idx]=1
    c=-np.array([len(cy) for cy in cyc],float)
    res=milp(c=c,constraints=LinearConstraint(M.tocsr(),-np.inf,1),integrality=np.ones(m),bounds=Bounds(0,1))
    return int(round(-res.fun))
N=60; trials=100
print("N=%d participants, each holds 1 item and accepts k random other items; %d trials"%(N,trials))
for k in (1,2,3,5):
    rng=np.random.default_rng(100+k); a=[];b=[];c=[]
    for _ in range(trials):
        want=[set(int(x) for x in rng.choice([j for j in range(N) if j!=i],size=k,replace=False)) for i in range(N)]
        a.append(solve_cycles(N,cycles_upto(N,want,2)))
        b.append(solve_cycles(N,cycles_upto(N,want,3)))
        c.append(best_unrestricted(N,want))
    print("k=%d  pairs_only=%.1f%%  cycles_up_to_3=%.1f%%  any_cycle_length=%.1f%%"%(k,100*np.mean(a)/N,100*np.mean(b)/N,100*np.mean(c)/N))
