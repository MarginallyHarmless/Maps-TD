import * as THREE from 'three';

const monochrome={value:false};
const accents=new WeakMap(),prepared=new WeakSet();
const colors={route:'#ffc857',target:'#72ded1',tower:'#72ded1',enemy:'#ff6b6b'};

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
      material.onBeforeCompile=function(shader,renderer){
        compile.call(this,shader,renderer);
        shader.uniforms.noir=monochrome;
        shader.uniforms.accentAmount=accent.amount;
        shader.uniforms.accentColor=accent.color;
        shader.fragmentShader='uniform bool noir;\nuniform float accentAmount;\nuniform vec3 accentColor;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
          if(noir){
            float luminance=dot(outgoingLight,vec3(.2126,.7152,.0722));
            vec3 graphite=vec3(.006+luminance*.32);
            vec3 highlight=accentColor*clamp(.5+luminance, .5,1.15);
            outgoingLight=mix(graphite,highlight,accentAmount);
          }
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey=()=>cacheKey+'|noir-v1';
      material.needsUpdate=true;prepared.add(material);
    }
  });
}
