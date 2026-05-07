const fs = require('fs');
const path = require('path');
const { extractSlice } = require('./extract.js');
const { logMelSpectrogram, toPatches } = require('./melspec.js');
const { embedPatches, loadSession, getEmbeddingDim } = require('./model.js');
const { loadCache, appendRecord } = require('./cache.js');

const state = {
  running: false,
  cancelRequested: false,
  total: 0,
  completed: 0,
  failed: 0,
  inProgress: null,
  lastError: null,
  cache: new Map(),
  volumePath: null,
};

async function processOne(track, volumePath) {
  const filePath = path.join(volumePath, track.filePath);
  if (!fs.existsSync(filePath)) throw new Error(`audio missing: ${filePath}`);
  const stat = fs.statSync(filePath);
  const mtime = Math.floor(stat.mtimeMs / 1000);

  const { samples } = await extractSlice(filePath);
  if (samples.length < 16000) throw new Error('too little audio decoded');

  const spec = logMelSpectrogram(samples);
  const patches = toPatches(spec);
  if (!patches.length) throw new Error('not enough frames for one patch');

  const embedding = await embedPatches(patches);
  if (!embedding) throw new Error('embedder returned null');

  appendRecord(volumePath, track.id, mtime, embedding);
  state.cache.set(track.id, { mtime, embedding });
}

async function indexAll(tracks, volumePath) {
  if (state.running) {
    return { ok: false, reason: 'already running' };
  }
  state.running = true;
  state.cancelRequested = false;
  state.failed = 0;
  state.lastError = null;
  state.volumePath = volumePath;

  try {
    await loadSession();
    const dim = getEmbeddingDim();
    state.cache = loadCache(volumePath, dim);

    const todo = tracks.filter(t => t.filePath && !state.cache.has(t.id));
    state.total = todo.length;
    state.completed = 0;

    for (const t of todo) {
      if (state.cancelRequested) break;
      state.inProgress = { id: t.id, title: t.title, artist: t.artist };
      try {
        await processOne(t, volumePath);
        state.completed++;
      } catch (e) {
        state.failed++;
        state.lastError = `${t.title}: ${e.message}`;
        console.warn(`[indexer] failed ${t.id} ${t.title}: ${e.message}`);
      }
    }
  } catch (e) {
    state.lastError = e.message;
    console.error('[indexer] fatal:', e);
  } finally {
    state.inProgress = null;
    state.running = false;
  }
  return { ok: true };
}

function getStatus() {
  return {
    running: state.running,
    total: state.total,
    completed: state.completed,
    failed: state.failed,
    inProgress: state.inProgress,
    lastError: state.lastError,
    cached: state.cache.size,
  };
}

function getCache() {
  return state.cache;
}

function primeCacheFromDisk(volumePath) {
  state.volumePath = volumePath;
  // Try to load with whatever dim is in the file (pass null = accept any).
  state.cache = loadCache(volumePath, null);
  return state.cache;
}

function cancel() {
  if (state.running) state.cancelRequested = true;
}

module.exports = { indexAll, getStatus, getCache, primeCacheFromDisk, cancel };
