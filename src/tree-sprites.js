import * as THREE from 'three';

// Original canvas sprites: integer spans form the canopy, with connected light
// clusters rather than scattered texture noise. Five seasonal color variants.
export function treeAtlas(){
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=32;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const ramps=[
    ['#263b33','#30533e','#62954f','#88b45e'],
    ['#263b33','#447348','#88b45e','#b3cf7c'],
    ['#25334b','#30533e','#447348','#88b45e'],
    ['#533849','#a15b50','#d2a0a6','#f0deb3'],
    ['#574e45','#9f8b69','#e0a16c','#f2c48c']
  ];
  const blob=(x,y,rx,ry,color)=>{
    ctx.fillStyle=color;
    for(let row=-ry;row<=ry;row++){
      const span=Math.floor(Math.sqrt(Math.max(0,1-row*row/(ry*ry)))*rx);
      ctx.fillRect(x-span,y+row,span*2+1,1);
    }
  };
  ramps.forEach(([outline,shade,leaf,light],i)=>{
    ctx.save();ctx.translate(i*32+4,0);
    ctx.fillStyle='#574e45';ctx.fillRect(10,19,4,12);ctx.fillRect(8,29,8,2);
    ctx.fillStyle='#bfaa81';ctx.fillRect(10,20,1,9);
    if(i===1||i===4){
      // Taller oval crown gives rows of planting a second readable silhouette.
      blob(11,12,8,11,outline);blob(11,11,7,10,shade);
      blob(9,9,6,8,leaf);blob(8,6,4,4,light);
      blob(14,16,4,4,shade);blob(13,14,3,3,leaf);
    }else{
      blob(7,16,7,7,outline);blob(16,15,7,8,outline);blob(11,9,8,8,outline);
      blob(7,15,6,6,shade);blob(16,14,6,7,shade);blob(11,8,7,7,shade);
      blob(6,12,5,5,leaf);blob(14,11,6,5,leaf);blob(10,7,6,5,leaf);
      blob(8,6,4,3,light);blob(5,10,3,2,light);
      ctx.fillStyle=leaf;ctx.fillRect(15,19,3,2);ctx.fillRect(5,18,3,2);
    }
    ctx.restore();
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  return texture;
}

export function treeMaterial(){
  const material=new THREE.MeshBasicMaterial({map:treeAtlas(),alphaTest:.5,alphaToCoverage:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float treeVariant;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vMapUv.x=(vMapUv.x*.75+.125+treeVariant)/5.0;`);
    // Billboard quads share a single instanced draw. Depth testing still places
    // trees behind buildings; the sprites face the camera when orbiting/top-down.
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
      mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      gl_Position=projectionMatrix*mvPosition;`);
  };
  return material;
}
