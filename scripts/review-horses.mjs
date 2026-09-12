import fs from "node:fs/promises";
const port = process.argv[2] || "9357";
const tab = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let id = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  const item = pending.get(message.id);
  if (!item) return;
  pending.delete(message.id);
  clearTimeout(item.timer);
  if (message.error) item.reject(new Error(JSON.stringify(message.error)));
  else item.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = ++id;
    const timer = setTimeout(() => reject(new Error("CDP timeout: " + method)), 30000);
    pending.set(request, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: request, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
await call("Runtime.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://127.0.0.1:8080/horse-workshop.html" });
for (let i = 0; i < 100; i++) {
  if (await evaluate("Boolean(window.horseWorkshopReady)")) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
await evaluate("horseWorkshop.paused = true");
await fs.mkdir("artifacts", { recursive: true });
for (const view of ["side", "three", "front", "rear"]) {
  await evaluate("horseWorkshop.setView(" + JSON.stringify(view) + ")");
  if (view === "side") await evaluate("for(let i=0;i<160;i++) horseWorkshop.advance(1/60,0)");
  const image = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile("artifacts/horse-" + view + ".png", Buffer.from(image.data, "base64"));
}
for (let pose = 0; pose < 4; pose++) {
  await evaluate("horseWorkshop.setView('side'); for(let i=0;i<" + (pose ? 7 : 100) + ";i++) horseWorkshop.advance(1/60,1)");
  const image = await call("Page.captureScreenshot", { format: "png" });
  await fs.writeFile("artifacts/horse-gallop-" + pose + ".png", Buffer.from(image.data, "base64"));
}
const report = await evaluate(`(() => {
  const h = horseWorkshop.horse;
  h.updateMatrixWorld(true);
  let meshes = 0, triangles = 0;
  h.traverse(n => {
    if (!n.isMesh) return;
    meshes++;
    triangles += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3;
  });
  return { meshes, triangles, feet: h.userData.rig.legs.map(l =>
    l.userData.hoof.getWorldPosition(new THREE.Vector3()).toArray()) };
})()`);
console.log(JSON.stringify({ report, errors }, null, 2));
await evaluate("document.querySelector('#coat').value = '2'; document.querySelector('#coat').dispatchEvent(new Event('change')); horseWorkshop.setView('three');");
const chestnut = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/horse-chestnut.png", Buffer.from(chestnut.data, "base64"));

await call("Page.navigate", { url: "http://127.0.0.1:8080/index.html" });
let booted = false;
for (let i = 0; i < 150; i++) {
  booted = await evaluate("Boolean(window.HD?.world?.renderer && window.HD?.state?.horses?.length)");
  if (booted) break;
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!booted) throw new Error("Game did not boot: " + JSON.stringify(errors));
await evaluate("HD.state.paused = true; HD.Race.begin();");
for (let batch = 0; batch < 8; batch++) {
  await evaluate("for(let i=0;i<20;i++){HD.state.elapsed+=.04;HD.Race.update(.04);HD.Broadcast.update(.04)}");
}
await evaluate(`(() => {
  const leader = HD.state.horses.reduce((a,b) =>
    a.userData.data.progress > b.userData.data.progress ? a : b);
  HD.Broadcast.impact(leader, {type:'carrot',config:{boostDuration:5}});
  leader.userData.data.boost = 5;
})()`);
for (let batch = 0; batch < 2; batch++) {
  await evaluate("for(let i=0;i<20;i++){HD.state.elapsed+=.04;HD.Race.update(.04);HD.Broadcast.update(.04)}");
}
const broadcast = await evaluate(`(() => {
  const doubles = HD.world.scene.children.filter(n => n.name === 'Broadcast replay double');
  return { ...HD.Broadcast.diagnostics, articulatedDoubles:
    doubles.filter(n => n.getObjectByName('Knee') && n.getObjectByName('Poll / head')).length };
})()`);
if (!broadcast.replaying || broadcast.articulatedDoubles < 6) {
  throw new Error("Articulated replay failed: " + JSON.stringify(broadcast));
}
await evaluate(`(() => {
  const h = HD.state.horses[2];
  const camera = HD.world.camera;
  camera.children.forEach(n => { n.visible = false; });
  camera.position.copy(h.position).add(
    new THREE.Vector3(7, 4, 11).applyQuaternion(h.quaternion));
  camera.lookAt(h.position.clone().add(new THREE.Vector3(0, 2.5, 0)));
  camera.fov = 38;
  camera.updateProjectionMatrix();
  document.querySelectorAll('body > :not(script)').forEach(n => {
    if (!n.contains(HD.world.renderer.domElement)) n.style.display = 'none';
  });
  const style = document.createElement('style');
  style.textContent = '#app > :not(#viewport), #viewport > :not(canvas){display:none!important}';
  document.head.append(style);
  HD.world.renderer.render(HD.world.scene, camera);
})()`);
const track = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/horse-on-track.png", Buffer.from(track.data, "base64"));
console.log(JSON.stringify({ broadcast, errors }, null, 2));
await call("Page.close");
socket.close();
if (errors.length) process.exitCode = 1;
