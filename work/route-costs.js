/* Reconcile observed directed legs before an itinerary is displayed as ready. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RouteCosts=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const signature=order=>order.join('-');
 function edge(walking,metro,from,to){
  const a=walking.ids.indexOf(from),b=walking.ids.indexOf(to);
  if(a>=0&&b>=0)return [walking.distances[a],b];
  const s=metro.station_ids.indexOf(from),t=metro.station_ids.indexOf(to);
  const x=metro.bar_ids.indexOf(from),y=metro.bar_ids.indexOf(to);
  if(s>=0&&y>=0)return [metro.to_bars[s],y];
  if(x>=0&&t>=0)return [metro.from_bars[x],t];
  throw Error('Unknown walking edge');
 }
 function audit(route,plan,walking,metro,maxDistanceM,attempt=0){
  if(signature(route.order)!==signature(plan.waypoint_order)||route.legs.length!==plan.waypoint_order.length-1)throw Error('Directions do not match the selected stops');
  const sum=route.legs.reduce((total,leg)=>total+leg.distance_m,0);
  if(!Number.isFinite(route.distance_m)||route.distance_m<0||!Number.isFinite(sum)||Math.abs(sum-route.distance_m)>Math.max(.5,.1*route.legs.length))throw Error('Inconsistent walking distance');
  const over=maxDistanceM!==null&&route.distance_m>maxDistanceM+.001;
  const updates=[];
  route.legs.forEach((leg,i)=>{
   if(leg.from!==plan.waypoint_order[i]||leg.to!==plan.waypoint_order[i+1]||!Number.isFinite(leg.distance_m)||leg.distance_m<0||!Number.isFinite(leg.duration_s)||leg.duration_s<0)throw Error('Invalid walking cost');
   const [row,col]=edge(walking,metro,leg.from,leg.to),stored=row[col];
   // Rounded route totals can differ slightly from the sum of rounded leg costs.
   const distance=leg.distance_m+(over&&i===0?Math.max(0,route.distance_m-sum):0);
   if(!Number.isFinite(stored)||Math.abs(stored-distance)>(over?1e-7:.2))updates.push({from:leg.from,to:leg.to,distance_m:distance});
  });
  if(updates.length){
   if(attempt>=3)return {action:'error',updates:[],reason:'Walking distances keep changing. Please retry directions.'};
   return {action:'replan',updates};
  }
  if(over)return {action:'error',updates:[],reason:'The walking service returned a route above your distance limit. Please retry directions.'};
  return {action:'accept',updates:[]};
 }
 function apply(updates,walking,metro){
  for(const update of updates){const [row,col]=edge(walking,metro,update.from,update.to);row[col]=update.distance_m;}
 }
 return {signature,audit,apply};
});
