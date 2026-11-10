const assert=require('node:assert/strict');
const fs=require('node:fs');
const {fromResponse,requestUrl}=require('./sort-route');
const bars=JSON.parse(fs.readFileSync('work/bars.json','utf8'));
const data=JSON.parse(fs.readFileSync('work/routes.json','utf8'));
const north=data.routes.find(r=>r.key==='north-south');
const response=JSON.parse(fs.readFileSync('work/routing/north-south.json','utf8'));
const adapted=fromResponse(response,north.order);
assert.deepEqual(adapted.order,north.order);
assert.equal(adapted.legs.length,15);
assert.equal(adapted.distance_m,north.distance_m);
assert.deepEqual(adapted.coordinates,north.coordinates);
for(let i=0;i<15;i++){
 assert.deepEqual([adapted.legs[i].from,adapted.legs[i].to],north.order.slice(i,i+2));
 assert.ok(adapted.legs[i].coordinates.length>1);
 assert.ok(adapted.legs[i].steps.length>0);
}
const url=requestUrl(bars,[...north.order].reverse());
assert.ok(url.startsWith('https://routing.openstreetmap.de/routed-foot/route/v1/foot/'));
assert.ok(url.includes('steps=true'));
assert.throws(()=>fromResponse({code:'NoRoute'},north.order));
const invalid=JSON.parse(JSON.stringify(response));invalid.routes[0].geometry.coordinates[0]=[0,0];
assert.throws(()=>fromResponse(invalid,north.order));
console.log('PASS: live-route adapter, walking profile, all 16 stops, directions, and invalid-response handling.');
