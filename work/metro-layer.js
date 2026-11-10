// Transit is a display layer; route selection continues to use the bar data only.
const metroLines=new Map(metroData.lines.map(line=>[line.id,line]));
const metroPane=map.createPane('metroStations');metroPane.style.zIndex='550';
const metroRailPane=map.createPane('metroRail');metroRailPane.style.zIndex='350';
const metroLayer=L.layerGroup();
const metroRailLayer=L.layerGroup();
const metroRailShapes=[];
// Small screen-space offsets keep every color visible on shared rail corridors.
const railOffsets={red:0,orange:-4.5,silver:0,blue:4.5,yellow:-2.25,green:2.25};
for(const route of metroData.rail.routes){
 for(const [index,path] of route.paths.entries()){
  const coordinates=path.coordinates.map(point=>L.latLng(point[1],point[0]));
  const halo=L.polyline(coordinates,{pane:'metroRail',color:'#fffdf8',weight:5.5,opacity:.8,interactive:false,smoothFactor:.5});
  const line=L.polyline(coordinates,{pane:'metroRail',color:metroLines.get(route.id).color,weight:3.25,opacity:.92,interactive:false,smoothFactor:.5});
  line.on('add',()=>{const element=line.getElement();element?.setAttribute('data-metro-rail',route.id);element?.setAttribute('data-metro-pattern',String(index));});
  metroRailShapes.push({coordinates,offset:railOffsets[route.id],halo,line});
 }
}
metroRailShapes.forEach(shape=>metroRailLayer.addLayer(shape.halo));
metroRailShapes.forEach(shape=>metroRailLayer.addLayer(shape.line));
function offsetRailCoordinates(coordinates,offset){
 if(!offset)return coordinates;
 const zoom=map.getZoom(),points=coordinates.map(point=>map.project(point,zoom));
 const normals=points.slice(1).map((point,i)=>{const dx=point.x-points[i].x,dy=point.y-points[i].y,length=Math.hypot(dx,dy);return length?L.point(-dy/length,dx/length):null;});
 const before=[],after=[];let previous=null,next=null;
 for(let i=0;i<points.length;i++){if(i&&normals[i-1])previous=normals[i-1];before[i]=previous;}
 for(let i=points.length-1;i>=0;i--){if(normals[i])next=normals[i];after[i]=next;}
 return points.map((point,i)=>{
  const a=before[i]||after[i],b=after[i]||before[i];
  if(!a||!b)return coordinates[i];
  const sum=L.point(a.x+b.x,a.y+b.y),length=Math.hypot(sum.x,sum.y);
  const normal=length>1e-6?sum.divideBy(length):b;
  const projection=Math.max(.4,normal.x*b.x+normal.y*b.y);
  return map.unproject(point.add(normal.multiplyBy(offset/projection)),zoom);
 });
}
function updateMetroRailGeometry(){
 for(const shape of metroRailShapes){const coordinates=offsetRailCoordinates(shape.coordinates,shape.offset);shape.halo.setLatLngs(coordinates);shape.line.setLatLngs(coordinates);}
}
map.on('zoomend',updateMetroRailGeometry);map.whenReady(updateMetroRailGeometry);
let metroVisible=false;
try{metroVisible=localStorage.getItem('dc-after-hours-metro-visible')==='true';}catch{}
const metroLineNames=station=>station.lines.map(id=>metroLines.get(id).name).join(' · ');
function metroIcon(station){
 const colors=station.lines.map(id=>metroLines.get(id).color);
 const gradient=colors.map((color,i)=>color+' '+(i*100/colors.length)+'% '+((i+1)*100/colors.length)+'%').join(',');
 return L.divIcon({className:'metro-marker',html:`<span class="metro-station-symbol" style="background:conic-gradient(${gradient})"><span>M</span></span>`,iconSize:[22,22],iconAnchor:[11,11],popupAnchor:[0,-12],tooltipAnchor:[0,-11]});
}
for(const station of metroData.stations){
 const lines=metroLineNames(station),label='Metro station: '+station.name+' — '+lines;
 const marker=L.marker([station.lat,station.lon],{pane:'metroStations',icon:metroIcon(station),title:label,keyboard:true,riseOnHover:true});
 marker.on('add',()=>{const element=marker.getElement();element?.setAttribute('aria-label',label);element?.setAttribute('data-metro-station',station.id);element?.setAttribute('data-metro-lines',station.lines.join(','));});
 marker.bindTooltip(`<strong>${esc(station.name)}</strong><br>${esc(lines)}`,{direction:'top',className:'metro-tooltip',opacity:1});
 marker.bindPopup(`<div class="popup-name">${esc(station.name)}</div><div class="metro-popup-lines">${station.lines.map(id=>{const line=metroLines.get(id);return `<span><i style="background:${line.color}" aria-hidden="true"></i>${esc(line.name)} Line</span>`;}).join('')}</div><div class="popup-address">${esc(station.address)}</div><a href="${esc(station.url)}" target="_blank" rel="noopener noreferrer">Station info & service at WMATA ↗</a>`,{maxWidth:290,autoPan:false});
 metroLayer.addLayer(marker);
}
$('metro-line-key').innerHTML=metroData.lines.map(line=>`<span><i style="background:${line.color}" aria-hidden="true"></i>${esc(line.name)}</span>`).join('');
function showMetro(show){
 metroVisible=show;
 if(show){metroRailLayer.addTo(map);metroLayer.addTo(map);}else{metroLayer.eachLayer(marker=>marker.closePopup());map.removeLayer(metroLayer);map.removeLayer(metroRailLayer);}
 $('metro-toggle').setAttribute('aria-pressed',String(show));$('metro-toggle').title=show?'Hide Metro lines and stations':'Show Metro lines and stations';
 $('metro-legend').hidden=!show;
 $('map').dataset.metroVisible=String(show);$('map').dataset.metroStations=String(show?metroData.stations.length:0);
 $('map').dataset.metroRailPaths=String(show?metroRailShapes.length:0);
 try{localStorage.setItem('dc-after-hours-metro-visible',String(show));}catch{}
}
$('metro-toggle').addEventListener('click',()=>showMetro(!metroVisible));
showMetro(metroVisible);
map.attributionControl.addAttribution('<a href="'+metroData.source+'" target="_blank" rel="noopener">Metro stations: DC GIS / WMATA</a>');
const metroNote=document.createElement('p');
const metroDate=new Date(metroData.retrieved_at).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'long',day:'numeric',year:'numeric'});
metroNote.innerHTML='<strong>Metro network:</strong> Regional station locations come from <a href="'+metroData.source+'" target="_blank" rel="noopener noreferrer">DC GIS / WMATA</a>; line assignments and colors were checked against WMATA’s station pages on '+esc(metroDate)+'. Rail paths use <a href="'+metroData.rail.source+'" target="_blank" rel="noopener noreferrer">WMATA’s line shapes</a>. Multicolor rings show all lines serving a station. These are station locations, not individual entrances or live service status. The Metro toggle shows or hides both the lines and stations; the overlay does not change which bars are included.';
$('about').insertBefore(metroNote,$('about').querySelector('.about-footer'));
