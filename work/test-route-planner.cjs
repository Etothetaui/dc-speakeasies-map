const assert=require('node:assert/strict');
const fs=require('node:fs');
const {create,circleTable,separation,vector}=require('./route-planner');
const near=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

// Known spherical circles, containment, and subset monotonicity.
const points=[{id:1,lat:0,lon:0},{id:2,lat:0,lon:2},{id:3,lat:1,lon:1}];
const circles=circleTable(points),pair=circles.circle(3);
near(pair.lat,0);near(pair.lon,1);near(pair.radius_m,Math.PI/180*6371000);
near(circles.circle(7).radius_m,pair.radius_m);
for(let mask=1;mask<8;mask++){
 const c=circles.circle(mask),center=vector(c);
 for(let i=0;i<3;i++)if(mask&(1<<i))assert.ok(separation(center,vector(points[i]))<=c.radius_m+.002);
 for(let i=0;i<3;i++)if(mask&(1<<i))assert.ok(circles.radii[mask^(1<<i)]<=c.radius_m+.001||!(mask^(1<<i)));
}

// Exhaustively enumerate legal routes on a directed fixture. This oracle has no DP.
const sample=Array.from({length:7},(_,i)=>({id:20+i,lat:38.91-Math.floor(i/2)*.003,lon:-77.05+(i%3)*.004}));
// An independent planar support-circle oracle on a local tangent plane. At this
// fixture's scale, spherical curvature changes the radius by much less than 1 cm.
const lon0=-77.046*Math.PI/180,lat0=38.905*Math.PI/180;
const east=[-Math.sin(lon0),Math.cos(lon0),0],north=[-Math.sin(lat0)*Math.cos(lon0),-Math.sin(lat0)*Math.sin(lon0),Math.cos(lat0)];
const xy=sample.map(b=>{const v=vector(b);return [v.reduce((s,x,i)=>s+x*east[i],0)*6371000,v.reduce((s,x,i)=>s+x*north[i],0)*6371000];});
function planarRadius(mask){
 const p=xy.filter((_,i)=>mask&(1<<i)),candidates=p.map(a=>[a[0],a[1],0]);
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  const a=p[i],b=p[j],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;candidates.push([x,y,Math.hypot(a[0]-x,a[1]-y)]);
  for(let k=j+1;k<p.length;k++){
   const c=p[k],d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
   if(Math.abs(d)<1e-8)continue;
   const aa=a[0]**2+a[1]**2,bb=b[0]**2+b[1]**2,cc=c[0]**2+c[1]**2;
   const x=(aa*(b[1]-c[1])+bb*(c[1]-a[1])+cc*(a[1]-b[1]))/d,y=(aa*(c[0]-b[0])+bb*(a[0]-c[0])+cc*(b[0]-a[0]))/d;
   candidates.push([x,y,Math.hypot(a[0]-x,a[1]-y)]);
  }
 }
 return Math.min(...candidates.filter(([x,y,r])=>p.every(a=>Math.hypot(a[0]-x,a[1]-y)<=r+.000001)).map(c=>c[2]));
}
const sphere=circleTable(sample);
for(let mask=1;mask<128;mask++)near(sphere.radii[mask],planarRadius(mask),.01);
const distances=sample.map((_,i)=>sample.map((_,j)=>i===j?0:((i*31+j*53+i*j*11)%83+5)*10));
const walking={ids:sample.map(b=>b.id),distances},planner=create(sample,walking),areas=circleTable(sample);
const fixed=[4,0,6,2,5,1,3],rank=new Map(fixed.map((id,i)=>[id,i]));
function brute(mode,length,radius){
 let count=0,cost=Infinity,minRadius=Infinity;
 function visit(order,mask,distance){
  const r=areas.radii[mask];
  if(order.length&&distance<=length+1e-7&&r<=radius+.001){
   if(order.length>count||(order.length===count&&(distance<cost-1e-7||(Math.abs(distance-cost)<1e-7&&r<minRadius)))){count=order.length;cost=distance;minRadius=r;}
  }
  for(let j=0;j<sample.length;j++)if(!(mask&(1<<j))){
   const previous=order.at(-1);
   if(previous!==undefined&&mode==='north-south'&&Math.round(sample[j].lat*1e5)>Math.round(sample[previous].lat*1e5))continue;
   if(previous!==undefined&&mode==='sort'&&rank.get(j)<rank.get(previous))continue;
   visit([...order,j],mask|(1<<j),distance+(previous===undefined?0:distances[previous][j]));
  }
 }
 visit([],0,0);return {count,cost,minRadius};
}
for(const mode of ['shortest','north-south','sort'])for(const [length,radius] of [[Infinity,Infinity],[800,Infinity],[1700,Infinity],[2000,500],[900,350],[0,0]]){
 const expected=brute(mode,length,radius);
 const result=planner.plan({ids:walking.ids,mode,sortOrder:fixed.map(i=>sample[i].id),maxDistanceM:Number.isFinite(length)?length:null,maxRadiusM:Number.isFinite(radius)?radius:null});
 assert.equal(result.order.length,expected.count,`${mode}: most bars`);
 near(result.distance_m,expected.cost);near(result.circle.radius_m,expected.minRadius);
 assert.equal(new Set([...result.order,...result.excluded]).size,7);
}
assert.throws(()=>planner.plan({ids:[20,20]}));
assert.throws(()=>planner.plan({ids:walking.ids,maxRadiusM:-1}));

// Real data: unlimited routes preserve the exact preset optima; constraints combine.
const bars=JSON.parse(fs.readFileSync('work/bars.json','utf8'));
const matrix=JSON.parse(fs.readFileSync('work/routing/walking-matrix.json','utf8')).distances;
const real=create(bars,{ids:bars.map(b=>b.id),distances:matrix});
const started=performance.now();
for(const file of ['routes.json','routes-dc.json']){
 const saved=JSON.parse(fs.readFileSync('work/'+file,'utf8'));
 for(const old of saved.routes){
  const result=real.plan({ids:[...old.order].sort((a,b)=>a-b),mode:old.key});
  near(result.distance_m,old.matrix_distance_m);
  assert.deepEqual(result.order,old.order,'Default cache can be reused');
 }
}
const ids=bars.filter(b=>b.id!==11).map(b=>b.id);
for(const mode of ['shortest','north-south','sort','browse']){
 let previous=0;
 for(const length of [0,1609.344,3*1609.344,5*1609.344,Infinity]){
  const result=real.plan({ids,mode,sortOrder:[...ids].reverse(),maxDistanceM:Number.isFinite(length)?length:null,maxRadiusM:.8*1609.344});
  assert.ok(result.order.length>=previous);previous=result.order.length;
  assert.ok(result.distance_m<=length+1e-7);assert.ok(result.circle.radius_m<=.8*1609.344+.001);
  assert.ok(!result.order.includes(11));
 }
}
console.log(`PASS: exhaustive joint-optimum oracle in all modes, spherical containment, zero limits, DC scope, preset parity, and monotonic limits (${Math.round(performance.now()-started)} ms real-data checks).`);
