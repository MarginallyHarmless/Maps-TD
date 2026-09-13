import * as THREE from 'three';
import { alignCameraToPixels } from './pixel-camera.js';
import { applyArtDirection } from './art-direction.js';

// Original art-direction palettes; the labels describe a look, not hardware emulation.
const palette16=[
  '#151e2e','#25334b','#39485b','#566575','#7b8994','#adb8bc',
  '#263b33','#30533e','#447348','#62954f','#88b45e','#b3cf7c','#d8e6a1',
  '#574e45','#796b55','#9f8b69','#bfaa81','#dac79b','#f0deb3','#fff0ce',
  '#533849','#77434d','#a15b50','#c47958','#e0a16c','#f2c48c',
  '#25485e','#356d85','#5595a7','#80bfc4','#b5dfd1',
  '#304b5d','#487781','#6b9e9c','#94bbb0',
  '#913a4c','#d85550','#f48e61','#ffc857',
  '#346c61','#50a589','#85d6a6','#c0efbf',
  '#443c58','#72627d','#a795a6','#d2c6c5','#fff6e0'
];
const palette8=[
  '#151e2e','#39485b','#7b8994','#adb8bc',
  '#263b33','#447348','#88b45e','#d8e6a1',
  '#796b55','#bfaa81','#f0deb3','#fff0ce',
  '#77434d','#c47958','#f2c48c',
  '#25485e','#5595a7','#b5dfd1',
  '#d85550','#ffc857','#50a589','#c0efbf','#72627d','#fff6e0'
];
const paletteMono=[
  ...[12,16,20,24,28,33,39,45,52,60,69,79,90,102,115,129,143,158,174,191,209,229].map(v=>'#'+v.toString(16).padStart(2,'0').repeat(3)),
  '#50422b','#806137','#b68b45','#e2ac50','#ffc857','#ffe3a0',
  '#244844','#346d65','#46978b','#5bbdaf','#72ded1','#b8eee6',
  '#623636','#a44747','#d95a5a','#ff6b6b','#ffaaa1'
];
function rgb(hex){const n=parseInt(hex.slice(1),16);return new THREE.Vector3((n>>16)/255,((n>>8)&255)/255,(n&255)/255);}

export class RetroRenderer {
  constructor(renderer){
    this.renderer=renderer;this.style='16';this.width=1;this.height=1;this.sceneInfo={triangles:0,calls:0};
    this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,depthBuffer:true});
    this.uniforms={colorBuffer:{value:this.target.texture},texel:{value:new THREE.Vector2(1,1)},refined:{value:true},palette:{value:Array.from({length:48},()=>new THREE.Vector3())},paletteCount:{value:48}};
    this.material=new THREE.ShaderMaterial({
      uniforms:this.uniforms,depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader:`
        precision highp float;
        uniform sampler2D colorBuffer;
        uniform bool refined;
        uniform vec2 texel;
        uniform vec3 palette[48];
        uniform int paletteCount;
        varying vec2 vUv;
        vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
        void main(){
          // Average a 2x2 footprint in linear light before palette assignment.
          // This filters texture/line coverage as well as polygon silhouettes.
          vec2 d=texel*.5;
          vec3 linearColor=refined?(
            texture2D(colorBuffer,vUv+vec2(-d.x,-d.y)).rgb+
            texture2D(colorBuffer,vUv+vec2(d.x,-d.y)).rgb+
            texture2D(colorBuffer,vUv+vec2(-d.x,d.y)).rgb+
            texture2D(colorBuffer,vUv+vec2(d.x,d.y)).rgb)*.25:
            texture2D(colorBuffer,vUv).rgb;
          vec3 c=srgb(linearColor);
          float best=100.0;vec3 chosen=palette[0];
          for(int i=0;i<48;i++){
            if(i>=paletteCount)break;
            vec3 delta=c-palette[i];
            float distance=dot(delta*delta,vec3(.3,.52,.18));
            if(distance<best){best=distance;chosen=palette[i];}
          }
          // Palette entries are already in display sRGB: do not encode them again.
          gl_FragColor=vec4(chosen,1.0);
        }`
    });
    this.screen=new THREE.Scene();this.screen.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
    this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.setStyle('16');
  }
  setStyle(style){
    this.style=['mono','16','8'].includes(style)?style:'mono';
    const colors=this.style==='mono'?paletteMono:this.style==='8'?palette8:palette16;
    colors.forEach((hex,i)=>this.uniforms.palette.value[i].copy(rgb(hex)));
    this.uniforms.paletteCount.value=colors.length;
    this.uniforms.refined.value=this.style!=='8';
    // Average geometry coverage before palette assignment. The finished image
    // still contains only palette colors on the same integer pixel grid.
    const samples=this.style!=='8'?Math.min(4,this.renderer.capabilities.maxSamples):0;
    if(this.target.samples!==samples){this.target.samples=samples;this.target.dispose();}
    this.renderer.domElement.style.imageRendering='pixelated';
    this.resize(this.width,this.height);
  }
  resize(width,height){
    this.width=Math.max(1,width);this.height=Math.max(1,height);
    // Integer CSS pixels, independent of device DPI. Crop the spare pixel at
    // odd viewport sizes instead of stretching every pixel by a fractional amount.
    this.pixelScale=this.style==='8'?3:2;
    const w=Math.max(1,Math.ceil(width/this.pixelScale)),h=Math.max(1,Math.ceil(height/this.pixelScale));
    // Reassigning canvas.width/height clears WebGL even if the size is unchanged.
    // ResizeObserver can notify again after the explicit frame/layout update.
    if(this.renderer.domElement.width!==w||this.renderer.domElement.height!==h)this.renderer.setSize(w,h,false);
    this.frameWidth=w;this.frameHeight=h;this.sceneScale=this.style!=='8'?2:1;
    this.target.setSize(w*this.sceneScale,h*this.sceneScale);this.uniforms.texel.value.set(1/this.target.width,1/this.target.height);
    Object.assign(this.renderer.domElement.style,{width:`${w*this.pixelScale}px`,height:`${h*this.pixelScale}px`});
  }

  render(scene,camera){
    applyArtDirection(scene,this.style==='mono');
    alignCameraToPixels(camera,this.frameWidth,this.frameHeight);
    this.renderer.setRenderTarget(this.target);this.renderer.render(scene,camera);
    this.sceneInfo={...this.renderer.info.render};
    this.renderer.setRenderTarget(null);this.renderer.render(this.screen,this.camera);
  }

  get state(){return {style:this.style,antialiasing:this.target.samples>0,finalSmoothing:false,samples:this.target.samples,paletteSize:this.uniforms.paletteCount.value,pixelScale:this.pixelScale,width:this.frameWidth,height:this.frameHeight,sceneScale:this.sceneScale};}
}
