global.window=global; global.document={querySelector:()=>null,querySelectorAll:()=>[]};
for (const f of ['util','api','timing','banks','data','finals']) require(require('path').join(__dirname, '../src/')+f+'.js');
const T=window.TDP, D=T.data.D;
D.t={type:'group_bracket',roundCount:2,players:[1,2,3,4,5,6,7,8].map(i=>({playerId:i,name:'P'+i}))};
const g=(id,set,idx,pl,pts,round=1,st='completed')=>({gameId:id,roundId:round,set,index:idx,status:st,playerIds:pl,resultPoints:pts.map(String)});
D.rounds=[{roundId:1,name:'Semifinals',index:0,status:'started'}];
D.games=[g(1,0,0,[1,4,5,8],[7,5,3,1]),g(2,0,1,[1,4,5,8],[1,7,5,3]),g(3,0,2,[1,4,5,8],[5,1,7,3]), g(4,1,0,[2,3,6,7],[7,5,3,1]),g(5,1,1,[2,3,6,7],[7,5,3,1]),g(6,1,2,[2,3,6,7],[7,5,3,1])];
console.log('semis', JSON.stringify(T.finals.groupTies(D)));
D.games.push({gameId:9,roundId:1,set:9999,index:null,status:'started',playerIds:[4,5],resultPoints:null});
console.log('semis+tb', JSON.stringify(T.finals.groupTies(D).map(t=>[t.kind,t.tbOpen,t.tbDone])));
D.rounds=[{roundId:1,name:'Semifinals',index:0,status:'completed'},{roundId:2,name:'Finals',index:1,status:'started'}];
D.games=[g(11,0,0,[1,2,3,4],[7,5,3,1],2),g(12,0,1,[1,2,3,4],[5,7,1,3],2),g(13,0,2,[1,2,3,4],[1,3,7,5],2)];
console.log('final', JSON.stringify(T.finals.groupTies(D).map(t=>t.why)));
// the B Finals case: 15/15 tied for 1st and 9/9 for 3rd
D.games=[g(21,0,0,[1,2,3,4],[5,1,7,3],2),g(22,0,1,[1,2,3,4],[3,7,5,1],2),g(23,0,2,[1,2,3,4],[1,7,3,5],2)];
console.log('both', JSON.stringify(T.finals.groupTies(D).map(t=>[t.pts,t.place,t.ids,t.why])));
// Matchplay added a tiebreaker game for players 2 and 3
D.games.push({gameId:30,roundId:2,set:9999,index:0,status:'started',playerIds:[3,2],arenaId:null,resultPoints:null});
console.log('mp tb', JSON.stringify(T.finals.groupTies(D).map(t=>[t.pts,t.tbOpen,!!t.tbGame,t.tbDone])));
D.games[D.games.length-1]={...D.games[D.games.length-1],status:'completed',resultPositions:[3,2]};
console.log('mp tb done', JSON.stringify(T.finals.groupTies(D).map(t=>[t.pts,t.tbDone,t.tbOrder])));
