// Dedicated filmed set using the game's real horse, jockey and hotdog assets.
window.THREE = await import('/vendor/three.module.js');
await import('/src/config.js');
const { Assets } = await import('/src/assets.mjs');
HD.Assets=Assets;
await Assets.preload(['hotdog']);
await import('/src/models.js');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
document.body.replaceChildren(renderer.domElement);
const scene=new THREE.Scene();
scene.background=new THREE.Color('#b8d7e7');
scene.fog=new THREE.Fog('#b8d7e7',110,330);
scene.add(new THREE.HemisphereLight(0xdcefff,0x7b7046,2));
const sun=new THREE.DirectionalLight(0xffe7b1,3.2);
sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);
Object.assign(sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:.1,far:120});
sun.shadow.normalBias=.025;
scene.add(sun,sun.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(700,700),new THREE.MeshStandardMaterial({color:0x759346,roughness:1}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const path=new THREE.Mesh(new THREE.PlaneGeometry(4.2,400),new THREE.MeshStandardMaterial({color:0x9d825a,roughness:1}));
path.rotation.x=-Math.PI/2;path.position.y=.012;path.receiveShadow=true;scene.add(path);
let seed=43;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const dummy=new THREE.Object3D();
const grasses=new THREE.InstancedMesh(new THREE.ConeGeometry(.1,.55,3),new THREE.MeshStandardMaterial({color:0x87a653,roughness:1}),6000);
for(let i=0;i<6000;i++){
  const x=(random()-.5)*130,z=(random()-.5)*200;
  dummy.position.set(Math.abs(x)<2.3?x+5:x,.2,z);dummy.rotation.set(0,random()*6.28,(random()-.5)*.25);
  dummy.scale.setScalar(.5+random());dummy.updateMatrix();grasses.setMatrixAt(i,dummy.matrix);
}
scene.add(grasses);
for(let i=0;i<45;i++){
  const x=(random()<.5?-1:1)*(15+random()*110),z=-100+random()*210;
  const tree=new THREE.Group();tree.position.set(x,0,z);
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.38,4,7),new THREE.MeshStandardMaterial({color:0x705039}));
  trunk.position.y=2;tree.add(trunk);
  const leaves=new THREE.Mesh(new THREE.SphereGeometry(2.5,12,9),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.25+random()*.05,.35,.28+random()*.12)}));
  leaves.position.y=5;leaves.scale.y=1.25;tree.add(leaves);tree.scale.setScalar(.7+random());scene.add(tree);
}
for(let i=0;i<12;i++){
  const hill=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),new THREE.MeshStandardMaterial({color:0x7e9e8c,roughness:1}));
  hill.position.set((i-6)*50,-12,-190-random()*50);hill.scale.set(40,25+random()*30,45);scene.add(hill);
}
const horse=HD.Models.horse(HD.CONFIG.horses[0],0);
horse.userData.numberLabel.visible=false;
horse.userData.data.motionSpeed=horse.userData.data.baseSpeed;
scene.add(horse);
const hotdog=HD.Models.throwable('hotdog');scene.add(hotdog);
const camera=new THREE.PerspectiveCamera(47,16/9,.05,500);
window.filmFrame=(shot,frame,frames,width=3840)=>{
  if(shot==='endcard'){
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=width*9/16;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff6df';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold '+width*.044+'px Arial';
    ctx.fillText('COMING SOON',canvas.width/2,canvas.height/2);return canvas.toDataURL('image/png');
  }
  const u=frame/(frames-1), flightTime=frame/30, time=(shot==='hotdog'?3+flightTime:frame/30);
  horse.position.set(0,.75,-time*6);horse.rotation.y=Math.PI/2;
  horse.userData.rig.motion=1;horse.userData.rig.phase=time*14;horse.userData.rig.lastTime=time;
  HD.Models.animateHorse(horse,time,true);
  sun.position.copy(horse.position).add(new THREE.Vector3(-18,30,12));sun.target.position.copy(horse.position);
  hotdog.visible=shot==='hotdog';
  if(shot==='hooves'){
    camera.position.copy(horse.position).add(new THREE.Vector3(.8,-.17,6.6+u*1.5));
    camera.lookAt(horse.position.clone().add(new THREE.Vector3(0,1.1,-1)));camera.fov=45;
  }else{
    // This is the actual full-power Ballpark Hotdog profile: speed 36,
    // throwing-ease multiplier 1.08, lift 8 x 0.98, gravity 19.  It starts
    // almost 30 world units behind the horse and reaches it in just under a
    // second, rather than being artificially slowed for the camera.
    const hotdogStart=new THREE.Vector3(.8,2.5,11.5);
    const hotdogVelocity=new THREE.Vector3(-.83,7.84,-38.88);
    hotdog.position.copy(hotdogStart).addScaledVector(hotdogVelocity,flightTime);
    hotdog.position.y-=.5*19*flightTime*flightTime;
    hotdog.rotation.set(.65,flightTime*7.5,-.2);
    const direction=horse.position.clone().sub(hotdog.position);direction.y=0;direction.normalize();
    camera.position.copy(hotdog.position).addScaledVector(direction,-5);camera.position.y+=1.25;
    camera.lookAt(hotdog.position);camera.fov=58;
  }
  camera.updateProjectionMatrix();renderer.setSize(width,width*9/16,false);renderer.render(scene,camera);
  return renderer.domElement.toDataURL('image/png');
};
