import numpy as np
K=3; mu=np.array([8.,5.,3.]); eq=mu/mu.sum()
def run(comp,R,rng):
    types=np.array([t for t,c in comp.items() for _ in range(c)]); N=len(types); cap=N*eq
    home=rng.choice(K,size=N,p=[.4,.4,.2])
    hist=[rng.multinomial(N,eq)/cap,rng.multinomial(N,eq)/cap]
    cum=np.zeros(N); out=[]
    ih,inn,ie,ia,io=[types==t for t in ('habit','naive','eq','avg','oracle')]
    for _ in range(R):
        last=hist[-1]; avg3=np.mean(hist[-3:],axis=0); ch=np.zeros(N,int)
        ch[ih]=home[ih]; ch[inn]=int(np.argmin(last)); ch[ie]=rng.choice(K,size=ie.sum(),p=eq); ch[ia]=int(np.argmin(avg3))
        if io.any():
            pred=np.bincount(home[ih],minlength=K).astype(float); pred[int(np.argmin(last))]+=inn.sum()
            pred+=ie.sum()*eq; pred[int(np.argmin(avg3))]+=ia.sum()
            for idx in np.where(io)[0]:
                j=int(np.argmin((pred+1)/cap)); ch[idx]=j; pred[j]+=1
        load=np.bincount(ch,minlength=K)/cap; cum+=-load[ch]; hist.append(load); out.append(cum.copy())
    return types,np.array(out)
pops={'P1 mixed (12 habit,12 naive,8 eq,7 avg,1 oracle; N=40)':{'habit':12,'naive':12,'eq':8,'avg':7,'oracle':1},
      'P2 naive-heavy (5 habit,25 naive,5 eq,4 avg,1 oracle)':{'habit':5,'naive':25,'eq':5,'avg':4,'oracle':1},
      'P3 nobody exploitable (39 eq,1 oracle)':{'eq':39,'oracle':1}}
S=3000; Rs=(5,10,20,30)
for name,comp in pops.items():
    rng=np.random.default_rng(11); per={t:[] for t in comp}; pct={R:[] for R in Rs}; top5={R:0 for R in Rs}; eqpct={R:[] for R in Rs}
    for _ in range(S):
        types,out=run(comp,30,rng)
        for t in comp: per[t].append(out[-1][types==t].mean()/30)
        io=np.where(types=='oracle')[0][0]; ie=np.where(types=='eq')[0][0]
        for R in Rs:
            sc=out[R-1]
            pct[R].append(((sc<sc[io]).sum()+0.5*((sc==sc[io]).sum()-1))/(len(sc)-1))
            top5[R]+= int((sc>sc[io]).sum()<5)
            eqpct[R].append(((sc<sc[ie]).sum()+0.5*((sc==sc[ie]).sum()-1))/(len(sc)-1))
    print(name)
    print("  mean payoff per round (equilibrium=-1.00): "+", ".join("%s %.2f"%(t,np.mean(v)) for t,v in per.items()))
    for R in Rs:
        print("  after %2d rounds: oracle percentile %.0f%%, P(top5/40)=%.0f%% | an equilibrium-random player: percentile %.0f%% (spread sd %.0f%%)"%(R,100*np.mean(pct[R]),100*top5[R]/S,100*np.mean(eqpct[R]),100*np.std(eqpct[R])))
