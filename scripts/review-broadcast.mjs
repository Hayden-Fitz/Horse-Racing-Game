import fs from "node:fs/promises";
const endpoint = "http://127.0.0.1:" + (process.argv[2] || 9355);
const tab = await fetch(endpoint + "/json/new?about:blank", { method: "PUT" }).then(r => r.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let id = 0;
const requests = new Map(), errors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  const request = requests.get(message.id);
  if (request) { requests.delete(message.id); request(message.result); }
});
const call = (method, params = {}) => new Promise(resolve => {
  requests.set(++id, resolve);
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Page.navigate", { url: "http://127.0.0.1:8080" });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate("!!window.HD?.world?.renderer");
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw Error("Startup failed: " + JSON.stringify(errors));
  const result = await evaluate(`(() => {
    const S = HD.state;
    S.paused = true;
    HD.Race.begin();
    for (let i = 0; i < 160; i++) {
      HD.Race.update(.04);
      HD.Broadcast.update(.04);
    }
    const leader = [...S.horses].sort((a,b) =>
      b.userData.data.progress-a.userData.data.progress)[0];
    HD.Broadcast.impact(leader, {type:"carrot",config:{boostDuration:5}});
    leader.userData.data.boost = 5;
    for (let i = 0; i < 70; i++) {
      HD.Race.update(.04);
      HD.Broadcast.update(.04);
    }
    const board = HD.world.replayBillboard;
    const camera = HD.world.camera;
    const point = board.screen.getWorldPosition(new THREE.Vector3());
    const outward = new THREE.Vector3(0,0,1).applyQuaternion(
      board.screen.getWorldQuaternion(new THREE.Quaternion()));
    camera.position.copy(point).addScaledVector(outward, 32);
    camera.lookAt(point);
    camera.fov = 48;
    camera.updateProjectionMatrix();
    HD.world.renderer.render(HD.world.scene,camera);
    document.querySelectorAll("body > :not(script)").forEach(node => {
      if (!node.contains(HD.world.renderer.domElement)) node.style.display="none";
    });
    const style=document.createElement("style");
    style.textContent="#app > :not(#viewport), #viewport > :not(canvas){display:none!important}";
    document.head.appendChild(style);
    return HD.Broadcast.diagnostics;
  })()`);
  console.log(JSON.stringify({ result, errors }));
  if (!result.replaying || errors.length) throw Error("Replay browser verification failed");
  await fs.mkdir("artifacts", { recursive: true });
  const screenshot = await call("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  await fs.writeFile("artifacts/broadcast-review.jpg", Buffer.from(screenshot.data, "base64"));
  await evaluate(`(() => {
    const bay = HD.world.scene.getObjectByName("Reserved seating camera bay 0");
    const camera = HD.world.camera;
    const outward = new THREE.Vector3(0,0,1).applyQuaternion(bay.quaternion);
    camera.position.copy(bay.position).addScaledVector(outward,18);
    camera.position.y += 10;
    camera.lookAt(bay.position.clone().add(new THREE.Vector3(0,2,0)));
    HD.world.renderer.render(HD.world.scene,camera);
  })()`);
  const bayShot = await call("Page.captureScreenshot", {format:"jpeg", quality:85});
  await fs.writeFile("artifacts/camera-bay-review.jpg", Buffer.from(bayShot.data,"base64"));
} finally {
  socket.close();
  await fetch(endpoint + "/json/close/" + tab.id);
}
