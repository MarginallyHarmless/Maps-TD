import * as THREE from 'three';
import { pixelMaterial } from './pixel-material.js';
import { treeMaterial } from './tree-sprites.js';
import { windowTexture } from './window-texture.js';
import { setNoirTone } from './art-direction.js';

const paths=new Set(['footway','path','pedestrian','steps','cycleway']);
function random(seed=1){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function shape(rings){const s=new THREE.Shape(rings[0].map(([x,z])=>new THREE.Vector2(x,-z)));rings.slice(1).forEach(r=>s.holes.push(new THREE.Path(r.map(([x,z])=>new THREE.Vector2(x,-z)))));return s;}
function instances(scene,geometry,material,items,shadow=true){
  const mesh=new THREE.InstancedMesh(geometry,material,items.length),dummy=new THREE.Object3D();
  items.forEach((p,i)=>{dummy.position.set(...p.position);dummy.scale.set(...(p.scale||[1,1,1]));dummy.rotation.set(0,p.rotation||0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(p.color)mesh.setColorAt(i,new THREE.Color(p.color));});
  mesh.castShadow=shadow;mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
function groundTexture(data,noir=false){
  // Separate surface values preserve the street network without recoloring
  // the original 8/16-bit textures or inferring road types from pixel hues.
  const grays={
    '#88a56b':'#414141','#5595a7':'#242424','#c9b58e':'#686868',
    '#88b45e':'#383838','#62954f':'#343434','#c7bca3':'#656565',
    '#e4d8bc':'#939393','#a1977e':'#393939','#566575':'#202020',
    '#ded5bb':'#828282','#889584':'#595959','#b7a47d':'#606060',
    '#ccc5ad':'#737373','#e9dfc599':'#bbbbbb99','#e9dfc56b':'#bbbbbb6b',
    '#8c8e80':'#3e3e3e','#8e8b7933':'#30303033',
  };
  const ink=color=>noir?(grays[color]||color):color;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;
  const ctx=canvas.getContext('2d'),side=data.extent,scale=canvas.width/side,rng=random(92);
  ctx.imageSmoothingEnabled=false;ctx.fillStyle=ink('#88a56b');ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.translate(canvas.width/2,canvas.height/2);ctx.scale(scale,scale);
  const polygon=rings=>{ctx.beginPath();for(const ring of rings){ring.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));ctx.closePath();}};
  for(const a of data.areas){polygon(a.rings);ctx.fillStyle=a.kind==='water'?ink('#5595a7'):a.kind==='playground'?ink('#c9b58e'):a.landcover==='garden'?ink('#88b45e'):ink('#62954f');ctx.fill('evenodd');}
  // Sparse connected grass tufts, big enough to survive the logical pixel grid.
  for(let i=0;i<240;i++){
    const x=Math.round((rng()-.5)*side),z=Math.round((rng()-.5)*side);
    ctx.fillStyle=ink('#62954f');ctx.fillRect(x,z,2,1);ctx.fillRect(x+1,z-1,1,1);
  }
  const stroke=(r,width,color,offset=0)=>{
    ctx.beginPath();r.points.forEach(([x,z],i)=>{const a=r.points[Math.max(0,i-1)],b=r.points[Math.min(r.points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;const px=x-dz/len*offset,pz=z+dx/len*offset;i?ctx.lineTo(px,pz):ctx.moveTo(px,pz);});
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  };
  const roads=[...data.roads].sort((a,b)=>b.width-a.width),vehicles=roads.filter(r=>!paths.has(r.kind)),foot=roads.filter(r=>paths.has(r.kind));
  // Wide pavement underlay, then curb and asphalt; all roads share clean junctions.
  for(const r of vehicles)stroke(r,r.width+(r.sidewalk==='no'?1:5),ink('#c7bca3'));
  for(const r of vehicles)stroke(r,r.width+.7,ink('#e4d8bc'));
  for(const r of vehicles)stroke(r,r.width,['gravel','unpaved','dirt'].includes(r.surface)?ink('#a1977e'):ink('#566575'));
  for(const r of foot){stroke(r,r.width+.65,ink('#ded5bb'));stroke(r,r.width,r.kind==='cycleway'?ink('#889584'):['gravel','dirt','ground'].includes(r.surface)?ink('#b7a47d'):ink('#ccc5ad'));}
  for(const r of vehicles){
    if(r.width<7)continue;
    const count=Math.max(2,Math.min(5,parseInt(r.lanes)||Math.round(r.width/3.5)));
    ctx.setLineDash([5,7]);
    for(let lane=1;lane<count;lane++)stroke(r,.55,ink('#e9dfc599'),(lane/count-.5)*r.width);
    ctx.setLineDash([]);stroke(r,.13,ink('#e9dfc56b'),r.width/2-.5);stroke(r,.13,ink('#e9dfc56b'),-r.width/2+.5);
  }
  // Treads follow actual mapped stair paths.
  for(const r of foot.filter(r=>r.kind==='steps')){ctx.setLineDash([.25,.7]);stroke(r,r.width,ink('#8c8e80'));ctx.setLineDash([]);}
  // Paving joints on pedestrian surfaces stay clipped to the path geometry.
  for(const r of foot.filter(r=>['paving_stones','sett','cobblestone'].includes(r.surface))){ctx.setLineDash([.07,1.4]);stroke(r,r.width,ink('#8e8b7933'));ctx.setLineDash([]);}
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=4;
  return tex;
}
export function detailedGround(scene,data,renderer){
  const side=data.extent;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(side,side),setNoirTone(pixelMaterial({map:groundTexture(data),roughness:1}),'ground',groundTexture(data,true)));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const base=new THREE.Mesh(new THREE.BoxGeometry(side,9,side),setNoirTone(pixelMaterial({color:'#475c4a',roughness:1}),'base'));base.position.y=-4.6;scene.add(base);
  const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(side,9,side)),new THREE.LineBasicMaterial({color:'#a2ae89',transparent:true,opacity:.3}));edge.position.y=-4.6;scene.add(edge);
  // Baked contact shadows anchor buildings even at a distance.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=2048;
  const sh=shadowCanvas.getContext('2d'),ss=shadowCanvas.width/side;sh.translate(1024,1024);sh.scale(ss,ss);
  sh.fillStyle=sh.strokeStyle='#25334b';sh.lineWidth=2;sh.lineJoin='round';
  for(const b of data.buildings){sh.beginPath();for(const r of b.rings){r.forEach(([x,z],i)=>i?sh.lineTo(x,z):sh.moveTo(x,z));sh.closePath();}sh.fill('evenodd');sh.stroke();}
  const shadowTex=new THREE.CanvasTexture(shadowCanvas);shadowTex.minFilter=shadowTex.magFilter=THREE.NearestFilter;shadowTex.generateMipmaps=false;
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(side,side),setNoirTone(new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,opacity:.22,depthWrite:false}),'shadow'));contact.rotation.x=-Math.PI/2;contact.position.y=.025;scene.add(contact);
}
function roofGeometry(vertices){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap(([x,,z])=>[x*.18,z*.18]),2));g.computeVertexNormals();g.addGroup(0,vertices.length,0);return g;
}
export function detailedBuildings(scene,data,buildingMeshes){
  const rng=random(24),windows=[],glassPanels=[],bands=[],ledges=[],equipment=[],equipmentBases=[],awnings=[],roofLines=[],roofLineColors=[];
  const walls=['#f0deb3','#dac79b','#adb8bc','#e0a16c','#d2c6c5','#bfaa81'];
  const roofColors=['#c47958','#a15b50','#487781','#77434d','#e0a16c'];
  const register=(mesh,b)=>{mesh.userData.building=b;mesh.userData.colors=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.color.clone());mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);buildingMeshes.push(mesh);};
  let pitched=0;
  for(const [i,b] of data.buildings.entries()){
    const glass=b.facadeMaterial==='glass',roof=b.roof||{},wallHeight=b.wallHeight??b.height;
    const wallColor=b.facadeColor||(glass?'#658f9b':walls[i%walls.length]);
    const topColor=roof.color||(roof.vertices?roofColors[i%roofColors.length]:glass?'#80bfc4':['#9f8b69','#bfaa81','#adb8bc'][i%3]);
    const wallMat=setNoirTone(pixelMaterial({color:wallColor,roughness:glass ? .32 : .95,metalness:glass ? .2 : 0}),'wall');
    const topMat=setNoirTone(pixelMaterial({color:topColor,roughness:.9,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}),'roof');
    const g=new THREE.ExtrudeGeometry(shape(b.rings),{depth:wallHeight,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);
    register(new THREE.Mesh(g,[topMat,wallMat]),b);
    if(roof.vertices){
      pitched++;
      const roofMesh=roofGeometry(roof.vertices);
      register(new THREE.Mesh(roofMesh,[topMat.clone()]),b);
      if(roof.infill?.length)register(new THREE.Mesh(roofGeometry(roof.infill),[wallMat.clone()]),b);
      // True roof creases only: triangulation diagonals never become outlines.
      const edges=new THREE.EdgesGeometry(roofMesh,18),positions=edges.attributes.position;
      for(let j=0;j<positions.count;j+=2){
        const ridge=Math.max(positions.getY(j),positions.getY(j+1))>wallHeight+.6;
        const color=new THREE.Color(ridge?'#e0a16c':'#574e45');
        for(let k=0;k<2;k++){
          roofLines.push(positions.getX(j+k),positions.getY(j+k)+.07,positions.getZ(j+k));
          roofLineColors.push(color.r,color.g,color.b);
        }
      }
      edges.dispose();
    }
    const r=b.rings[0];
    for(let k=1;k<r.length;k++){
      const [ax,az]=r[k-1],[bx,bz]=r[k],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),rotation=Math.atan2(-dz,dx);
      if(len<3)continue;
      const place=(d,y,scale,color)=>({position:[ax+dx*d/len,y,az+dz*d/len],scale,rotation,color});
      if(!roof.vertices){
        ledges.push(place(len/2,wallHeight+.3,[len,.65,.85],glass?'#b5dfd1':'#f0deb3'));
      }
      // A continuous cornice separates the roof plane from the facade.
      bands.push(place(len/2,wallHeight-.45,[len,.65,.45],glass?'#356d85':'#9f8b69'));
      ledges.push(place(len/2,.45,[len,.9,.35],glass?'#556b70':'#a69c89'));
      // Visual rows are grouped at game scale; mapped heights/floors stay in the data.
      const floors=Math.max(1,Math.round(wallHeight/(glass?4.5:5.5))),floorHeight=wallHeight/floors;
      if(glass){
        // Continuous glass panels and floor bands, rather than apartment-style windows.
        for(let floor=0;floor<floors;floor++){
          const y=(floor+.5)*floorHeight;
          bands.push(place(len/2,(floor+1)*floorHeight-.12,[len,.2,.35],'#9eb7bb'));
          const columns=Math.max(1,Math.floor(len/2.3)),step=len/columns;
          for(let col=0;col<columns;col++)glassPanels.push(place((col+.5)*step,y,[step-.2,floorHeight-.35,.19],(col+Math.floor(floor/3))%10<3?'#80bfc4':['#356d85','#5595a7','#487781'][Math.floor(col/3)%3]));
        }
      }else{
        const step=b.kind==='apartments'?5.8:4.8;
        for(let d=2;d<len-1.5;d+=step)for(let floor=0;floor<floors;floor++){
          const y=(floor+.55)*floorHeight;
          windows.push(place(d,y,[b.kind==='apartments'?2.6:2,Math.min(2.4,floorHeight*.48),.22],rng()>.97?'#f2c48c':'#6b9e9c'));
          ledges.push(place(d,y-1.2,[2.8,.3,.55],'#fff0ce'));
          if(b.kind==='apartments'&&floor>0&&(Math.floor(d/step)+i)%3===0){
            ledges.push(place(d,y-1.45,[3.4,.35,1.5],'#f0deb3'));
            bands.push(place(d,y-1,[3.4,.6,1.45],'#796b55'));
          }
        }
        if(wallHeight>15)bands.push(place(len/2,wallHeight*.33,[len,.45,.3],'#bfaa81'));
        if(k===1&&len>8&&wallHeight<17&&i%3===0){
          windows.push(place(len/2,1.6,[3,3,.23],'#25334b'));
          for(let stripe=0;stripe<6;stripe++)awnings.push(place(len/2-2.25+stripe*.9,3.3,[.9,.6,2.8],stripe%2?'#fff0ce':i%2?'#c47958':'#346c61'));
        }
      }
    }
    if(b.roofEquipment){
      const [x,z]=b.roofEquipment;
      equipmentBases.push({position:[x,b.height+.12,z],scale:[4,.2,3],color:'#737b74'});
      equipment.push({position:[x,b.height+.75,z],scale:[2.8,1.25,1.8],color:'#bfc1b7'});
      bands.push({position:[x,b.height+1.4,z],scale:[2.1,.08,1.1],color:'#61716e'});
    }
  }
  const cube=new THREE.BoxGeometry(1,1,1);
  instances(scene,new THREE.PlaneGeometry(1,1),setNoirTone(new THREE.MeshBasicMaterial({map:windowTexture(),side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),'window'),windows,false);
  instances(scene,new THREE.PlaneGeometry(1,1),setNoirTone(new THREE.MeshBasicMaterial({side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),'glass'),glassPanels,false);
  instances(scene,cube,setNoirTone(pixelMaterial({roughness:.85}),'band'),bands,false);
  // Tiny sill shadows read as speckles at map scale; the building itself casts the shadow.
  instances(scene,cube,setNoirTone(pixelMaterial({roughness:.9}),'ledge'),ledges,false);
  instances(scene,cube,setNoirTone(pixelMaterial({roughness:.85}),'equipment'),equipment);
  instances(scene,cube,setNoirTone(pixelMaterial({roughness:1}),'band'),equipmentBases,false);
  instances(scene,cube,pixelMaterial(),awnings);
  const creaseGeometry=new THREE.BufferGeometry();
  creaseGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roofLines,3));
  creaseGeometry.setAttribute('color',new THREE.Float32BufferAttribute(roofLineColors,3));
  const creaseMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false});
  const creases=new THREE.LineSegments(creaseGeometry,creaseMaterial);
  // Roof ridges are useful up close; at overview scale they become tiny crosshatches.
  creases.onBeforeRender=(_renderer,_scene,camera)=>{creaseMaterial.opacity=THREE.MathUtils.clamp((camera.zoom-1.4)/.6,0,1);};
  scene.add(creases);
  return {pitchedRoofs:pitched,roofCreases:roofLines.length/6,glassPanels:glassPanels.length,pixelStorefronts:awnings.length/6};
}
export function detailedTrees(scene,data,mappedPositions){
  const all=[...data.trees,...(data.decorativeTrees||[])],items=[],shadows=[];
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('treeVariant',new THREE.InstancedBufferAttribute(new Float32Array(all.map((_,i)=>i%19===3?3:i%23===5?4:i%3)),1));
  for(const [i,t] of all.entries()){
    const [x,z]=t.point,h=Math.max(7,t.height);
    if(i<data.trees.length)mappedPositions.push(t.point);
    items.push({position:[x,h*.46,z],scale:[h*.75,h,1]});
    shadows.push({position:[x+1.2,.04,z-1.6],scale:[h*.4,1,h*.28]});
  }
  const leaves=instances(scene,geometry,setNoirTone(treeMaterial(),'tree'),items,false);
  const disc=new THREE.CircleGeometry(1,8);disc.rotateX(-Math.PI/2);
  const shade=instances(scene,disc,setNoirTone(new THREE.MeshBasicMaterial({color:'#263b33',transparent:true,opacity:.38,depthWrite:false}),'shadow'),shadows,false);
  const dummy=new THREE.Object3D();let visibleGenerated=0;
  return {
    get visibleGenerated(){return visibleGenerated;},
    update(route,towers){
      visibleGenerated=0;
      for(let i=data.trees.length;i<all.length;i++){
        const [x,z]=all[i].point;
        const hide=route.some(([px,pz])=>Math.hypot(px-x,pz-z)<6)||towers.some(t=>Math.hypot(t.x-x,t.z-z)<9);
        if(!hide)visibleGenerated++;
        for(const [mesh,values] of [[leaves,items],[shade,shadows]]){
          const item=values[i];dummy.position.set(...item.position);dummy.scale.set(...(hide?[0,0,0]:item.scale));dummy.rotation.set(0,0,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        }
      }
      leaves.instanceMatrix.needsUpdate=shade.instanceMatrix.needsUpdate=true;
      leaves.computeBoundingSphere();shade.computeBoundingSphere();
    }
  };
}
