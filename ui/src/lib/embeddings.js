// Fetch the binary embeddings blob from the server and decode into a
// Map<trackId, Float32Array>.
export async function fetchEmbeddings(baseUrl = 'http://localhost:4000') {
  const res = await fetch(`${baseUrl}/api/embeddings`);
  if (!res.ok) throw new Error(`embeddings fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  const view = new DataView(ab);
  if (ab.byteLength < 8) return { dim: 0, map: new Map() };
  const dim = view.getUint32(0, true);
  const count = view.getUint32(4, true);
  const map = new Map();
  let off = 8;
  const recordSize = 4 + dim * 4;
  for (let i = 0; i < count; i++) {
    const id = view.getUint32(off, true);
    off += 4;
    const emb = new Float32Array(dim);
    for (let k = 0; k < dim; k++) emb[k] = view.getFloat32(off + k * 4, true);
    off += dim * 4;
    map.set(id, emb);
  }
  return { dim, map };
}

export async function fetchStatus(baseUrl = 'http://localhost:4000') {
  const res = await fetch(`${baseUrl}/api/embeddings/status`);
  if (!res.ok) throw new Error(`status fetch failed: ${res.status}`);
  return res.json();
}

export async function startIndexing(baseUrl = 'http://localhost:4000') {
  const res = await fetch(`${baseUrl}/api/embeddings/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
  return res.json();
}

export async function cancelIndexing(baseUrl = 'http://localhost:4000') {
  const res = await fetch(`${baseUrl}/api/embeddings/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
  return res.json();
}

// Cosine similarity for two L2-normalized vectors == dot product.
// Server already L2-normalizes; we still normalize defensively here.
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

// Distance in [0, 1]: 0 = identical direction, 1 = opposite.
export function cosineDistance(a, b) {
  return (1 - cosineSimilarity(a, b)) / 2;
}
