import * as THREE from 'three';

const monochrome={value:false};
const accents=new WeakMap(),prepared=new WeakSet();
const colors={route:'#ffc857',target:'#72ded1',tower:'#72ded1',enemy:'#ff6b6b'};
// Linear-light floor, gain, and normalization of the original material tint.
// Architecture gets light upper planes, midtone facades, and recessed windows.
// Store the role in userData so pitched roof / wall clones retain their treatment.
const tones={
  default:[.008,.45,0],ground:[.002,.7,0],base:[.004,.16,0],
  wall:[.025,.17,1],roof:[.07,.34,1],window:[.005,.16,0],
  glass:[.015,.38,0],band:[.009,.18,0],ledge:[.055,.4,0],
  equipment:[.016,.23,0],tree:[.012,.72,0],shadow:[0,.08,0],
};
const noirMaps=new WeakMap();
export function setNoirTone(material,role,map){
  material.userData.noirTone=role;
  if(map)noirMaps.set(material,map);
  return material;
}

// Color belongs to game objects, not to a hue threshold: terracotta roofs,
// blossom trees, and parked cars must remain monochrome in the Noir style.
export function markAccent(material,kind,amount=1){
  let uniforms=accents.get(material);
  if(!uniforms){uniforms={amount:{value:0},color:{value:new THREE.Color()}};accents.set(material,uniforms);}
  uniforms.amount.value=kind?amount:0;
  if(kind)uniforms.color.value.set(colors[kind]);
}

export function applyArtDirection(scene,enabled){
  monochrome.value=enabled;
  scene.traverse(object=>{
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
      if(prepared.has(material)||material.isShaderMaterial)continue;
      if(!accents.has(material))markAccent(material,null);
      const accent=accents.get(material),compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
      const tone=tones[material.userData.noirTone]||tones.default,noirMap=noirMaps.get(material);
      material.onBeforeCompile=function(shader,renderer){
        compile.call(this,shader,renderer);
        shader.uniforms.noir=monochrome;
        shader.uniforms.accentAmount=accent.amount;
        shader.uniforms.accentColor=accent.color;
        shader.uniforms.noirTone={value:new THREE.Vector3(...tone)};
        shader.fragmentShader='uniform bool noir;\nuniform float accentAmount;\nuniform vec3 accentColor;\nuniform vec3 noirTone;\n'+shader.fragmentShader;
        if(noirMap){
          shader.uniforms.noirMap={value:noirMap};
          shader.fragmentShader='uniform sampler2D noirMap;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','(noir ? texture2D(noirMap, vMapUv) : texture2D(map, vMapUv))'));
        }
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          if(noir){
            float luminance=dot(outgoingLight,vec3(.2126,.7152,.0722));
            float tint=max(dot(diffuse,vec3(.2126,.7152,.0722)),.025);
            float lighting=luminance/mix(1.0,tint,noirTone.z);
            vec3 graphite=vec3(clamp(noirTone.x+lighting*noirTone.y,0.0,.8));
            vec3 highlight=accentColor*clamp(.5+luminance, .5,1.15);
            outgoingLight=mix(graphite,highlight,accentAmount);
          }
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>cacheKey+'|noir-v2'+(noirMap?'|ground':'');
      material.needsUpdate=true;prepared.add(material);
    }
  });
}
