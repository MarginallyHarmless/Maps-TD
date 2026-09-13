import * as THREE from 'three';
import { pixelMaterial } from './pixel-material.js';
import { markAccent } from './art-direction.js';
import { neighborhoodLife } from './neighborhood-life.js';
import { RetroRenderer } from './retro-renderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { detailedGround, detailedBuildings, detailedTrees } from './scenery.js';
import { cellPoint, pointCell, findRoute, routeLength } from './navigation.js';

const $=id=>document.getElementById(id);
const dataUrl=file=>`${import.meta.env.BASE_URL}data/${file}`;
let life, vegetation, sceneryStats, data, mapConfig, selected, path=[], pathPoints=[], totalLength=0, routeGroup=new THREE.Group();
let mode='select', running=false, health=20, spawned=0, defeated=0, escaped=0, spawnClock=0;
const mapLabels=[];
const towers=[], enemies=[], beams=[], blocked=new Set(), buildingMeshes=[], treePositions=[];
const scene=new THREE.Scene(); scene.background=new THREE.Color('#151e2e');
const camera=new THREE.OrthographicCamera(-400,400,400,-400,1,2200);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});}catch(error){$('loading').innerHTML='<p>WebGL is unavailable</p><span>Try a browser with hardware acceleration enabled.</span>';throw error;}
renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.BasicShadowMap;
// Buildings are static: refresh their shadow atlas only when scenery or towers change.
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#151e2e');
$('map').appendChild(renderer.domElement);
const retro=new RetroRenderer(renderer);
let savedStyle;try{savedStyle=localStorage.getItem('td-map-style-noir-v1');}catch{}
retro.setStyle(savedStyle||'mono');
function setArtStyle(style){retro.setStyle(style);try{localStorage.setItem('td-map-style-noir-v1',retro.style);}catch{}
  document.documentElement.dataset.art=retro.style;scene.background.set(retro.style==='mono'?'#101010':'#151e2e');
  for(const value of ['mono','8','16']){$(`style-${value}`).classList.toggle('active',retro.style===value);$(`style-${value}`).setAttribute('aria-pressed',String(retro.style===value));}
}
$('style-mono').onclick=()=>setArtStyle('mono');$('style-8').onclick=()=>setArtStyle('8');$('style-16').onclick=()=>setArtStyle('16');setArtStyle(retro.style);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.08;controls.minZoom=.55;controls.maxZoom=5;
controls.maxPolarAngle=Math.PI/2.1;controls.minPolarAngle=.03;
controls.target.set(0,0,0);controls.enablePan=true;
scene.add(new THREE.HemisphereLight('#fff0ce','#39485b',1.1));
const sun=new THREE.DirectionalLight('#fff0ce',2.0);sun.position.set(-300,500,400);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-450,right:450,top:450,bottom:-450,near:10,far:1100});sun.shadow.normalBias=.5;sun.shadow.bias=-.00005;scene.add(sun);
scene.add(routeGroup);
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const ghost=new THREE.Mesh(new THREE.CylinderGeometry(5,5,.8,24),new THREE.MeshBasicMaterial({color:'#80d9b0',transparent:true,opacity:.6}));
markAccent(ghost.material,'target');ghost.visible=false;scene.add(ghost);
const rangeRing=new THREE.Mesh(new THREE.RingGeometry(51,52,64),new THREE.MeshBasicMaterial({color:'#87d7b4',transparent:true,opacity:.25,side:THREE.DoubleSide}));markAccent(rangeRing.material,'target');rangeRing.rotation.x=-Math.PI/2;rangeRing.visible=false;scene.add(rangeRing);

function fit(view='iso'){
  camera.zoom=view==='top'?1:1.2;controls.target.set(0,0,0);
  camera.position.copy(view==='top'?new THREE.Vector3(0,850,.1):new THREE.Vector3(600,424.264,600));
  camera.lookAt(0,0,0);controls.update();
  $('iso').classList.toggle('active',view==='iso');$('top').classList.toggle('active',view==='top');
}
function resize(){const w=$('map').clientWidth,h=$('map').clientHeight;retro.resize(w,h);const aspect=w/h;const v=aspect<1?425/aspect:425;camera.left=-v*aspect;camera.right=v*aspect;camera.top=v;camera.bottom=-v;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe($('map'));resize();fit();
function makeGround(){detailedGround(scene,data,renderer);}
function makeBuildings(){sceneryStats=detailedBuildings(scene,data,buildingMeshes);}
function makeTrees(){vegetation=detailedTrees(scene,data,treePositions);life=neighborhoodLife(scene,data);}
function textSprite(text,position){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  ctx.font='600 32px sans-serif';canvas.width=Math.ceil(ctx.measureText(text).width)+36;canvas.height=64;
  ctx.font='600 32px sans-serif';ctx.fillStyle='#f9eed6';ctx.textAlign='center';ctx.shadowColor='#263d3c';ctx.shadowBlur=3;ctx.fillText(text,canvas.width/2,43);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true,opacity:.8}));sprite.position.set(...position);sprite.scale.set(canvas.width/64*9,9,1);sprite.visible=false;scene.add(sprite);mapLabels.push(sprite);return sprite;
}
function updateLabels(){for(const label of mapLabels)label.visible=camera.zoom>=1.7;}
function makeLabels(){
  const wanted=mapConfig.streetLabels;
  for(const name of wanted){const roads=data.roads.filter(r=>r.name===name);if(!roads.length)continue;const pts=roads.flatMap(r=>r.points).filter(([x,z])=>Math.hypot(x,z)>140&&Math.hypot(x,z)<255);if(!pts.length)continue;const p=pts[Math.floor(pts.length/2)];textSprite(name,[p[0],3,p[1]]);}
}
function clearGroup(group){for(const child of [...group.children]){child.geometry?.dispose();if(Array.isArray(child.material))child.material.forEach(m=>m.dispose());else child.material?.dispose();group.remove(child);}}
function ribbon(points,width,color){
  const vertices=[],indices=[];
  for(let i=0;i<points.length;i++){
    const prev=points[Math.max(0,i-1)],p=points[i],next=points[Math.min(points.length-1,i+1)];
    const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz)||1;
    const nx=-dz/len*width/2,nz=dx/len*width/2;
    vertices.push(p[0]+nx,.6,p[1]+nz,p[0]-nx,.6,p[1]-nz);
    if(i){const j=i*2;indices.push(j-2,j-1,j,j,j-1,j+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide});markAccent(material,'route');
  return new THREE.Mesh(g,material);
}
function recalculate(){
  renderer.shadowMap.needsUpdate=true;
  clearGroup(routeGroup);path=[];pathPoints=[];
  if(!selected)return false;
  const spawn=data.spawns[Number($('spawn').value)];
  const result=findRoute(data.grid,spawn.cell,selected.entrances,blocked);
  if(!result){vegetation?.update([],towers);life?.update([],towers);$('route-length').textContent='No route';$('start').disabled=true;$('status').textContent='No reachable approach from this entry. Try another entry or building.';return false;}
  path=result;pathPoints=path.map(i=>cellPoint(data.grid,i));totalLength=routeLength(data.grid,path);
  routeGroup.add(ribbon(pathPoints,3,'#ffc857'));
  for(const [i,p] of [pathPoints[0],pathPoints.at(-1)].entries()){
    const ring=new THREE.Mesh(new THREE.RingGeometry(5,6.5,32),new THREE.MeshBasicMaterial({color:i?'#8fe0bd':'#ffc857',side:THREE.DoubleSide}));markAccent(ring.material,i?'target':'route');ring.rotation.x=-Math.PI/2;ring.position.set(p[0],.9,p[1]);routeGroup.add(ring);
  }
  vegetation?.update(pathPoints,towers);life?.update(pathPoints,towers);
  $('route-length').textContent=`${Math.round(totalLength)} m route`;$('start').disabled=running;
  $('status').textContent='Route ready. Place towers beside the approach, then test a wave.';
  return true;
}
function selectBuilding(b){
  if(running){$('status').textContent='Finish or reset this wave before changing the stronghold.';return;}
  selected=b;life?.setTarget(b);
  for(const mesh of buildingMeshes){mesh.material.forEach((m,i)=>{m.color.copy(mesh.userData.colors[i]);markAccent(m,mesh.userData.building.id===b.id?'target':null,i?.18:.65);if(mesh.userData.building.id===b.id)m.color.lerp(new THREE.Color(i?'#78c2a6':'#a9e0ba'),i?.2:.45);});}
  $('target-name').textContent=b.name;
  $('target-info').textContent=`${b.address || (b.kind==='apartments'?'Apartment block':b.kind==='office'?'Office building':'Building')} · ${Math.round(b.area).toLocaleString()} m² footprint`;
  $('height-note').textContent=b.heightSource==='estimated'?`${b.height} m height · estimated; no mapped height or floors`:`${b.height} m height · ${b.heightSource==='floor count'?`${b.floors} mapped floors × 3.1 m`:'mapped height'}`;
  recalculate();
}
function setMode(next){mode=next;$('select-mode').classList.toggle('active',mode==='select');$('tower-mode').classList.toggle('active',mode==='tower');$('mode-hint').textContent=mode==='tower'?'Click open ground beside the route. Each tower has a 52 m range.':'Click a building on the map to defend it.';ghost.visible=rangeRing.visible=false;}
function towerCells(x,z){const c=pointCell(data.grid,x,z);if(c<0)return null;const ids=[];for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){const cx=c%data.grid.size+dx,cy=Math.floor(c/data.grid.size)+dz;if(cx<0||cy<0||cx>=data.grid.size||cy>=data.grid.size)return null;const id=cy*data.grid.size+cx;if(data.grid.cost[id]!==5||blocked.has(id))return null;ids.push(id);}if(treePositions.some(p=>Math.hypot(p[0]-x,p[1]-z)<5))return null;return ids;}
function placeTower(x,z){
  if(running){$('status').textContent='Reset or finish the wave to place more towers.';return false;}
  if(towers.length>=8){$('status').textContent='All eight towers are placed.';return false;}
  const ids=towerCells(x,z);if(!ids){$('status').textContent='Choose clear ground away from roads, buildings, trees, and other towers.';return false;}
  ids.forEach(i=>blocked.add(i));
  const spawn=data.spawns[Number($('spawn').value)];
  if(selected&&!findRoute(data.grid,spawn.cell,selected.entrances,blocked)){ids.forEach(i=>blocked.delete(i));$('status').textContent='That placement would seal the approach. Choose another spot.';return false;}
  const group=new THREE.Group();group.position.set(x,0,z);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(4.5,5.5,2,8),pixelMaterial({color:'#b5d2ae'}));base.position.y=1;
  const body=new THREE.Mesh(new THREE.CylinderGeometry(2.4,3.3,7,6),pixelMaterial({color:'#477461'}));body.position.y=5;
  const head=new THREE.Mesh(new THREE.BoxGeometry(5,2,3),pixelMaterial({color:'#a8dfb6'}));head.position.y=9;
  markAccent(base.material,'tower',.35);markAccent(body.material,'tower',.65);markAccent(head.material,'tower');
  group.add(base,body,head);group.traverse(o=>{o.castShadow=true;});scene.add(group);towers.push({group,head,x,z,cooldown:0});$('tower-count').textContent=`${towers.length} / 8`;recalculate();return true;
}
function clearEnemies(){for(const e of enemies)scene.remove(e.mesh);enemies.length=0;for(const b of beams){scene.remove(b.line);b.line.geometry.dispose();b.line.material.dispose();}beams.length=0;}
function reset(){running=false;clearEnemies();for(const t of towers){t.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(t.group);}towers.length=0;blocked.clear();health=20;spawned=defeated=escaped=0;$('health').textContent='20 / 20';$('tower-count').textContent='0 / 8';$('start').querySelector('span').textContent='Test an enemy wave';$('spawn').disabled=false;recalculate();}
const enemyGeometry=new THREE.BoxGeometry(4,5,4),enemyMaterial=pixelMaterial({color:'#ec9864',emissive:'#8d3820',emissiveIntensity:.25});
markAccent(enemyMaterial,'enemy');
function startWave(){if(!path.length||running)return;clearEnemies();health=20;spawned=defeated=escaped=0;spawnClock=1.2;running=true;$('health').textContent='20 / 20';$('start').disabled=true;$('spawn').disabled=true;$('start').querySelector('span').textContent='Wave in progress…';setMode('select');}
function advance(dt){
  for(let i=beams.length-1;i>=0;i--){beams[i].ttl-=dt;if(beams[i].ttl<=0){scene.remove(beams[i].line);beams[i].line.geometry.dispose();beams[i].line.material.dispose();beams.splice(i,1);}}
  if(!running)return;
  spawnClock+=dt;
  if(spawned<12&&spawnClock>=1.1){spawnClock=0;spawned++;const mesh=new THREE.Mesh(enemyGeometry,enemyMaterial);mesh.position.set(pathPoints[0][0],3,pathPoints[0][1]);scene.add(mesh);enemies.push({mesh,segment:0,progress:0,hp:3});}
  for(const e of enemies){let movement=dt*27;while(movement>0&&e.segment<pathPoints.length-1){const a=pathPoints[e.segment],b=pathPoints[e.segment+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),remain=len-e.progress;if(movement>=remain){movement-=remain;e.segment++;e.progress=0;}else{e.progress+=movement;movement=0;}}
    if(e.segment>=pathPoints.length-1){e.arrived=true;continue;}const a=pathPoints[e.segment],b=pathPoints[e.segment+1],t=e.progress/Math.hypot(b[0]-a[0],b[1]-a[1]);e.mesh.position.set(a[0]+(b[0]-a[0])*t,3,a[1]+(b[1]-a[1])*t);e.mesh.rotation.y+=dt*2;
  }
  for(const t of towers){t.cooldown-=dt;if(t.cooldown>0)continue;const enemy=enemies.find(e=>e.hp>0&&!e.arrived&&Math.hypot(e.mesh.position.x-t.x,e.mesh.position.z-t.z)<52);if(!enemy)continue;enemy.hp--;t.cooldown=.55;t.head.rotation.y=Math.atan2(enemy.mesh.position.x-t.x,enemy.mesh.position.z-t.z);const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(t.x,10,t.z),enemy.mesh.position.clone()]);const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#c8f7b8'}));markAccent(line.material,'tower');scene.add(line);beams.push({line,ttl:.12});}
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.hp<=0||e.arrived){if(e.hp<=0)defeated++;else{escaped++;health=Math.max(0,health-1);}$('health').textContent=`${health} / 20`;scene.remove(e.mesh);enemies.splice(i,1);}}
  $('status').textContent=`Wave 1 · ${spawned}/12 deployed · ${defeated} stopped · ${escaped} reached the stronghold`;
  if(spawned===12&&enemies.length===0){running=false;$('spawn').disabled=false;$('start').disabled=false;$('start').querySelector('span').textContent='Run another wave';$('status').textContent=`Wave complete. ${defeated} stopped, ${escaped} reached the stronghold. Reposition defenses with Reset.`;}
}
function pick(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,button:e.button};});
renderer.domElement.addEventListener('pointerup',e=>{if(!data||!down||down.button!==0||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;pick(e);if(mode==='select'){const hit=raycaster.intersectObjects(buildingMeshes)[0];if(hit)selectBuilding(hit.object.userData.building);}else{const point=new THREE.Vector3();if(raycaster.ray.intersectPlane(groundPlane,point))placeTower(point.x,point.z);}});
renderer.domElement.addEventListener('pointermove',e=>{if(!data)return;pick(e);const tip=$('tooltip');if(mode==='tower'){tip.hidden=true;const point=new THREE.Vector3();if(raycaster.ray.intersectPlane(groundPlane,point)){ghost.visible=rangeRing.visible=true;ghost.position.set(point.x,1,point.z);rangeRing.position.set(point.x,.5,point.z);const valid=towerCells(point.x,point.z);ghost.material.color.set(valid?'#91e6bc':'#d87965');markAccent(ghost.material,valid?'target':'enemy');}}else{const hit=raycaster.intersectObjects(buildingMeshes)[0];tip.hidden=!hit;if(hit){tip.textContent=hit.object.userData.building.name;const rect=$('map-shell').getBoundingClientRect();tip.style.left=`${Math.min(e.clientX-rect.left+15,rect.width-230)}px`;tip.style.top=`${e.clientY-rect.top-35}px`;}}});
renderer.domElement.addEventListener('pointerleave',()=>{$('tooltip').hidden=true;ghost.visible=rangeRing.visible=false;});
$('select-mode').onclick=()=>setMode('select');$('tower-mode').onclick=()=>setMode('tower');$('spawn').onchange=recalculate;$('start').onclick=startWave;$('reset').onclick=reset;
$('focus-view').onclick=()=>{
  if(!selected)return;
  const target=new THREE.Vector3(selected.center[0],selected.height*.35,selected.center[1]);
  const offset=new THREE.Vector3(600,424.264,600);controls.target.copy(target);camera.position.copy(target).add(offset);camera.zoom=2.2;camera.updateProjectionMatrix();camera.lookAt(target);controls.update();
  $('iso').classList.add('active');$('top').classList.remove('active');
};
$('iso').onclick=()=>fit('iso');$('top').onclick=()=>fit('top');$('home-view').onclick=()=>fit();
let last=performance.now();
renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.06);last=now;controls.update();advance(dt);life?.animate(now/1000);updateLabels();$('map-shell').querySelector('.north').style.transform=`rotate(${-controls.getAzimuthalAngle()*180/Math.PI}deg)`;retro.render(scene,camera);});

try{
  const catalogResponse=await fetch(dataUrl('maps.json'));if(!catalogResponse.ok)throw new Error('Map catalog could not load');
  const catalog=await catalogResponse.json(), params=new URLSearchParams(location.search);
  mapConfig=catalog.find(m=>m.id===params.get('map')) || catalog[0];
  const field=String(catalog.indexOf(mapConfig)+1).padStart(3,'0');
  $('map-select').replaceChildren(...catalog.map(m=>{const option=document.createElement('option');option.value=m.id;option.textContent=m.name;return option;}));
  $('map-select').value=mapConfig.id;$('map-select').disabled=false;
  $('map-select').onchange=()=>{const url=new URL(location.href);url.searchParams.set('map',$('map-select').value);location.assign(url);};
  const response=await fetch(dataUrl(`${mapConfig.id}.json`));if(!response.ok)throw new Error(`Map load failed: ${response.status}`);data=await response.json();
  document.title=`Local Defense · ${data.name}`;$('map-title').textContent=data.name;
  $('field-number').textContent=`FIELD TEST / ${field}`;$('neighborhood-number').textContent=`NEIGHBORHOOD / ${field}`;$('map-number').textContent=field.slice(1);
  $('location-details').textContent=`${mapConfig.sector} · ${data.center.lat.toFixed(5)}° N, ${data.center.lon.toFixed(5)}° E`;
  $('map-extent').textContent=`${data.extent} m`;$('download-map').href=dataUrl(`${mapConfig.id}.json`);
  makeGround();makeBuildings();makeTrees();makeLabels();
  $('scenery-note').textContent=`Procedural facades & roof details${data.decorativeTrees?.length?' · generated park trees':''}.`;
  $('building-count').textContent=data.stats.buildings;$('tree-count').textContent=data.stats.trees;
  data.spawns.forEach((s,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${s.side[0].toUpperCase()+s.side.slice(1)} · ${s.roadName || 'Neighborhood streets'}`;$('spawn').appendChild(o);});
  const candidates=[...data.buildings].filter(b=>b.entrances.length).sort((a,b)=>Math.hypot(...a.center)-Math.hypot(...b.center));
  let initial=candidates.find(b=>b.sourceId===mapConfig.defaultBuildingSourceId)||candidates.find(b=>b.name===mapConfig.defaultBuildingName)||candidates[0];selectBuilding(initial);
  if(!path.length){for(const b of candidates){selectBuilding(b);if(path.length)break;}}
  $('loading').classList.add('hidden');
  // Read-only diagnostics and deterministic interaction hooks for browser verification.
  window.td={data,selectBuilding:id=>selectBuilding(data.buildings.find(b=>b.id===id)),placeTower,startWave,reset,
    projectBuilding:id=>{const b=data.buildings.find(b=>b.id===id),v=new THREE.Vector3(b.center[0],b.height,b.center[1]).project(camera);return {x:(v.x+1)/2*renderer.domElement.clientWidth,y:(1-v.y)/2*renderer.domElement.clientHeight};},
    get state(){return {display:retro.state,scenery:{...sceneryStats,...life?.stats,decorativeTrees:vegetation?.visibleGenerated||0},selected:selected?.id,path:[...path],routeLength:totalLength,towers:towers.length,running,spawned,defeated,escaped,health,triangles:retro.sceneInfo.triangles,drawCalls:retro.sceneInfo.calls};}};
  if(new URLSearchParams(location.search).has('test')){
    window.td.advanceForTesting=seconds=>{for(let elapsed=0;elapsed<seconds;elapsed+=.05)advance(.05);};
    window.td.pauseRenderingForTesting=()=>renderer.setAnimationLoop(null);
    window.td.sampleFrameForTesting=()=>{
      resize();controls.update();updateLabels();
      retro.render(scene,camera);
      const {width,height}=renderer.domElement,bytes=new Uint8Array(width*height*4),gl=renderer.getContext();
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      const colors=new Set();let chromaticPixels=0;for(let i=0;i<bytes.length;i+=4){colors.add((bytes[i]<<16)|(bytes[i+1]<<8)|bytes[i+2]);if(Math.max(bytes[i],bytes[i+1],bytes[i+2])-Math.min(bytes[i],bytes[i+1],bytes[i+2])>24)chromaticPixels++;}
      return {colors:[...colors].slice(0,256),colorCount:colors.size,chromaticPixels,pixelCount:bytes.length/4,...retro.state};
    };
  }
}catch(error){console.error(error);$('loading').innerHTML='<p>The neighborhood could not load.</p><span>Reload the page or check the local server.</span>';$('status').textContent=error.message;}
