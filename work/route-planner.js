/* Exact subset selection. Browser worker and tests use this same implementation. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RoutePlanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const EARTH=6371000,EPS=1e-7;
 const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=a=>Math.hypot(...a);
 const unit=a=>{const d=norm(a);return d>1e-18?a.map(v=>v/d):null;};
 const vector=b=>{const lat=b.lat*Math.PI/180,lon=b.lon*Math.PI/180;return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];};
 const separation=(a,b)=>Math.atan2(norm(cross(a,b)),dot(a,b))*EARTH;
 const index=bit=>31-Math.clz32(bit);
 function circleTable(bars){
  const n=bars.length,size=1<<n,v=bars.map(vector),circles=[];
  const radii=new Float64Array(size).fill(Infinity),support=new Int32Array(size).fill(-1);
  function add(center,point){
   if(!center)return;
   const radius=separation(center,point);
   if(radius>Math.PI*EARTH/2)return;
   let mask=0,actual=radius;
   for(let j=0;j<n;j++){
    const d=separation(center,v[j]);
    if(d<=radius+.001){mask|=1<<j;actual=Math.max(actual,d);}
   }
   const circle={lat:Math.atan2(center[2],Math.hypot(center[0],center[1]))*180/Math.PI,lon:Math.atan2(center[1],center[0])*180/Math.PI,radius_m:actual};
   const c=circles.push(circle)-1;
   if(actual<radii[mask]){radii[mask]=actual;support[mask]=c;}
  }
  // A smallest containing spherical cap in this local region has 1, 2, or 3 support points.
  for(let a=0;a<n;a++){
   add(v[a],v[a]);
   for(let b=a+1;b<n;b++){
    add(unit(v[a].map((x,i)=>x+v[b][i])),v[a]);
    for(let c=b+1;c<n;c++){
     let center=unit(cross(v[b].map((x,i)=>x-v[a][i]),v[c].map((x,i)=>x-v[a][i])));
     if(center&&dot(center,v[a])<0)center=center.map(x=>-x);
     add(center,v[a]);
    }
   }
  }
  // Every subset of the cap's covered points fits that cap. Propagate minima downwards.
  for(let bit=1;bit<size;bit<<=1)for(let mask=1;mask<size;mask++)if(!(mask&bit)&&radii[mask|bit]<radii[mask]){
   radii[mask]=radii[mask|bit];support[mask]=support[mask|bit];
  }
  return {radii,circle:mask=>({...circles[support[mask]],radius_m:radii[mask]})};
 }
 function pathTable(matrix,latitudes,northSouth=false,startCosts=matrix.map(()=>0),endCosts=matrix.map(()=>0)){
  const n=matrix.length,size=1<<n,full=size-1;
  const dp=new Float64Array(size*n).fill(Infinity),parent=new Int8Array(size*n).fill(-1);
  const costs=new Float64Array(size).fill(Infinity),ends=new Int8Array(size).fill(-1);
  for(let j=0;j<n;j++)dp[(1<<j)*n+j]=startCosts[j];
  for(let mask=1;mask<size;mask++){
   const remaining=full^mask;
   for(let bits=mask;bits;){
    const bit=bits&-bits,i=index(bit);bits^=bit;
    const cost=dp[mask*n+i];
    if(!Number.isFinite(cost))continue;
    if(cost+endCosts[i]<costs[mask]-EPS){costs[mask]=cost+endCosts[i];ends[mask]=i;}
    for(let next=remaining;next;){
     const b=next&-next,j=index(b);next^=b;
     if(northSouth&&latitudes[j]>latitudes[i])continue;
     const offset=(mask|b)*n+j,total=cost+matrix[i][j];
     if(total<dp[offset]-EPS){dp[offset]=total;parent[offset]=i;}
    }
   }
  }
  function order(mask){
   const result=[];let end=ends[mask];
   while(end>=0){result.push(end);const previous=parent[mask*n+end];mask^=1<<end;end=previous;}
   result.reverse();
   if(!northSouth&&latitudes[result[0]]<latitudes[result.at(-1)]){
    const reversed=[...result].reverse();
    const cost=p=>p.slice(1).reduce((sum,j,i)=>sum+matrix[p[i]][j],startCosts[p[0]])+endCosts[p.at(-1)];
    if(cost(reversed)<=cost(result)+EPS)return reversed;
   }
   return result;
  }
  return {costs,order};
 }
 function sortedTable(matrix,indices,startCosts,endCosts){
  const size=1<<indices.length,costs=new Float64Array(size);
  for(let mask=1;mask<size;mask++){
   let cost=0,last=-1;
   for(const j of indices)if(mask&(1<<j)){cost+=last<0?startCosts[j]:matrix[last][j];last=j;}
   costs[mask]=cost+endCosts[last];
  }
  return {costs,order:mask=>indices.filter(i=>mask&(1<<i))};
 }
 function create(bars,walking,metro=null){
  const byId=new Map(bars.map(b=>[b.id,b])),matrixIndex=new Map(walking.ids.map((id,i)=>[id,i])),scopes=new Map();
  const available=d=>Number.isFinite(d)&&d>=0?d:Infinity;
  function endpoint(ids,filter,inbound){
   if(filter==='none')return {costs:ids.map(()=>0),stations:ids.map(()=>null)};
   if(!['any','red','orange','silver','blue','yellow','green'].includes(filter))throw Error('Invalid Metro line');
   if(!metro?.walking)throw Error('Metro walking distances unavailable');
   const data=metro.walking,bi=new Map(data.bar_ids.map((id,i)=>[id,i])),si=new Map(data.station_ids.map((id,i)=>[id,i]));
   const eligible=metro.stations.filter(s=>filter==='any'||s.lines.includes(filter));
   const costs=[],stations=[];
   for(const id of ids){
    let best=Infinity,station=null;
    for(const s of eligible){
     const row=si.get(s.id),col=bi.get(id);
     const d=available(inbound?data.to_bars[row]?.[col]:data.from_bars[col]?.[row]);
     if(d<best-EPS){best=d;station=s.id;}
    }
    costs.push(best);stations.push(station);
   }
   return {costs,stations};
  }
  function plan({ids,mode='shortest',sortOrder=ids,maxDistanceM=null,maxRadiusM=null,startMetro='none',endMetro='none'}){
   if(!ids.length||ids.length>16||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)||!matrixIndex.has(id)))throw Error('Invalid candidate bars');
   for(const value of [maxDistanceM,maxRadiusM])if(value!==null&&(!Number.isFinite(value)||value<0))throw Error('Invalid limit');
   const scopeKey=ids.join(','),n=ids.length,size=1<<n;
   let scope=scopes.get(scopeKey);
   if(!scope){
    const scoped=ids.map(id=>byId.get(id)),matrix=ids.map(a=>ids.map(b=>available(walking.distances[matrixIndex.get(a)]?.[matrixIndex.get(b)])));
    scope={bars:scoped,matrix,latitudes:scoped.map(b=>Math.round(b.lat*1e5)),circles:circleTable(scoped),tables:new Map(),counts:new Uint8Array(size)};
    for(let mask=1;mask<size;mask++)scope.counts[mask]=scope.counts[mask^(mask&-mask)]+1;
    scopes.set(scopeKey,scope);
    if(scopes.size>2)scopes.delete(scopes.keys().next().value);
   }
   const actualMode=mode==='browse'?'shortest':mode;
   if(!['shortest','north-south','sort'].includes(actualMode))throw Error('Unknown route mode');
   const start=endpoint(ids,startMetro,true),end=endpoint(ids,endMetro,false);
   function getTable(tableMode){
    const key=startMetro+'|'+endMetro+'|'+(tableMode==='sort'?'sort:'+sortOrder.join(','):tableMode);
    let table=scope.tables.get(key);
    if(!table){
    if(tableMode==='sort'){
     if(sortOrder.length!==n||new Set(sortOrder).size!==n||sortOrder.some(id=>!ids.includes(id)))throw Error('Invalid sort order');
     table=sortedTable(scope.matrix,sortOrder.map(id=>ids.indexOf(id)),start.costs,end.costs);
    }else table=pathTable(scope.matrix,scope.latitudes,tableMode==='north-south',start.costs,end.costs);
    }
    // Reuse a few recent configurations, never a catalogue of endpoint routes.
    scope.tables.delete(key);
    scope.tables.set(key,table);
    if(scope.tables.size>4)scope.tables.delete(scope.tables.keys().next().value);
    return table;
   }
   const table=getTable(actualMode);
   let best=0,bestCount=0,bestCost=Infinity,bestRadius=Infinity;
   for(let mask=1;mask<size;mask++){
    const count=scope.counts[mask],cost=table.costs[mask],radius=scope.circles.radii[mask];
    if(!Number.isFinite(cost)||count<bestCount||cost>(maxDistanceM??Infinity)+EPS||radius>(maxRadiusM??Infinity)+.001)continue;
    if(count>bestCount||cost<bestCost-EPS||(Math.abs(cost-bestCost)<=EPS&&radius<bestRadius-EPS)){
     best=mask;bestCount=count;bestCost=cost;bestRadius=radius;
    }
   }
   if(!best)return {order:[],waypoint_order:[],excluded:[...ids],distance_m:0,shortest_distance_m:0,circle:null,start:null,end:null,candidateCount:n,mode:actualMode};
   const localOrder=table.order(best),order=localOrder.map(i=>ids[i]);
   const first=localOrder[0],last=localOrder.at(-1);
   const distance=localOrder.slice(1).reduce((sum,j,i)=>sum+scope.matrix[localOrder[i]][j],start.costs[first])+end.costs[last];
   const startStation=start.stations[first]?{id:start.stations[first],distance_m:start.costs[first]}:null;
   const endStation=end.stations[last]?{id:end.stations[last],distance_m:end.costs[last]}:null;
   return {order,waypoint_order:[...(startStation?[startStation.id]:[]),...order,...(endStation?[endStation.id]:[])],start:startStation,end:endStation,excluded:ids.filter(id=>!order.includes(id)),distance_m:distance,shortest_distance_m:getTable('shortest').costs[best],circle:scope.circles.circle(best),candidateCount:n,mode:actualMode};
  }
  return {plan,cacheStats:()=>({scopes:scopes.size,tables:[...scopes.values()].reduce((n,s)=>n+s.tables.size,0)})};
 }
 return {create,circleTable,pathTable,separation,vector};
});
