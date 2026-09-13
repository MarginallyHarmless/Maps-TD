import * as THREE from 'three';

// A small inset window with a connected reflection and a dark top recess.
// Neutral values let each facade's instance color tint the same original sprite.
export function windowTexture(){
  const canvas=document.createElement('canvas');canvas.width=12;canvas.height=12;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#566575';ctx.fillRect(0,0,12,12);
  ctx.fillStyle='#b5d3d5';ctx.fillRect(1,2,10,9);
  ctx.fillStyle='#ffffff';ctx.fillRect(2,2,3,5);ctx.fillRect(5,2,3,2);
  ctx.fillStyle='#7b8994';ctx.fillRect(1,9,10,2);
  ctx.fillStyle='#d9e4e0';ctx.fillRect(5,2,1,9);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  return texture;
}
