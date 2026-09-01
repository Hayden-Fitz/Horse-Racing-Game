import { KokoroTTS } from "../vendor/kokoro.web.js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "am_fenrir";

let engine = null;
let generationQueue = Promise.resolve();

initialize();

self.addEventListener("message", (event) => {
  if (event.data?.type !== "speak") return;

  generationQueue = generationQueue
    .then(() => generateLine(event.data))
    .catch((error) => {
      self.postMessage({
        type: "speech-error",
        id: event.data.id,
        message: error?.message || String(error),
      });
    });
});

async function initialize() {
  try {
    engine = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: "q4",
      device: "wasm",
    });
    self.postMessage({ type: "ready", voice: VOICE });
  } catch (error) {
    self.postMessage({
      type: "load-error",
      message: error?.message || String(error),
    });
  }
}

async function generateLine(request) {
  if (!engine) throw new Error("The commentator model is not ready.");

  const output = await engine.generate(request.text, {
    voice: VOICE,
    speed: request.urgent ? 1.13 : 1.06,
  });
  const samples = output.audio.slice();

  self.postMessage(
    {
      type: "speech",
      id: request.id,
      samples: samples.buffer,
      sampleRate: output.sampling_rate,
    },
    [samples.buffer],
  );
}
