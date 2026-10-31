global.window=global; global.document={querySelector:()=>null,querySelectorAll:()=>[]};
for (const f of ['util','api','timing','banks']) require(require('path').join(__dirname, '../src/')+f+'.js');
const T=window.TDP;
const names=['Aztec','Cinema','Cleopatra (EM)','Doodle Bug','El Paso','Fortune','Hot Shot','Mata Hari','Pharaoh','Pinball (EM)','Sing Along','Sky Jump','Sea Ray','Speakeasy'];
const est=names.map((n,i)=>({arenaId:100+i,name:n,era:i===7||i===8?'SS':'EM',sec:i===7||i===8?720:540}));
const res={};
for (let n=1;n<=12;n++){ let inBank=0, cross=0, crossNeeded=n*2>est.length;
  for (let k=0;k<200;k++){ const r=T.banks.build(est,n,2,{seed:k*7919+n}); 
    for (const b of r.banks){ const s=new Set(b.games.map(g=>g.name)); if (s.size<b.games.length) inBank++; }
    const all=r.banks.flatMap(b=>b.games.map(g=>g.name)); if (new Set(all).size<all.length) cross++; }
  res[n]={inBankDup:inBank, crossRepeat:cross, repeatsUnavoidable:crossNeeded}; }
console.log(JSON.stringify(res));
