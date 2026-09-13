import * as THREE from 'three';
import { pixelMaterial } from './pixel-material.js';
import { pointCell } from './navigation.js';

// Decorative props are inferred from road geometry, never claimed as surveyed objects.
export function neighborhoodLife(scene,data){
  const spots=[],trees=[...data.trees,...(data.decorativeTrees||[])];
  for(const road of data.roads){
    if(!['residential','service','living_street'].includes(road.kind)||road.width>9)continue;
    for(let i=1;i<road.points.length&&spots.length<80;i++){
      const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
      for(let d=14;d<len-8&&spots.length<80;d+=37){
        const side=(i%2?1:-1)*(road.width/2+1.1),x=ax+dx*d/len-dz/len*side,z=az+dz*d/len+dx/len*side;
        const cell=pointCell(data.grid,x,z);
        if(cell<0||data.grid.cost[cell]!==5||trees.some(t=>Math.hypot(x-t.point[0],z-t.point[1])<5)||spots.some(p=>Math.hypot(p.x-x,p.z-z)<10))continue;
        spots.push({x,z,rotation:Math.atan2(-dz,dx),source:'procedural'});
      }
    }
  }
  const body=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),pixelMaterial({roughness:.8}),spots.length);
  const cabin=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),pixelMaterial({color:'#71949b',roughness:.55}),spots.length);
  body.castShadow=cabin.castShadow=true;scene.add(body,cabin);
  spots.forEach((p,i)=>body.setColorAt(i,new THREE.Color(['#c48670','#d1bc82','#83a79b','#d4d5bf','#78909e'][i%5])));
  const dummy=new THREE.Object3D();let visibleCars=0;
  const flag=new THREE.Group();flag.visible=false;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,14,6),pixelMaterial({color:'#786d59'}));pole.position.y=7;flag.add(pole);
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e8c079';ctx.fillRect(0,0,64,32);ctx.fillStyle='#496e69';ctx.fillRect(0,0,9,32);
  ctx.beginPath();ctx.moveTo(25,6);ctx.lineTo(42,6);ctx.lineTo(42,20);ctx.lineTo(33.5,27);ctx.lineTo(25,20);ctx.closePath();ctx.fill();
  ctx.fillStyle='#f8e9bf';ctx.fillRect(30,10,7,3);ctx.fillRect(32,8,3,12);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;
  const geometry=new THREE.PlaneGeometry(14,7,8,2);geometry.translate(7,10,0);
  const rest=geometry.attributes.position.array.slice();
  const cloth=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));flag.add(cloth);flag.rotation.y=Math.PI/4;scene.add(flag);
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const setTarget=b=>{flag.visible=!!b;if(b)flag.position.set(b.center[0],b.height+.3,b.center[1]);};
  const update=(route,towers)=>{
    visibleCars=0;
    spots.forEach((p,i)=>{
      const hidden=route.some(([x,z])=>Math.hypot(p.x-x,p.z-z)<5)||towers.some(t=>Math.hypot(p.x-t.x,p.z-t.z)<8);
      if(!hidden)visibleCars++;
      for(const [mesh,height,size] of [[body,.85,[4.6,1.2,1.9]],[cabin,1.6,[2.5,.85,1.55]]]){
        dummy.position.set(p.x,height,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(...(hidden?[0,0,0]:size));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
    });
    body.instanceMatrix.needsUpdate=cabin.instanceMatrix.needsUpdate=true;body.computeBoundingSphere();cabin.computeBoundingSphere();
  };
  update([],[]);
  return {setTarget,update,get stats(){return {parkedCars:visibleCars,strongholdFlag:flag.visible};},
    animate(time){if(reducedMotion.matches||!flag.visible)return;const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++){const x=rest[i*3];pos.setZ(i,Math.sin(time*2.3-x*.55)*.7*(x/14));}pos.needsUpdate=true;geometry.computeVertexNormals();}
  };
}
