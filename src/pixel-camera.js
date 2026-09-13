import * as THREE from 'three';

const origin=new THREE.Vector3();

// Align a fixed world anchor with the output grid. Damped panning otherwise
// repeatedly changes fractional edge coverage even between adjacent pixels.
// Adjust projection only: the user's orbit target and camera pose stay continuous.
export function alignCameraToPixels(camera,width,height){
  camera.updateProjectionMatrix();camera.updateMatrixWorld();
  origin.set(0,0,0).project(camera);
  const x=(origin.x+1)*width/2,y=(origin.y+1)*height/2;
  camera.projectionMatrix.elements[12]+=(Math.round(x)-x)*2/width;
  camera.projectionMatrix.elements[13]+=(Math.round(y)-y)*2/height;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
