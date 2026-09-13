import * as THREE from 'three';

// Three discrete light levels keep large planes readable without smooth gradients.
const ramp=new THREE.DataTexture(new Uint8Array([85,170,255]),3,1,THREE.RedFormat);
ramp.minFilter=ramp.magFilter=THREE.NearestFilter;
ramp.generateMipmaps=false;ramp.needsUpdate=true;

export function pixelMaterial(options={}){
  const {roughness,metalness,...settings}=options;
  return new THREE.MeshToonMaterial({...settings,gradientMap:ramp});
}
