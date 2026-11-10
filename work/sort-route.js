/* The provider adapter is shared by browser routing and deterministic tests. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SortRoute=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function instruction(step){
    const m=step.maneuver,kind=m.type,modifier=m.modifier||'',road=step.name||'';
    let text;
    if(kind==='depart')text='Head '+['north','northeast','east','southeast','south','southwest','west','northwest'][Math.floor(((m.bearing_after||0)+22.5)/45)%8];
    else if(kind==='arrive')return 'Arrive at the next stop';
    else if(kind==='roundabout'||kind==='rotary')text='Take the roundabout'+(m.exit?' to exit '+m.exit:'');
    else if(['turn','end of road','fork'].includes(kind))text=('Turn '+modifier).trim();
    else text=('Continue '+(kind==='new name'?'':modifier)).trim();
    return text+(road?' onto '+road:'');
  }
  function fromResponse(response,order){
    const route=response?.routes?.[0];
    if(response?.code!=='Ok'||!route||route.legs?.length!==order.length-1||route.geometry?.type!=='LineString'||!Number.isFinite(route.distance)||!Number.isFinite(route.duration))throw Error('Incomplete walking directions');
    const coordinates=route.geometry.coordinates;
    if(!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>-77.4&&p[0]<-76.7&&p[1]>38.5&&p[1]<39.2))throw Error('Invalid route geometry');
    return {key:'sort',title:'Route by list sort',order:[...order],distance_m:route.distance,duration_s:route.duration,coordinates,
      legs:route.legs.map((leg,i)=>({from:order[i],to:order[i+1],distance_m:leg.distance,duration_s:leg.duration,
        coordinates:leg.steps.flatMap(step=>step.geometry.coordinates),
        steps:leg.steps.filter(s=>s.distance>1||s.maneuver.type==='arrive').map(s=>({text:instruction(s),distance_m:s.distance,location:s.maneuver.location}))}))};
  }
  function requestUrl(bars,order){
    const byId=new Map(bars.map(b=>[b.id,b]));
    const coordinates=order.map(id=>{const b=byId.get(id);if(!b)throw Error('Unknown bar');return b.lon.toFixed(7)+','+b.lat.toFixed(7);}).join(';');
    return 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/'+coordinates+'?steps=true&geometries=geojson&overview=full&continue_straight=false&generate_hints=false';
  }
  return {fromResponse,requestUrl};
});
