const path = require('path');
const fs = require('fs');
const ort = require('onnxruntime-node');
const { PATCH_FRAMES, N_MELS } = require('./melspec.js');

const MODEL_PATH = path.join(__dirname, '..', 'models', 'discogs-effnet.onnx');

let _session = null;
let _inputName = null;
let _inputShape = null;   // raw shape from metadata, e.g. ['batch_size', 128, 96]
let _outputName = null;
let _outputDim = null;

function metaByName(arr, name) {
  return arr.find(m => m.name === name);
}

async function loadSession() {
  if (_session) return _session;
  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error(`Model not found at ${MODEL_PATH}. Run: node scripts/fetch-model.js`);
  }
  _session = await ort.InferenceSession.create(MODEL_PATH);
  _inputName = _session.inputNames[0];
  const inMeta = metaByName(_session.inputMetadata, _inputName);
  _inputShape = inMeta?.shape || null;

  // Pick the embedding output (prefer named "embeddings" or the largest non-classifier).
  const outMetas = _session.outputMetadata;
  let pick = outMetas.find(m => m.name === 'embeddings');
  if (!pick) {
    let best = null;
    for (const m of outMetas) {
      const last = m.shape[m.shape.length - 1];
      if (typeof last !== 'number') continue;
      if (last === 400) continue; // classifier head
      if (!best || last > best.shape[best.shape.length - 1]) best = m;
    }
    pick = best || outMetas[0];
  }
  _outputName = pick.name;
  _outputDim = pick.shape[pick.shape.length - 1];

  console.log(`[embeddings] model loaded. input=${_inputName} ${JSON.stringify(_inputShape)} -> output=${_outputName} dim=${_outputDim}`);
  return _session;
}

// Build the input tensor for a batch of patches.
// Patches are time-major (PATCH_FRAMES * N_MELS).
function makeTensor(patches) {
  const batch = patches.length;
  const flat = new Float32Array(batch * PATCH_FRAMES * N_MELS);
  for (let b = 0; b < batch; b++) flat.set(patches[b], b * PATCH_FRAMES * N_MELS);

  const s = _inputShape || [];
  let dims;
  if (s.length === 3) {
    dims = [batch, PATCH_FRAMES, N_MELS];
  } else if (s.length === 4) {
    // NHWC vs NCHW disambiguation by which static axis is 1.
    if (s[1] === 1) dims = [batch, 1, PATCH_FRAMES, N_MELS];
    else dims = [batch, PATCH_FRAMES, N_MELS, 1];
  } else {
    dims = [batch, PATCH_FRAMES, N_MELS];
  }
  return new ort.Tensor('float32', flat, dims);
}

async function embedPatches(patches) {
  if (!patches.length) return null;
  await loadSession();

  const CHUNK = 32;
  const accum = new Float32Array(_outputDim);
  let count = 0;

  for (let i = 0; i < patches.length; i += CHUNK) {
    const sub = patches.slice(i, i + CHUNK);
    const tensor = makeTensor(sub);
    const result = await _session.run({ [_inputName]: tensor });
    const out = result[_outputName];
    const outData = out.data;
    const dimsOut = out.dims;
    const last = dimsOut[dimsOut.length - 1];
    if (last !== _outputDim) {
      throw new Error(`Unexpected output last dim ${last}, expected ${_outputDim}`);
    }
    const numRows = outData.length / _outputDim;
    for (let r = 0; r < numRows; r++) {
      for (let d = 0; d < _outputDim; d++) accum[d] += outData[r * _outputDim + d];
    }
    count += numRows;
  }

  for (let d = 0; d < _outputDim; d++) accum[d] /= count;

  let norm = 0;
  for (let d = 0; d < _outputDim; d++) norm += accum[d] * accum[d];
  norm = Math.sqrt(norm) || 1;
  for (let d = 0; d < _outputDim; d++) accum[d] /= norm;

  return accum;
}

function getEmbeddingDim() {
  return _outputDim;
}

module.exports = { loadSession, embedPatches, getEmbeddingDim, MODEL_PATH };
