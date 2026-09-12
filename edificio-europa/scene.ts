import { savePng, type ExportContext } from './desktop/platform';
import * as THREE from 'three';
import { buildEuropa } from './architecture';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingCenter, destinationBearing, orbitPosition, shortestTurn, spatialState, worldBearing, type SpatialDestination } from './spatial';

export type ViewMode = 'urban' | 'street' | 'aerial';
export type LightMode = 'day' | 'golden' | 'blue';

// Photo-based reconstruction: dimensions and context are interpretive.
export function createExplorer(host: HTMLElement) {
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D model of Edificio Europa. Drag to orbit, scroll to zoom, arrow keys to pan.');
  renderer.domElement.tabIndex = 0;
  const camera = new THREE.PerspectiveCamera(40, 1, .15, 1200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .065;
  controls.minDistance = 18;
  controls.maxDistance = 260;
  controls.maxPolarAngle = Math.PI / 2 - .025;
  controls.minTargetRadius = 0;
  controls.maxTargetRadius = 120;
  controls.autoRotateSpeed = .45;
  controls.listenToKeyEvents(renderer.domElement);

  let seed = 7182;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const mat = (color: THREE.ColorRepresentation, roughness = .8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const granite = mat('#3e4546', .62, .2);
  const edgeStone = mat('#535d5e', .57, .22);
  const dark = mat('#171f22', .54, .3);
  const aluminum = mat('#303f43', .28, .75);
  const brass = mat('#c4ab67', .35, .75);
  const pavement = mat('#cccbc0');
  const curb = mat('#dddcd0');
  const road = mat('#737e7f');
  const white = mat('#e4e4d7');
  const grass = mat('#617f42');
  const trunkMat = mat('#78634c');
  const glassMaterials = Array.from({length: 8}, (_, i) => new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(.55 + i * .002, .19, .42 + i * .02), roughness: .075 + i * .007, metalness: .88, envMapIntensity: 1.5 }));
  const glow = new THREE.MeshStandardMaterial({color:'#dfcd94', emissive:'#ffd08a',emissiveIntensity:.08,roughness:.4,metalness:.2});
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (geometry: THREE.BufferGeometry, material: THREE.Material, x=0,y=0,z=0, ry=0, parent?:THREE.Object3D) => {
    if (parent) { const m = new THREE.Mesh(geometry, material);m.position.set(x,y,z);m.rotation.y=ry;m.castShadow=true;m.receiveShadow=true;parent.add(m);return; }
    geometry.rotateY(ry);geometry.translate(x,y,z);
    if(!batches.has(material))batches.set(material,[]);
    batches.get(material)!.push(geometry);
  };
  const box = (w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material,ry=0,parent?:THREE.Object3D) => put(new THREE.BoxGeometry(w,h,d),material,x,y,z,ry,parent);
  const cylinder = (rt:number,rb:number,h:number,x:number,y:number,z:number,material:THREE.Material,segments=24) => put(new THREE.CylinderGeometry(rt,rb,h,segments),material,x,y,z);
  const rod = (a:THREE.Vector3,b:THREE.Vector3,r:number,material:THREE.Material) => {
    const g = new THREE.CylinderGeometry(r,r,a.distanceTo(b),6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));
    const p = a.clone().add(b).multiplyScalar(.5);put(g,material,p.x,p.y,p.z);
  };
  function noiseTexture(base:string, variance:number, size=512) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
    const data=ctx.getImageData(0,0,size,size);
    for(let i=0;i<data.data.length;i+=4){const n=(random()-.5)*variance;for(let c=0;c<3;c++)data.data[i+c]=Math.max(0,Math.min(255,data.data[i+c]!+n));}
    ctx.putImageData(data,0,0);
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
  }
  granite.map=noiseTexture('#778081',40);granite.map.repeat.set(3,6);
  edgeStone.map=granite.map;
  road.map=noiseTexture('#9ba3a3',35);road.map.repeat.set(70,70);
  pavement.map=noiseTexture('#eee9db',15);pavement.map.repeat.set(36,36);
  grass.map=noiseTexture('#a4b783',60);grass.map.repeat.set(14,14);

  // A physical lighting environment: a sky dome and surrounding urban volumes.
  const skyUniforms={top:{value:new THREE.Color('#75a6d3')},bottom:{value:new THREE.Color('#e8ece4')}};
  const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:skyUniforms,vertexShader:'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPosition; uniform vec3 top; uniform vec3 bottom; void main(){float h=normalize(vPosition).y; float f=pow(max(h,0.0),0.55); gl_FragColor=vec4(mix(bottom,top,f),1.0);}'});
  const sky=new THREE.Mesh(new THREE.SphereGeometry(550,48,24),skyMaterial);scene.add(sky);
  scene.fog=new THREE.Fog('#dce5de',145,440);
  const sun = new THREE.DirectionalLight('#fff1d3',3.3);sun.position.set(-65,100,65);sun.castShadow=true;
  sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;sun.shadow.camera.near=.5;sun.shadow.camera.far=260;sun.shadow.normalBias=.12;sun.shadow.bias=-.00008;sun.shadow.radius=3;scene.add(sun);
  const ambient=new THREE.HemisphereLight('#c4e1ff','#b6b393',2.1);scene.add(ambient);
  const bounce=new THREE.DirectionalLight('#c9e6ff',.55);bounce.position.set(60,30,-30);scene.add(bounce);

  buildEuropa({put, box, cylinder, rod, mat, granite, edgeStone, dark, aluminum,
    brass, pavement, curb, grass, glow, glassMaterials, makeSignTexture: () => {
      const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=192;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#202727';ctx.fillRect(0,0,1536,192);
      ctx.font='500 85px Arial';ctx.textAlign='center';ctx.fillStyle='#d5ceaf';ctx.fillText('EDIFICIO EUROPA',768,126);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
    }
  });
  // Paved garden island, surrounding avenues and crossing markings.
  box(900,.3,900,0,-.32,0,road);
  box(78,.8,57,0,.2,0,curb);
  box(77.5,.1,56.5,0,.65,0,pavement);
  box(57,.45,29,0,.85,-.5,edgeStone);
  box(55,.15,27,0,1.15,-.5,pavement);
  const joint=mat('#a6aaa0');
  for(let x=-38;x<=38;x+=2.5)box(.025,.012,56,x,.708,0,joint);
  for(let z=-27;z<=27;z+=2.5)box(76,.012,.025,0,.709,z,joint);
  for(let z=36;z<=47;z+=5.5)for(let x=-130;x<140;x+=10)box(4,.025,.16,x,-.15,z,white);
  for(let x of [-48,-55])for(let z=-120;z<120;z+=10)box(.16,.025,4,x,-.15,z,white);
  for(let i=0;i<9;i++){box(1.4,.03,10,21+i*2.5,-.12,37,white);}
  for(let i=0;i<8;i++)box(10,.03,1.4,-46,-.12,-8+i*2.5,white);
  box(170,.03,2.1,21,-.12,30,mat('#ad7966'));
  // Planting beds leave the principal façade visible.
  for(const [x,z,w,d] of [[-15,22,19,6],[13,22,18,6],[33,-8,6,28],[-34,-9,6,27],[0,-22,55,6]]){
    box(w!,.3,d!,x!,.82,z!,curb);box(w!-.5,.08,d!-.5,x!,1,z!,grass);
  }
  const foliageMats=['#405f28','#577638','#728b43','#355b32','#869c55'].map(c=>mat(c,.9));
  const leafGeo=new THREE.IcosahedronGeometry(1,1);
  const leafInstances: {matrix:THREE.Matrix4,color:THREE.Color}[]=[];
  const dummy=new THREE.Object3D();
  function tree(x:number,z:number,height:number,radius:number){
    cylinder(.14,.3,height*.68,x,height*.34+1,z,trunkMat,9);
    for(let branch=0;branch<6;branch++){
      const a=random()*Math.PI*2;rod(new THREE.Vector3(x,height*.38+1,z),new THREE.Vector3(x+Math.cos(a)*radius*.66,height*.7+random()*height*.15,z+Math.sin(a)*radius*.66),.09,trunkMat);
    }
    for(let i=0;i<95;i++){
      const a=random()*Math.PI*2,rr=Math.sqrt(random())*radius,yy=(random()-.5)*radius*1.35;
      dummy.position.set(x+Math.cos(a)*rr,height*.75+1+yy,z+Math.sin(a)*rr);
      const s=.45+random()*.6;dummy.scale.set(s*1.5,s,s*1.25);dummy.rotation.set(random()*3,random()*3,random()*3);dummy.updateMatrix();
      leafInstances.push({matrix:dummy.matrix.clone(),color:new THREE.Color(foliageMats[Math.floor(random()*5)]!.color)});
    }
  }
  for(const [x,z,h,r] of [[-18,22,9,3.8],[13,23,8,3.6],[33,-14,12,4],[33,-3,9,3.5],[-34,-15,12,4],[-34,-4,10,3.2],[0,-22,12,4.5],[15,-22,11,4],[-17,-22,11,4],[-6,23,6.5,2.4],[25,24,6.5,2.6]])tree(x!,z!,h!,r!);
  for(let i=0;i<13;i++)tree(-83+i*12,-48,10+random()*3,3+random()*1.2);
  for(let i=0;i<7;i++)tree(60,-35+i*15,9+random()*4,3.8);
  const leaves = new THREE.InstancedMesh(leafGeo,mat('#ffffff'),leafInstances.length);
  leafInstances.forEach((l,i)=>{leaves.setMatrixAt(i,l.matrix);leaves.setColorAt(i,l.color)});leaves.castShadow=true;leaves.receiveShadow=true;scene.add(leaves);
  // Individual arched palm fronds, with leaflets following each stem.
  const palmMat=mat('#536f31',.85);
  function palm(x:number,z:number,h:number){
    cylinder(.17,.29,h,x,h/2+.7,z,trunkMat,10);
    for(let i=0;i<Math.floor(h*5);i++)cylinder(.205,.235,.065,x,1+i*.2,z,trunkMat,10);
    for(let f=0;f<11;f++){
      const a=f/11*Math.PI*2;const len=3.6+random()*1.2;
      const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,h+.7,z),new THREE.Vector3(x+Math.cos(a)*len*.55,h+2.6,z+Math.sin(a)*len*.55),new THREE.Vector3(x+Math.cos(a)*len,h-.6,z+Math.sin(a)*len));
      put(new THREE.TubeGeometry(curve,10,.035,4,false),palmMat);
      for(let k=1;k<14;k++){
        const t=k/14,p=curve.getPoint(t),width=Math.sin(t*Math.PI)*.95;
        for(const side of [-1,1]){
          const tip=p.clone().add(new THREE.Vector3(Math.cos(a+side*1.1)*width,-.25,Math.sin(a+side*1.1)*width));
          const end=curve.getPoint(Math.min(1,t+.065));
          const g=new THREE.BufferGeometry().setFromPoints([p,tip,end]);g.setAttribute("uv",new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));g.setIndex([0,1,2]);g.computeVertexNormals();put(g,palmMat);
        }
      }
    }
  }
  palmMat.side=THREE.DoubleSide;
  palm(-29,23,12);palm(7,24,12.5);palm(34,17,10.5);palm(-62,47,14);palm(53,41,13);
  // Street furniture and softly glowing evening lamps.
  const lampGlow=new THREE.MeshStandardMaterial({color:'#ffffe8',emissive:'#ffdc99',emissiveIntensity:.15});
  for(const [x,z] of [[-37,27],[36,27],[-39,-24],[39,-24],[15,51],[-59,12]]){
    cylinder(.07,.14,9,x!,4.5,z!,aluminum,8);rod(new THREE.Vector3(x!,9,z!),new THREE.Vector3(x!+2.5,9,z!),.065,aluminum);box(1,.12,.45,x!+2.5,8.92,z!,lampGlow);
  }
  const wood=mat('#86664c');
  for(const [x,z] of [[-9,18],[16,18],[33,8],[-33,6]]){
    for(let k=0;k<4;k++)box(3,.08,.17,x!,1.2,z!+k*.2,wood);
    box(.13,.6,.6,x!-1.15,.9,z!+.3,aluminum);box(.13,.6,.6,x!+1.15,.9,z!+.3,aluminum);
  }
  // Low-detail context is deliberately subordinate to the reconstructed landmark.
  const cityMats=['#c5b6a2','#c9bba8','#d3c9b5','#bdafa3','#d6c9b8','#b4b5a5'].map(c=>mat(c));
  const cityGlass=mat('#66797d',.23,.6);
  function cityBuilding(x:number,z:number,w:number,d:number,h:number,index:number){
    const m=cityMats[index%cityMats.length]!;
    box(w,h,d,x,h/2,z,m);box(w+.5,.35,d+.5,x,h+.2,z,white);
    box(w-2,1.1,d-2,x,h+.6,z,m);
    for(let floor=0;floor<Math.floor(h/3);floor++){
      const y=2+floor*3;
      for(let bx=-w/2+1.8;bx<w/2-1;bx+=3){
        box(1.25,1.55,.12,x+bx,y,z+d/2+.07,cityGlass);box(1.65,.14,.45,x+bx,y-.78,z+d/2+.25,white);
        box(1.25,1.55,.12,x+bx,y,z-d/2-.07,cityGlass);
      }
      for(let bz=-d/2+1.8;bz<d/2-1;bz+=3){box(.12,1.55,1.25,x+w/2+.07,y,z+bz,cityGlass);box(.12,1.55,1.25,x-w/2-.07,y,z+bz,cityGlass);}
      if(floor%3===0)box(w+.15,.1,d+.15,x,y-1.3,z,white);
    }
  }
  for(let i=0;i<9;i++)cityBuilding(-130+i*30,-83,24,25,22+random()*17,i);
  for(let i=0;i<10;i++)cityBuilding(-150+i*33,-126,27,29,17+random()*23,i+3);
  for(let i=0;i<6;i++)cityBuilding(-94,-20+i*38,26,30,18+random()*20,i+1);
  for(let i=0;i<5;i++)cityBuilding(91,-21+i*40,25,30,21+random()*18,i+2);
  const rubber=mat('#252c2c');
  function car(x:number,z:number,color:string,angle=0){
    const group=new THREE.Group();group.position.set(x,.2,z);group.rotation.y=angle;scene.add(group);
    const paint=mat(color,.25,.55);
    box(1.8,.65,4.1,0,.55,0,paint,0,group);box(1.6,.64,2.25,0,1.13,-.15,paint,0,group);
    box(1.49,.5,.025,0,1.15,1,cityGlass,-.0,group);box(1.49,.45,.025,0,1.16,-1.3,cityGlass,0,group);
    for(const side of [-1,1]){box(.025,.45,1.84,side*.811,1.17,-.15,cityGlass,0,group);for(const zz of [-1.25,1.25]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,.18,16),rubber);wheel.rotation.z=Math.PI/2;wheel.position.set(side*.89,.38,zz);group.add(wheel);}}
    for(const side of [-1,1]){box(.45,.17,.08,side*.58,.72,2.08,white,0,group);box(.43,.13,.08,side*.59,.75,-2.08,mat('#9c4033'),0,group);}
  }
  car(-10,39,'#d9dbd7',Math.PI/2);car(13,45,'#526d84',-Math.PI/2);car(-48,15,'#c7c7be');car(52,38,'#a74e3e',Math.PI/2);car(-56,-24,'#c0bcaa',Math.PI);car(-51,65,'#2f434d');car(74,45,'#e4e0cd',-Math.PI/2);
  // Consolidate static architecture into a small number of GPU draw calls.
  for(const [material,geometries] of batches){
    const merged=mergeGeometries(geometries,false);
    if(!merged)continue;
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    geometries.forEach(g=>g.dispose());
  }
  const pmrem=new THREE.PMREMGenerator(renderer);
  let environment:THREE.WebGLRenderTarget|null=null;
  function updateEnvironment(){
    // Reflect a separate full urban environment without the landmark reflecting itself.
    const reflectionScene=new THREE.Scene();
    const reflectionSky=new THREE.Mesh(new THREE.SphereGeometry(450,32,16),skyMaterial);reflectionScene.add(reflectionSky);
    const light=new THREE.HemisphereLight(ambient.color,ambient.groundColor,2);reflectionScene.add(light);
    const reflectionSun=new THREE.DirectionalLight(sun.color,2.5);reflectionSun.position.copy(sun.position);reflectionScene.add(reflectionSun);
    for(let i=0;i<28;i++){
      const a=i/28*Math.PI*2;const height=16+(i*13%28);const b=new THREE.Mesh(new THREE.BoxGeometry(14,height,16),cityMats[i%cityMats.length]);b.position.set(Math.cos(a)*85,height/2-15,Math.sin(a)*85);reflectionScene.add(b);
      for(let f=0;f<height/3;f++){
        const stripe=new THREE.Mesh(new THREE.BoxGeometry(14.1,.9,16.1),cityGlass);stripe.position.copy(b.position);stripe.position.y=f*3-14;reflectionScene.add(stripe);
      }
    }
    const next=pmrem.fromScene(reflectionScene,.025,.1,600,{size:256});
    environment?.dispose();environment=next;scene.environment=next.texture;
    reflectionScene.traverse(obj=>{if(obj instanceof THREE.Mesh)obj.geometry.dispose()});
  }
  updateEnvironment();
  const preset:Record<ViewMode,{position:number[],target:number[]}>={
    urban:{position:[-83,59,105],target:[3,23,0]},
    street:{position:[-65,8.5,44],target:[-13,25,0]},
    aerial:{position:[-79,105,103],target:[0,17,0]},
  };
  let currentView:ViewMode='urban';
  let transition:{from:THREE.Vector3,to:THREE.Vector3,fromTarget:THREE.Vector3,toTarget:THREE.Vector3,start:number;sample?:(progress:number)=>void;finish(error?:Error):void}|null=null;
  const navigationListeners=new Set<(kind:'manual'|'zoom'|'spatial')=>void>();
  const cancelTransition=()=>{const old=transition;transition=null;old?.finish(new DOMException("Camera movement was interrupted", "AbortError"));};
  const mobile=()=>host.clientWidth<700;
  function destination(view:ViewMode){
    const p=preset[view];const position=new THREE.Vector3(...p.position as [number,number,number]);const target=new THREE.Vector3(...p.target as [number,number,number]);
    if(mobile()){position.sub(target).multiplyScalar(view==='street'?1.18:1.26).add(target);target.y-=5;}
    return {position,target};
  }
  const initial=destination('urban');camera.position.copy(initial.position);controls.target.copy(initial.target);controls.update();
  const resize=()=>{
    const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;
    // Reserve composition space for the perspective picker on wide screens.
    camera.setViewOffset(w,h,w*(mobile()?0:.12),mobile()?-h*.055:0,w,h);camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);resize();
  controls.addEventListener('start',()=>{cancelTransition();navigationListeners.forEach(fn=>fn('manual'));});
  renderer.domElement.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){cancelTransition();navigationListeners.forEach(fn=>fn('manual'));}});
  const zoomLevel=()=>{const p=destination(currentView);const ratio=camera.position.distanceTo(controls.target)/p.position.distanceTo(p.target);return ratio<.85?'close' as const:ratio>1.15?'wide' as const:'normal' as const;};
  let lastZoomLevel=zoomLevel();
  controls.addEventListener('change',()=>{const next=zoomLevel();if(next!==lastZoomLevel){lastZoomLevel=next;navigationListeners.forEach(fn=>fn('zoom'));}});
  let last=performance.now(), lastSpatialAt=0, lastSpatial='';
  renderer.setAnimationLoop(()=>{
    const now=performance.now();const delta=Math.min((now-last)/1000,.1);last=now;
    if(transition){
      const t=Math.min(1,(now-transition.start)/1400),s=t*t*(3-2*t);
      if(transition.sample)transition.sample(s);else camera.position.lerpVectors(transition.from,transition.to,s);controls.target.lerpVectors(transition.fromTarget,transition.toTarget,s);if(t>=1){const done=transition;transition=null;done.finish();}
    }
    controls.update(delta);renderer.render(scene,camera);
    if(now-lastSpatialAt>=160){
      lastSpatialAt=now;const next=JSON.stringify(spatialState(camera.position,controls.target));
      if(next!==lastSpatial){lastSpatial=next;navigationListeners.forEach(fn=>fn('spatial'));}
    }
  });
  function move(to:THREE.Vector3,target:THREE.Vector3,signal?:AbortSignal,sample?:(progress:number)=>void):Promise<void>{
    signal?.throwIfAborted();cancelTransition();
    return new Promise((resolve,reject)=>{
      const abort=()=>{if(transition===movement){transition=null;movement.finish(new DOMException('Camera movement was interrupted','AbortError'));}};
      const movement={from:camera.position.clone(),to,fromTarget:controls.target.clone(),toTarget:target,start:performance.now(),sample,finish(error?:Error){signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve();}};
      transition=movement;signal?.addEventListener('abort',abort,{once:true});
    });
  }
  function prepareNavigation(){
    cancelTransition();controls.autoRotate=false;
    // Consume pending orbit/pan damping before capturing the movement origin.
    controls.enableDamping=false;controls.update();controls.enableDamping=true;
  }
  function orbit(turn:number,signal?:AbortSignal){
    const start=camera.position.clone(),end=orbitPosition(start,turn,1);
    return move(new THREE.Vector3(end.x,end.y,end.z),new THREE.Vector3(buildingCenter.x,buildingCenter.y,buildingCenter.z),signal,
      progress=>{const point=orbitPosition(start,turn,progress);camera.position.set(point.x,point.y,point.z);});
  }
  return {
    setPerspective(view:ViewMode,signal?:AbortSignal):Promise<void>{
      signal?.throwIfAborted();prepareNavigation();currentView=view;const next=destination(view);
      return move(next.position,next.target,signal);
    },
    showSide(side:SpatialDestination,signal?:AbortSignal){signal?.throwIfAborted();prepareNavigation();return orbit(shortestTurn(worldBearing(camera.position.x,camera.position.z),destinationBearing(side)),signal);},
    orbitView(direction:'left'|'right',degrees:number,signal?:AbortSignal){signal?.throwIfAborted();prepareNavigation();return orbit((direction==='left'?1:-1)*degrees,signal);},
    getSpatialState:()=>spatialState(camera.position,controls.target),
    setAutoRotate(value:boolean){controls.autoRotate=value;},
    getZoomLevel:zoomLevel,
    onNavigationChange(listener:(kind:'manual'|'zoom'|'spatial')=>void){navigationListeners.add(listener);return ()=>{navigationListeners.delete(listener);};},
    adjustZoom(factor:number){cancelTransition();const distance=camera.position.distanceTo(controls.target);const clamped=THREE.MathUtils.clamp(distance*factor,controls.minDistance,controls.maxDistance);camera.position.sub(controls.target).multiplyScalar(clamped/distance).add(controls.target);controls.update();},
    setLighting(mode:LightMode){
      const themes={day:{top:'#75a6d3',bottom:'#e8ece4',sun:'#fff1d3',sky:'#c4e1ff',ground:'#b6b393',fog:'#dce5de',power:3.3,ambient:2.1,exposure:1.12,pos:[-65,100,65],glow:.08},golden:{top:'#89acc7',bottom:'#f9d0a0',sun:'#ffbe72',sky:'#d5d1d7',ground:'#b6986b',fog:'#e5cbb2',power:3.5,ambient:1.65,exposure:1.05,pos:[-95,24,48],glow:.7},blue:{top:'#1c365e',bottom:'#8a9dab',sun:'#b1c5f8',sky:'#7797ce',ground:'#4c5c68',fog:'#758a9c',power:.7,ambient:1.25,exposure:1.03,pos:[-45,60,-50],glow:3}};
      const t=themes[mode];skyUniforms.top.value.set(t.top);skyUniforms.bottom.value.set(t.bottom);sun.color.set(t.sun);sun.intensity=t.power;sun.position.set(...t.pos as [number,number,number]);ambient.color.set(t.sky);ambient.groundColor.set(t.ground);ambient.intensity=t.ambient;(scene.fog as THREE.Fog).color.set(t.fog);renderer.toneMappingExposure=t.exposure;glow.emissiveIntensity=t.glow;lampGlow.emissiveIntensity=t.glow;glassMaterials.forEach((m,i)=>{m.emissive.set(mode==='blue'&&i%3===0?'#b79755':'#000000');m.emissiveIntensity=mode==='blue'?.18:0});updateEnvironment();
    },
    async capture(context: ExportContext = { id: crypto.randomUUID() }){
      context.signal?.throwIfAborted(); let png: Promise<Blob>;
      const pixelRatio=renderer.getPixelRatio();const oldAspect=camera.aspect;const oldView=camera.view?{...camera.view}:null;
      try{
        renderer.setPixelRatio(1);renderer.setSize(3840,2160,false);camera.aspect=3840/2160;camera.clearViewOffset();camera.updateProjectionMatrix();renderer.render(scene,camera);
        // toBlob snapshots the bitmap before asynchronous encoding, so rendering can resume immediately.
        png=new Promise((resolve,reject)=>renderer.domElement.toBlob(blob=>blob?resolve(blob):reject(new Error('Image encoding failed.')),'image/png'));
      } finally {
        renderer.setPixelRatio(pixelRatio);camera.aspect=oldAspect;if(oldView?.enabled)camera.setViewOffset(oldView.fullWidth,oldView.fullHeight,oldView.offsetX,oldView.offsetY,oldView.width,oldView.height);resize();renderer.render(scene,camera);
      }
      return savePng(await png!,`edificio-europa-${currentView}-4k.png`,context);
    },
  };
}
