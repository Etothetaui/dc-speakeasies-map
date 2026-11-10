// Route/selection lifecycle. Inserted into the map's existing closure by the builder.
for(const id of ['start-metro','end-metro']){
 $(id).innerHTML='<option value="none">No Metro</option><option value="any">Any line</option>'+metroData.lines.map(line=>'<option value="'+line.id+'">'+esc(line.name)+' line</option>').join('');
 $(id).addEventListener('change',()=>{try{localStorage.setItem('dc-after-hours-metro-endpoints',JSON.stringify(readMetro()));}catch{}requestPlan();});
}
try{const saved=JSON.parse(localStorage.getItem('dc-after-hours-metro-endpoints'));for(const [key,id] of [['startMetro','start-metro'],['endMetro','end-metro']])if([...$(id).options].some(o=>o.value===saved?.[key]))$(id).value=saved[key];}catch{}
function readMetro(){return {startMetro:$('start-metro').value,endMetro:$('end-metro').value};}
function updateLimitLabels(){
 for(const [id,max] of [['max-length',60],['max-radius',10]]){
  const value=Number($(id).value),text=value>=max?'No limit':value.toFixed(1)+' mi';
  $(id+'-value').textContent=text;$(id).setAttribute('aria-valuetext',text);
 }
}
function readLimits(){return {maxDistanceM:Number($('max-length').value)>=60?null:Number($('max-length').value)*1609.344,maxRadiusM:Number($('max-radius').value)>=10?null:Number($('max-radius').value)*1609.344};}
function changeLimits(){
 updateLimitLabels();
 try{localStorage.setItem('dc-after-hours-limits',JSON.stringify({length:Number($('max-length').value),radius:Number($('max-radius').value)}));}catch{}
 requestPlan();
}
function updateScopeControls(){
 const count=includedBars().length,total=scopeIds().length;
 $('dc-only').checked=dcOnly;
 $('scope-note').innerHTML=count+' of '+total+' speakeasies & hidden bars<br>'+(dcOnly?'Washington, DC':'Washington, DC + Alexandria');
 $('map').setAttribute('aria-label','Map with '+count+' included bar locations');
 for(const option of $('route-select').options){
  const title={shortest:'Shortest route','north-south':'North to south',sort:'Route by list sort'}[option.value];
  if(title)option.textContent=title+' · '+count+(count===1?' bar':' bars');
 }
}
function changeScope(){
 cancelRouteRequest();dcOnly=$('dc-only').checked;
 routeReference=BarListOrder.restrictReference(routeReference,scopeIds());saveRouteReference();
 try{localStorage.setItem('dc-after-hours-dc-only',String(dcOnly));}catch{}
 if(selected&&!scopeIds().includes(selected)){selected=null;$('detail').hidden=true;}
 currentPlan=null;activeRoute=null;radiusLayer.clearLayers();paintRoute('pending');updateScopeControls();requestPlan();
}
function cancelRouteRequest(){routeGeneration++;clearTimeout(routeTimer);routeTimer=null;routeAbort?.abort();routeAbort=null;}
function selectRoute(key,{restoreReference=false}={}){
 const entering=routeMode!=='sort';
 if(key==='sort'&&entering&&!(restoreReference&&BarListOrder.validOrder(routeReference,scopeIds()))){
  const current=BarListOrder.restrictReference(currentPlan?.order||activeRoute?.order||scopeRoutes()[0].order,scopeIds());
  routeReference=BarListOrder.referenceForChange(routeReference,current,listSettings,listSettings,true);saveRouteReference();
 }
 routeMode=key;updateSortControls();
 try{localStorage.setItem('dc-after-hours-route',key);}catch{}
 requestPlan();
}
function queueSortedRoute(){requestPlan();}
function plannerFailure(message){
 $('route-summary').dataset.state='error';
 $('planner-status').dataset.state='error';
 $('planner-status').innerHTML='<strong>Couldn’t calculate this selection.</strong><p>'+esc(message)+'</p><button id="retry-plan" class="text-button">Retry calculation</button>';
 $('retry-plan').addEventListener('click',requestPlan);
}
function requestPlan({reconcile=false}={}){
 cancelRouteRequest();const generation=routeGeneration;
 if(!reconcile)reconcileAttempts=0;
 updateScopeControls();
 $('planner-status').dataset.state='pending';
 $('planner-status').innerHTML='<strong class="planner-busy">'+(reconcile?'Updating walking estimates…':'Finding the best group…')+'</strong><p>Checking both limits and Metro choices across '+scopeIds().length+' bars.</p>';
 $('route-summary').dataset.state='pending';
 $('route-summary').innerHTML='<div class="route-totals"><strong class="route-loading">Calculating selection…</strong></div><p class="route-meta">The current result stays visible until the new group is ready.</p>';
 routeTimer=setTimeout(()=>{
  plannerWorker.postMessage({generation,bars,walking:routeData.walking,metro:{stations:metroData.stations,walking:metroData.walking},distanceRevision,request:{ids:scopeIds(),mode:routeMode,sortOrder:BarListOrder.sort(scopeBars(),listSettings,routeReference).map(b=>b.id),...readLimits(),...readMetro()}});
 },100);
}
plannerWorker.onmessage=event=>{
 const {generation,plan,error}=event.data;
 if(generation!==routeGeneration)return;
 if(error){plannerFailure(error);return;}
 applyPlan(plan,generation);
};
plannerWorker.onerror=()=>plannerFailure('The background calculation stopped. Reload the map to retry.');
function applyPlan(plan,generation){
 currentPlan=plan;
 if(selected&&!plan.order.includes(selected)){selected=null;$('detail').hidden=true;}
 activeRoute=null;
 const limits=readLimits(),count=plan.order.length,scope=scopeIds();
 radiusLayer.clearLayers();
 showChosenMetro(plan);
 if(plan.circle&&limits.maxRadiusM!==null){
  L.circle([plan.circle.lat,plan.circle.lon],{radius:limits.maxRadiusM,color:'#a37435',weight:2,dashArray:'7 5',fillColor:'#c89a50',fillOpacity:.07,interactive:false}).addTo(radiusLayer);
  L.marker([plan.circle.lat,plan.circle.lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'radius-center',iconSize:[10,10],iconAnchor:[5,5]})}).addTo(radiusLayer);
 }
 const status=$('planner-status');status.dataset.state='ready';status.dataset.included=String(count);status.dataset.excluded=plan.excluded.join(',');status.dataset.order=plan.order.join(',');status.dataset.radiusM=plan.circle?String(plan.circle.radius_m):'';status.dataset.distanceM=String(plan.distance_m);status.dataset.centerLat=plan.circle?String(plan.circle.lat):'';status.dataset.centerLon=plan.circle?String(plan.circle.lon):'';status.dataset.startMetro=plan.start?.id||'';status.dataset.endMetro=plan.end?.id||'';status.dataset.distanceRevision=String(distanceRevision);
 status.innerHTML=count?'<strong>Keeping '+count+' of '+scope.length+' bars</strong><p>Fits within '+miles(plan.circle.radius_m)+' radius'+(routeMode==='browse'?' · '+miles(plan.distance_m)+' shortest walk, including Metro':'')+'.</p>':'<strong>No bars fit these settings</strong><p>Increase the walking limit or radius, or change a Metro choice.</p>';
 $('excluded-bars').hidden=!plan.excluded.length;
 $('excluded-summary').textContent=plan.excluded.length+' excluded by these limits';
 $('excluded-list').innerHTML=plan.excluded.map(id=>'<li>'+esc(bars.find(b=>b.id===id).name)+'</li>').join('');
 updateScopeControls();
 if(routeMode==='browse'||!count){paintRoute();return;}
 if(plan.waypoint_order.length===1){
  const b=bars.find(b=>b.id===plan.order[0]);
  activeRoute={key:routeMode,title:routeTitle(),order:[...plan.order],waypoint_order:[...plan.waypoint_order],distance_m:0,duration_s:0,coordinates:[[b.lon,b.lat]],legs:[]};paintRoute();return;
 }
 const signature=RouteCosts.signature(plan.waypoint_order),cached=routeCache.get(signature);
 if(cached){try{useDirections(cached,plan,generation);return;}catch{routeCache.delete(signature);}}
 paintRoute('pending');
 $('route-summary').innerHTML='<div class="route-totals"><strong class="route-loading">Loading walking directions…</strong></div><p class="route-meta">'+count+' bars selected · about '+miles(plan.distance_m)+'.</p><p class="sort-route-note">Pins and circle show the new selection.</p>';
 routeTimer=setTimeout(async()=>{
  if(generation!==routeGeneration)return;
  lastRouteRequestAt=Date.now();routeAbort=new AbortController();
  const controller=routeAbort,timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const response=await fetch(SortRoute.requestUrl(waypoints,plan.waypoint_order),{signal:controller.signal,credentials:'omit'});
   if(!response.ok)throw Error('Walking service returned '+response.status);
   const next=SortRoute.fromResponse(await response.json(),plan.waypoint_order);
   if(generation!==routeGeneration)return;
   routeAbort=null;useDirections(next,plan,generation);
  }catch(error){
   if(generation!==routeGeneration)return;
   routeAbort=null;$('route-summary').dataset.state='error';
   $('route-summary').innerHTML='<p class="route-status-error">Couldn’t load walking directions.</p><p class="sort-route-note">The selected bars and circle are still shown.</p><button class="text-button" id="retry-sort-route">Retry directions</button>';
   $('retry-sort-route').addEventListener('click',requestPlan);
  }finally{clearTimeout(timeout);}
 },Math.max(100,1100-(Date.now()-lastRouteRequestAt)));
}
function useDirections(route,plan,generation){
 if(generation!==routeGeneration)return;
 const result=RouteCosts.audit(route,plan,routeData.walking,metroData.walking,readLimits().maxDistanceM,reconcileAttempts);
 if(result.action==='error'){
  activeRoute=null;paintRoute('error');
  $('route-summary').innerHTML='<p class="route-status-error">'+esc(result.reason)+'</p><button class="text-button" id="retry-sort-route">Retry directions</button>';
  $('retry-sort-route').addEventListener('click',()=>{routeCache.clear();requestPlan();});return;
 }
 const signature=RouteCosts.signature(plan.waypoint_order);
 if(result.action==='replan'){
  RouteCosts.apply(result.updates,routeData.walking,metroData.walking);
  distanceRevision++;reconcileAttempts++;routeCache.clear();routeCache.set(signature,route);
  requestPlan({reconcile:true});return;
 }
 routeCache.set(signature,route);
 // Geometry caching is small and separate from the optimizer's bounded tables.
 if(routeCache.size>24)routeCache.delete(routeCache.keys().next().value);
 activeRoute={...route,key:routeMode,title:routeTitle(),waypoint_order:[...plan.waypoint_order],order:[...plan.order]};paintRoute();
 try{localStorage.setItem('dc-after-hours-custom-route',JSON.stringify(route));}catch{}
}
function routeTitle(){return {shortest:'Shortest route','north-south':'North to south',sort:'Route by list sort'}[routeMode]||'Pins only';}
