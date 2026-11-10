const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Planner=require('./route-planner'),Costs=require('./route-costs'),SortRoute=require('./sort-route');
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
const bars=Array.from({length:6},(_,i)=>({id:i+1,lat:38.91-Math.floor(i/2)*.002,lon:-77.04+i*.001}));
const ids=bars.map(b=>b.id),distances=ids.map((_,i)=>ids.map((_,j)=>i===j?0:40+(i*17+j*29)%110));
const walking={ids,distances};
const stations=[{id:'S',lines:['red','green']},{id:'T',lines:['blue']},{id:'U',lines:['green']}];
const metro={stations,walking:{bar_ids:ids,station_ids:stations.map(s=>s.id),to_bars:stations.map((_,i)=>ids.map((_,j)=>20+(i*41+j*59)%170)),from_bars:ids.map((_,i)=>stations.map((_,j)=>15+(i*31+j*23)%160))}};
// Unavailable pairs are not zero and must not disable reachable routes.
metro.walking.to_bars[1][2]=null;distances[4][0]=null;
const planner=Planner.create(bars,walking,metro),circles=Planner.circleTable(bars),sort=[6,2,4,1,5,3];
function brute(mode,start,end,cap,radius){
 const eligible=filter=>stations.map((s,i)=>({s,i})).filter(({s})=>filter==='any'||s.lines.includes(filter));
 const first=i=>start==='none'?0:Math.min(...eligible(start).map(({i:s})=>metro.walking.to_bars[s][i]??Infinity));
 const last=i=>end==='none'?0:Math.min(...eligible(end).map(({i:s})=>metro.walking.from_bars[i][s]??Infinity));
 let best={count:0,cost:Infinity,radius:Infinity},routes=0;
 function visit(order,mask,cost){
  if(order.length){
   routes++;const full=cost+last(order.at(-1)),r=circles.radii[mask];
   if(Number.isFinite(full)&&full<=cap+1e-7&&r<=radius+.001&&(order.length>best.count||(order.length===best.count&&(full<best.cost-1e-7||(Math.abs(full-best.cost)<1e-7&&r<best.radius))))){best={count:order.length,cost:full,radius:r};}
  }
  for(let j=0;j<bars.length;j++)if(!(mask&(1<<j))){
   const i=order.at(-1);
   if(i!==undefined&&mode==='north-south'&&Math.round(bars[j].lat*1e5)>Math.round(bars[i].lat*1e5))continue;
   if(i!==undefined&&mode==='sort'&&sort.indexOf(j+1)<sort.indexOf(i+1))continue;
   visit([...order,j],mask|(1<<j),cost+(i===undefined?first(j):(distances[i][j]??Infinity)));
  }
 }
 visit([],0,0);assert.ok(routes<50000);return best;
}
let cases=0;
for(const mode of ['shortest','north-south','sort','browse'])for(const [start,end] of [['none','none'],['red','none'],['none','blue'],['any','green'],['red','red'],['orange','any']])for(const [cap,radius] of [[Infinity,Infinity],[300,Infinity],[350,180],[0,0]]){
 const expected=brute(mode==='browse'?'shortest':mode,start,end,cap,radius);
 const result=planner.plan({ids,mode,sortOrder:sort,startMetro:start,endMetro:end,maxDistanceM:Number.isFinite(cap)?cap:null,maxRadiusM:Number.isFinite(radius)?radius:null});
 assert.equal(result.order.length,expected.count,`${mode} ${start}/${end}`);
 if(expected.count){
  near(result.distance_m,expected.cost);near(result.circle.radius_m,expected.radius);
  assert.equal(result.waypoint_order.length,result.order.length+(start==='none'?0:1)+(end==='none'?0:1));
  for(const [filter,endpoint] of [[start,result.start],[end,result.end]])if(endpoint)assert.ok(filter==='any'||stations.find(s=>s.id===endpoint.id).lines.includes(filter));
 }else{assert.equal(result.circle,null);assert.deepEqual(result.waypoint_order,[]);}
 cases++;
}
assert.ok(planner.cacheStats().tables<=4);

// Actual worker lifecycle: a changed live leg forces a different optimal subset.
const b=bars.slice(0,3),w={ids:[1,2,3],distances:[[0,10,30],[100,0,100],[100,30,0]]};
const m={stations:[{id:'S',lines:['red']}],walking:{bar_ids:w.ids,station_ids:['S'],to_bars:[[10,70,20]],from_bars:[[70],[10],[20]]}};
const messages=[],context={self:{postMessage:m=>messages.push(m)}};
vm.createContext(context);vm.runInContext(fs.readFileSync('work/route-planner.js','utf8')+'\n'+fs.readFileSync('work/planner-worker.js','utf8'),context);
const request={ids:w.ids,maxDistanceM:60,startMetro:'red',endMetro:'red'};
function run(revision){context.self.onmessage({data:{generation:revision,bars:b,walking:w,metro:m,distanceRevision:revision,request}});return JSON.parse(JSON.stringify(messages.at(-1).plan));}
const initial=run(0);assert.deepEqual(initial.order,[1,2]);
const observed={order:['S',1,2,'S'],distance_m:110,legs:[{from:'S',to:1,distance_m:10,duration_s:10},{from:1,to:2,distance_m:90,duration_s:90},{from:2,to:'S',distance_m:10,duration_s:10}]};
const correction=Costs.audit(observed,initial,w,m.walking,60,0);assert.equal(correction.action,'replan');
Costs.apply(correction.updates,w,m.walking);const replacement=run(1);
assert.equal(replacement.order.length,2);assert.notDeepEqual(replacement.order,initial.order);assert.ok(replacement.distance_m<=60);
// A varying service response cannot trigger unlimited reconciliation.
for(let attempt=0;attempt<=3;attempt++){
 observed.legs[1].distance_m=attempt%2?10:90;observed.distance_m=20+observed.legs[1].distance_m;
 const action=Costs.audit(observed,initial,w,m.walking,60,attempt);
 if(attempt===0){assert.equal(action.action,'error');continue;} // Already over cap, with no further update possible.
 if(attempt===3)assert.equal(action.action,'error');else {assert.equal(action.action,'replan');Costs.apply(action.updates,w,m.walking);}
}
const bad=structuredClone(observed);bad.legs[0].duration_s=-1;assert.throws(()=>Costs.audit(bad,initial,w,m.walking,60));
const stale=structuredClone(initial);stale.waypoint_order=['T',1,2,'S'];assert.throws(()=>Costs.audit(observed,stale,w,m.walking,60));

// Real snapshot: every line pair, both scopes, and all modes honor joint caps.
const realBars=JSON.parse(fs.readFileSync('work/bars.json')),realWalking={ids:realBars.map(b=>b.id),distances:JSON.parse(fs.readFileSync('work/routing/walking-matrix.json')).distances};
const realMetro={stations:JSON.parse(fs.readFileSync('work/metro-stations.json')).stations,walking:JSON.parse(fs.readFileSync('work/metro-walking.json'))};
const real=Planner.create(realBars,realWalking,realMetro),colors=['none','any','red','orange','silver','blue','yellow','green'];
for(const startMetro of colors)for(const endMetro of colors){
 const r=real.plan({ids:realWalking.ids,mode:'shortest',startMetro,endMetro,maxDistanceM:4828.032,maxRadiusM:1287.4752});
 assert.ok(r.distance_m<=4828.032+.001);assert.ok(!r.circle||r.circle.radius_m<=1287.4752+.001);assert.ok(real.cacheStats().tables<=4);
}
for(const mode of ['shortest','north-south','sort','browse']){
 const r=real.plan({ids:realWalking.ids.filter(id=>id!==11),sortOrder:realWalking.ids.filter(id=>id!==11).reverse(),mode,startMetro:'red',endMetro:'green',maxDistanceM:4828.032,maxRadiusM:1287.4752});
 assert.ok(!r.order.includes(11));assert.ok(r.distance_m<=4828.032+.001);
}
assert.ok(real.cacheStats().tables<=8);assert.equal(real.cacheStats().scopes,2);
const url=SortRoute.requestUrl([...realBars,...realMetro.stations],['MetroStnFullPt_98',11,'MetroStnFullPt_98']);assert.ok(url.includes('steps=true'));
console.log(`PASS: ${cases} exhaustive endpoint/mode/cap cases, unavailable pairs, empty/singleton loops, real 64 endpoint pairs, bounded caches, drift/revision and stabilization guard.`);
