const fs = require('fs');
const path = require('path');

const FILE_NAME = '.plug-and-play-embeddings.bin';
const MAGIC = Buffer.from('PNPE', 'utf8');
const VERSION = 1;
const HEADER_SIZE = 16; // magic(4) + version(4) + dim(4) + reserved(4)
const RECORD_PREFIX = 8; // trackId(4) + mtime(4)

function cachePath(volumePath) {
  return path.join(volumePath, FILE_NAME);
}

function readHeader(fd) {
  const buf = Buffer.alloc(HEADER_SIZE);
  const bytes = fs.readSync(fd, buf, 0, HEADER_SIZE, 0);
  if (bytes < HEADER_SIZE) return null;
  if (!buf.slice(0, 4).equals(MAGIC)) return null;
  const version = buf.readUInt32LE(4);
  const dim = buf.readUInt32LE(8);
  return { version, dim };
}

function writeHeader(fd, dim) {
  const buf = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(buf, 0);
  buf.writeUInt32LE(VERSION, 4);
  buf.writeUInt32LE(dim, 8);
  buf.writeUInt32LE(0, 12);
  fs.writeSync(fd, buf, 0, HEADER_SIZE, 0);
}

// Load cache. Returns Map<trackId, { mtime, embedding: Float32Array }>.
// Returns empty map if file doesn't exist or is invalid for the given dim.
function loadCache(volumePath, expectedDim) {
  const p = cachePath(volumePath);
  if (!fs.existsSync(p)) return new Map();
  const fd = fs.openSync(p, 'r');
  try {
    const header = readHeader(fd);
    if (!header) {
      console.warn(`[cache] bad header in ${p}, ignoring`);
      return new Map();
    }
    if (expectedDim != null && header.dim !== expectedDim) {
      console.warn(`[cache] dim mismatch (file=${header.dim}, expected=${expectedDim}); discarding cache`);
      return new Map();
    }
    const dim = header.dim;
    const recordSize = RECORD_PREFIX + dim * 4;
    const stat = fs.fstatSync(fd);
    const dataBytes = stat.size - HEADER_SIZE;
    const numRecords = Math.floor(dataBytes / recordSize);
    const out = new Map();
    const recBuf = Buffer.alloc(recordSize);
    for (let i = 0; i < numRecords; i++) {
      fs.readSync(fd, recBuf, 0, recordSize, HEADER_SIZE + i * recordSize);
      const trackId = recBuf.readUInt32LE(0);
      const mtime = recBuf.readUInt32LE(4);
      const embedding = new Float32Array(dim);
      for (let j = 0; j < dim; j++) embedding[j] = recBuf.readFloatLE(RECORD_PREFIX + j * 4);
      out.set(trackId, { mtime, embedding });
    }
    return out;
  } finally {
    fs.closeSync(fd);
  }
}

// Append a single track embedding to the cache. Creates the file if needed.
function appendRecord(volumePath, trackId, mtime, embedding) {
  const p = cachePath(volumePath);
  const dim = embedding.length;
  const recordSize = RECORD_PREFIX + dim * 4;

  let fd;
  if (!fs.existsSync(p)) {
    fd = fs.openSync(p, 'w+');
    writeHeader(fd, dim);
  } else {
    fd = fs.openSync(p, 'r+');
    const header = readHeader(fd);
    if (!header || header.dim !== dim) {
      fs.closeSync(fd);
      // Rewrite from scratch (this drops existing entries).
      fd = fs.openSync(p, 'w+');
      writeHeader(fd, dim);
    }
  }

  try {
    const buf = Buffer.alloc(recordSize);
    buf.writeUInt32LE(trackId >>> 0, 0);
    buf.writeUInt32LE(mtime >>> 0, 4);
    for (let i = 0; i < dim; i++) buf.writeFloatLE(embedding[i], RECORD_PREFIX + i * 4);
    fs.writeSync(fd, buf, 0, recordSize, fs.fstatSync(fd).size);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Build a packed binary blob to ship to the client:
//   uint32 dim, uint32 count,
//   then `count` records of: uint32 trackId, dim float32.
function packForClient(cache) {
  if (cache.size === 0) {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(0, 4);
    return buf;
  }
  const first = cache.values().next().value;
  const dim = first.embedding.length;
  const recordSize = 4 + dim * 4;
  const buf = Buffer.alloc(8 + cache.size * recordSize);
  buf.writeUInt32LE(dim, 0);
  buf.writeUInt32LE(cache.size, 4);
  let off = 8;
  for (const [trackId, { embedding }] of cache) {
    buf.writeUInt32LE(trackId >>> 0, off);
    off += 4;
    for (let i = 0; i < dim; i++) {
      buf.writeFloatLE(embedding[i], off + i * 4);
    }
    off += dim * 4;
  }
  return buf;
}

module.exports = { loadCache, appendRecord, packForClient, cachePath };
