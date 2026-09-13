import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {alignCameraToPixels} from '../src/pixel-camera.js';

function camera(){
  const c=new THREE.OrthographicCamera(-500,500,425,-425,1,2200);
  c.position.set(600,424.264,600);c.lookAt(0,0,0);return c;
}
function screen(point,c,w=588,h=500){
  const p=point.clone().project(c);return [(p.x+1)*w/2,(p.y+1)*h/2];
}
test('subpixel pans keep stationary scenery stable on the output grid',()=>{
  const c=camera(),point=new THREE.Vector3(102,40,-53);
  alignCameraToPixels(c,588,500);const before=screen(point,c);
  c.position.x+=.02;alignCameraToPixels(c,588,500);
  const after=screen(point,c);
  after.forEach((v,i)=>assert.ok(Math.abs(v-before[i])<1e-8));
  c.position.x+=8;alignCameraToPixels(c,588,500);
  screen(point,c).forEach((v,i)=>assert.ok(Math.abs(v-before[i]-Math.round(v-before[i]))<1e-8));
});
test('orbit views align the anchor without changing the camera pose or clipping planes',()=>{
  const c=camera();
  for(const w of [195,487,588])for(const angle of [0,.8,2.5,4.2]){
    c.position.set(Math.sin(angle)*850,400,Math.cos(angle)*850);c.lookAt(20,10,30);
    const pose=c.position.clone(),quaternion=c.quaternion.clone();
    alignCameraToPixels(c,w,451);
    screen(new THREE.Vector3(),c,w,451).forEach(v=>assert.ok(Math.abs(v-Math.round(v))<1e-8));
    assert.ok(c.position.equals(pose));assert.ok(c.quaternion.equals(quaternion));
    assert.equal(c.near,1);assert.equal(c.far,2200);
  }
});
test('projection remains invertible for picking and does not drift between idle frames',()=>{
  const c=camera();alignCameraToPixels(c,487,451);
  const original=c.projectionMatrix.clone(),world=new THREE.Vector3(120,43,-70);
  assert.ok(world.clone().project(c).unproject(c).distanceTo(world)<1e-8);
  for(let i=0;i<100;i++)alignCameraToPixels(c,487,451);
  assert.deepEqual(c.projectionMatrix.elements,original.elements);
});
