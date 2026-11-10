(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BarListOrder=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const metrics=['secrecy','rating','popularity','name','latitude','neighborhood','route'];
  const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
  const defaults={primary:{metric:'secrecy',direction:'desc'},secondary:{metric:'name',direction:'asc'}};
  function normalize(settings){
    const result={};
    for(const key of ['primary','secondary']){
      const incoming=settings?.[key],fallback=defaults[key];
      result[key]={metric:(metrics.includes(incoming?.metric)||(key==='secondary'&&incoming?.metric==='none'))?incoming.metric:fallback.metric,direction:['asc','desc'].includes(incoming?.direction)?incoming.direction:fallback.direction};
    }
    return result;
  }
  function value(bar,metric,route){
    if(metric==='name'||metric==='neighborhood')return bar[metric];
    if(metric==='latitude')return bar.lat;
    if(metric==='route')return route.has(bar.id)?route.get(bar.id):null;
    if(metric==='popularity'){
      const number=parseFloat(bar.popularity);
      return Number.isFinite(number)?number:null;
    }
    return bar[metric];
  }
  function compare(a,b,criterion,route){
    if(criterion.metric==='none')return 0;
    const av=value(a,criterion.metric,route),bv=value(b,criterion.metric,route);
    if(av==null&&bv==null)return 0;
    if(av==null)return 1;
    if(bv==null)return -1;
    const result=typeof av==='string'?collator.compare(av,bv):av-bv;
    return criterion.direction==='desc'?-result:result;
  }
  function sort(bars,settings,routeOrder=[]){
    const normalized=normalize(settings),route=new Map(routeOrder.map((id,i)=>[id,i]));
    return [...bars].sort((a,b)=>compare(a,b,normalized.primary,route)||compare(a,b,normalized.secondary,route)||a.id-b.id);
  }
  function usesRoute(settings){const s=normalize(settings);return s.primary.metric==='route'||s.secondary.metric==='route';}
  function referenceForChange(reference,currentOrder,before,after,entering=false){
    return [...((entering||!reference?.length||(!usesRoute(before)&&usesRoute(after)))?currentOrder:reference)];
  }
  function validOrder(order,ids){return Array.isArray(order)&&order.length===ids.length&&new Set(order).size===ids.length&&order.every(id=>ids.includes(id));}
  function restrictReference(reference,ids){return [...new Set([...(reference||[]).filter(id=>ids.includes(id)),...ids])];}
  return {metrics,normalize,sort,usesRoute,referenceForChange,validOrder,restrictReference};
});
