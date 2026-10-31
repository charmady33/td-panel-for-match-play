// Synthetic Matchplay API fixtures (shapes match what the live API returned on 2026-10-25)
const iso = ms => new Date(ms).toISOString();
const now = Date.now();
const names = 'Greg Gibson|Russ DeWolfe|William Hayden|April Kemp|Ace Lynn-miller|Rick Miller|Alisha Clarke|Summer Armistead|David Whitlock|Clark McCoy|Alex Clark OH|Allen Clark|Aaron Miller IN|Eric Anderson|Michael Hew|Alan Miller|Savannah Archuleta|Barry McCoy|Garrett Shahan|Brian Hayden|Tonya McCoy|Ethan Wade|Titus Parsons|Grace Parsons|Brian Fletcher|Austin Kemp|Alyssa Fagan-Clark|John Richardson'.split('|');
const pts = [36,34,34,34,34,32,32,32,32,30,30,30,30,28,28,28,28,26,26,26,25,25,24,24,24,24,24,22];
const pos = []; pts.forEach((p,i)=>{ pos.push(i && pts[i-1]===p ? pos[i-1] : i+1); });
const ranks = [288,1500,2100,800,3000,1020,4000,1976,1832,284,1132,9000,8000,966,728,7000,799,9500,90,504,6000,1965,12000,11000,13000,364,14000,1110];
const ineligB = new Set(names.filter((n,i)=>ranks[i]<=2000));
const players = names.map((n,i)=>({playerId:600000+i,name:n,ifpaId:10000+i,status:'active',organizerId:22114,claimedBy:null,labels:[],labelColor:null,
  tournamentPlayer:{status:'active',seed:i,labels: ineligB.has(n)&&i%2 ? ['B Ineligible'] : [],labelColor:'rose'}}));
const arenaNames = 'Eye Of The Tiger:1|Far Out:1|Red Baron:1|King Rock:1|Rescue 911:3|Time Zone:1|Mata Hari:2|Aztec (SS):2|Foo Fighters (Pro):3|Ninja Eclipse:3|Pharaoh:2|Stellar Wars:2|Diner:2|Gaucho:1'.split('|');
const arenas = arenaNames.map((s,i)=>{const [n,c]=s.split(':');return {arenaId:126380+i,name:n,status:'active',opdbId:'G'+i,categoryId:+c,labels:[],tournamentArena:{status:'active'}}});
const qual = {tournamentId:280051,name:'test matchplay addon',status:process.env.QSTATUS||'started',type:'group_matchplay',organizerId:22114,roundCount:3,gamesPerRound:2,arenaAssignment:'balanced',
  playoffsCutoffs:[{index:0,value:8,cumulative:8,text:'A FINALS CUTOFF',color:'green'},{index:1,value:8,cumulative:16,text:'B FINALS CUTOFF',color:'fuchsia'}],
  linkedTournaments:[{tournamentId:280073,name:'test matchplay addon A Finals',status:'planned',type:'group_bracket',linkType:'playoff',linkIndex:0},{tournamentId:280074,name:'test matchplay addon B Finals',status:'planned',type:'group_bracket',linkType:'playoff',linkIndex:1}],
  players, arenas, banks:[]};
const fin = (id,letter,ids)=>({tournamentId:id,name:`test matchplay addon ${letter} Finals`,status:'planned',type:'group_bracket',organizerId:22114,roundCount:2,gamesPerRound:3,arenaAssignment:'manual_banks',playoffsCutoffs:[],
  linkedTournaments:[{tournamentId:280051,name:'test matchplay addon',status:'started',type:'group_matchplay',linkType:'qualifying',linkIndex:0}],
  players: ids.map((pid,i)=>({...players.find(p=>p.playerId===pid),tournamentPlayer:{status:i<5?'active':'inactive',seed:i,labels:[]}})), arenas, banks:[{bankId:1,name:'Bank 1',status:'active',arenaIds:[126380,126384,126386]}]});
const finalsA = fin(280073,'A',[600000,600001,600002,600003,600004,600005,600006,600007]);
const finalsB = fin(280074,'B',[600011,600012]);
const standings = names.map((n,i)=>({playerId:600000+i,position:pos[i],points:pts[i].toFixed(2),onCutoffBubble: (pos[i]===6) || (pos[i]===14) ? true:null, cutoffBubbleColor: pos[i]===6?'green':pos[i]===14?'fuchsia':null,manualTiebreakerGroup:null}));
const t0 = now - 40*60e3;
const rounds = [{roundId:1,name:'Round 1',index:0,status:'completed',createdAt:iso(t0-60*60e3),completedAt:iso(t0-5*60e3)},{roundId:2,name:'Round 2',index:1,status:'started',createdAt:iso(t0),completedAt:null}];
const games = [];
let gid=1;
for (let set=0;set<7;set++) for (let idx=0;idx<2;idx++) {
  const a = arenas[(set*2+idx)%arenas.length];
  const pl = [0,1,2,3].map(k=>600000+((set*4+k)%28));
  const r1 = {gameId:gid++,roundId:1,arenaId:a.arenaId,bankId:null,set,index:idx,status:'completed',startedAt:iso(t0-60*60e3),duration:(idx?1500:700)+set*30,bye:false,playerIds:pl,resultPositions:pl,resultPoints:['7','5','3','1'],suggestions:[]};
  games.push(r1);
  const done = set<3 || (set===3 && idx===0);
  const g = {gameId:gid++,roundId:2,arenaId:a.arenaId,bankId:null,set,index:idx,status: done?'completed':'started',startedAt:iso(t0),duration: done ? 500+set*120+idx*300 : null,bye:false,playerIds:pl,resultPositions:done?pl:null,resultPoints:done?['7','5','3','1']:null,
    suggestions: set===4&&idx===0 ? [{suggestionId:1,playerId:pl[0],scores:{[pl[0]]:'1000',[pl[1]]:'900',[pl[2]]:'800',[pl[3]]:'700'},results:[]}] : set===5&&idx===0 ? [{suggestionId:2,playerId:pl[0],scores:{[pl[0]]:'1000',[pl[1]]:null},results:[]}] : []};
  games.push(g);
}
module.exports = { qual, finalsA, finalsB, standings, rounds, games, me:{userId:22114,name:'Clark McCoy'} };
