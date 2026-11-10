const assert=require('node:assert/strict');
const fs=require('node:fs');
const {sort,usesRoute,referenceForChange,validOrder,restrictReference}=require('./list-order');
const bars=JSON.parse(fs.readFileSync('work/bars.json','utf8'));
const routes=JSON.parse(fs.readFileSync('work/routes.json','utf8')).routes;
const originalIds=bars.map(b=>b.id);
const primary={metric:'secrecy',direction:'desc'},secondary={metric:'rating',direction:'desc'};
const ranked=sort(bars,{primary,secondary},routes[0].order);
assert.equal(ranked.length,16);
assert.equal(ranked[0].id,2);
assert.equal(ranked[1].id,1);
assert.deepEqual(bars.map(b=>b.id),originalIds);
const byName={primary:{metric:'name',direction:'asc'},secondary:{metric:'none',direction:'asc'}};
assert.deepEqual(sort(bars,byName,routes[0].order),sort(bars,byName,routes[1].order));
for(const direction of ['asc','desc']){
  const sorted=sort(bars,{primary:{metric:'popularity',direction},secondary:{metric:'name',direction:'asc'}},routes[0].order);
  assert.equal(sorted.at(-1).id,10,'Unknown popularity must stay last');
}
assert.deepEqual(sort(bars,{primary:{metric:'route',direction:'asc'}},routes[0].order).map(b=>b.id),routes[0].order);
assert.deepEqual(sort(bars,{primary:{metric:'route',direction:'desc'}},routes[0].order).map(b=>b.id),[...routes[0].order].reverse());
for(const route of routes)assert.equal(new Set(route.order).size,16);
const routeAsc={primary:{metric:'route',direction:'asc'},secondary:{metric:'name',direction:'asc'}};
const routeDesc={primary:{metric:'route',direction:'desc'},secondary:{metric:'name',direction:'asc'}};
let anchor=referenceForChange([],routes[0].order,byName,routeDesc,true);
const captured=[...anchor];
let computed=sort(bars,routeDesc,anchor).map(b=>b.id);
for(let i=0;i<20;i++){
  anchor=referenceForChange(anchor,computed,routeDesc,routeDesc);
  assert.deepEqual(anchor,captured,'Rendering must never change the route-sort reference');
  assert.deepEqual(sort(bars,routeDesc,anchor).map(b=>b.id),computed,'Route by sort / sort by route must settle');
}
assert.deepEqual(sort(bars,routeAsc,anchor).map(b=>b.id),captured,'Changing direction must not re-capture the reversed route');
assert.equal(usesRoute({primary:{metric:'rating'},secondary:{metric:'route'}}),true);
const newlyCaptured=referenceForChange(anchor,routes[1].order,byName,routeAsc);
assert.deepEqual(newlyCaptured,routes[1].order,'New route-stop criterion captures the currently shown route');
assert.deepEqual(referenceForChange(anchor,routes[1].order,routeAsc,routeDesc),anchor,'Direction changes keep the reference');
assert.equal(validOrder(routes[0].order,originalIds),true);
assert.equal(validOrder(Array(16).fill(1),originalIds),false);
const dcIds=originalIds.filter(id=>id!==11);
const dcReference=restrictReference(captured,dcIds);
assert.deepEqual(dcReference,captured.filter(id=>id!==11));
assert.equal(validOrder(dcReference,dcIds),true);
const expanded=restrictReference(dcReference,originalIds);
assert.equal(validOrder(expanded,originalIds),true);
assert.deepEqual(expanded.slice(0,15),dcReference,'Expanding scope keeps captured stop order stable');
assert.deepEqual(restrictReference(expanded,dcIds),dcReference);
assert.deepEqual(sort(bars.filter(b=>b.id!==11),routeDesc,dcReference).map(b=>b.id),[...dcReference].reverse());
console.log('PASS: primary/secondary sorts, unknowns last, immutable input, independence, and stable circular route-sort references.');
