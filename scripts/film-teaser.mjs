import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('Pass the films output folder.');
await fs.mkdir(output, { recursive: true });
const encoder = 'D:/CapCut/9.1.0.3879/ffmpeg.exe';
const tab = await fetch('http://127.0.0.1:9355/json/new?about:blank', {method:'PUT'}).then(r=>r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let sequence=0;
const pending=new Map();
ws.addEventListener('message',({data})=>{
  const message=JSON.parse(data), item=pending.get(message.id);
  if(!item)return;
  pending.delete(message.id);
  message.error?item.reject(new Error(JSON.stringify(message.error))):item.resolve(message.result);
});
function call(method,params={}) {
  return new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function film(name, frames, shot) {
  const child=spawn(encoder,['-y','-f','image2pipe','-framerate','30','-i','pipe:0','-an','-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le',path.join(output,name+'.mov')]);
  let errors='';child.stderr.on('data',d=>{errors+=d;});
  const done=new Promise((resolve,reject)=>child.on('close',code=>code===0?resolve():reject(new Error(errors))));
  child.stdin.on('error',()=>{});
  for(let frame=0;frame<frames;frame++) {
    const data=await evaluate(`window.filmFrame(${JSON.stringify(shot)},${frame},${frames})`);
    const bytes=Buffer.from(data.split(',')[1],'base64');
    if(frame===Math.floor(frames/2))await fs.writeFile(path.join(output,name+'-preview.png'),bytes);
    if(!child.stdin.write(bytes))await new Promise(r=>child.stdin.once('drain',r));
    if(frame%30===0)console.log(name,frame+'/'+frames);
  }
  child.stdin.end();await done;console.log('SAVED',name);
}
try {
  await call('Page.enable');await call('Runtime.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('hotdog-downs-quality','high');`});
  if(process.env.FIELD_TEASER==='1') {
    await call('Page.navigate',{url:'http://127.0.0.1:8080/media-studio.html'});
    await new Promise(r=>setTimeout(r,500));
    const source=await fs.readFile(new URL('./teaser-field.js',import.meta.url),'utf8');
    await evaluate('(async()=>{'+source+'})()');
  }else{
  await call('Page.navigate',{url:'http://127.0.0.1:8080/index.html'});
  for(let i=0;i<150;i++) {
    if(await evaluate('Boolean(window.HD?.world?.renderer && HD.state.horses.length)'))break;
    await new Promise(r=>setTimeout(r,300));
  }
  await evaluate(`(() => {
    HD.state.paused=true; HD.Race.begin();
    const world=HD.world, horse=HD.state.horses[0];
    world.camera.children.forEach(o=>o.visible=false);
    const camera=new THREE.PerspectiveCamera(48,16/9,.05,1200);
    const renderer=world.renderer;
    renderer.setPixelRatio(1);renderer.setSize(3840,2160,false);
    renderer.shadowMap.enabled=true;
    world.scene.traverse(o=>{
      if(o.isDirectionalLight){o.castShadow=true;o.shadow.mapSize.set(4096,4096);}
      const materials=Array.isArray(o.material)?o.material:[o.material];
      materials.forEach(m=>{if(m?.map){m.map.anisotropy=renderer.capabilities.getMaxAnisotropy();m.map.needsUpdate=true;}});
    });
    const item=HD.Models.throwable('hotdog');world.scene.add(item);item.visible=false;
    const preset={id:'teaser',name:'Teaser',position:[0,0,0],target:[0,0,0],fov:48};
    // Match the invisible projectile camera: five units behind, 1.25 above,
    // aiming directly at the prop. This staged shot ends before collision.
    window.filmFrame=(shot,frame,frames)=>{
      HD.state.elapsed+=1/30; HD.Race.update(1/30);
      HD.Stadium.showAllViewCulled();
      const target=horse.position.clone();
      if(shot==='hooves'){
        item.visible=false;
        camera.position.copy(target).add(new THREE.Vector3(4,.58,4.3).applyQuaternion(horse.quaternion));
        camera.lookAt(target.clone().add(new THREE.Vector3(0,1.45,0)));
        camera.fov=48;
      }else{
        item.visible=true;
        const u=frame/(frames-1);
        const offset=new THREE.Vector3(6*(1-u)+.45,7*(1-u)+3.0,-3*(1-u)).applyQuaternion(horse.quaternion);
        item.position.copy(target).add(offset);item.rotation.set(.65,u*1.5,-.2);
        const direction=target.clone().sub(item.position);direction.y=0;direction.normalize();
        camera.position.copy(item.position).addScaledVector(direction,-5);camera.position.y+=1.25;
        camera.lookAt(item.position);camera.fov=58;
      }
      camera.updateProjectionMatrix();renderer.render(world.scene,camera);
      return renderer.domElement.toDataURL('image/png');
    };
  })()`);
  }
  if(process.env.PREVIEW_ONLY==='1'){
    for(const shot of ['hooves','hotdog']){
      const previewFrames=shot==='hotdog'?30:90;
      const previewFrame=Math.floor(previewFrames/2);
      const data=await evaluate(`filmFrame('${shot}',${previewFrame},${previewFrames},1280)`);
      await fs.writeFile(path.join(output,shot+'-framing.png'),Buffer.from(data.split(',')[1],'base64'));
    }
  }else{
    await film('01-field-horse-rear-hooves-4K',90,'hooves');
    // A real full-power hotdog reaches its target in under a second.
    await film('02-field-hotdog-chase-4K',30,'hotdog');
    await film('03-coming-soon-4K',75,'endcard');
  }
}finally{await call('Page.close').catch(()=>{});ws.close();}
