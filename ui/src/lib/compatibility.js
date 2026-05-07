import { keyToCamelot, isCamelotCompatible } from './camelot.js';
import { cosineDistance } from './embeddings.js';

export function bpmCompatible(a, b, tolerance = 0.06) {
  if (!a || !b) return false;
  const ratio = Math.abs(a - b) / a;
  return ratio <= tolerance;
}

// Phase 1 fallback: BPM difference.
function bpmDiffScore(active, candidate) {
  if (active.bpm == null || candidate.bpm == null) return Infinity;
  return Math.abs(active.bpm - candidate.bpm);
}

// Phase 2: pure cosine distance on embeddings.
function embeddingScore(active, candidate, embeddings) {
  const ea = embeddings.get(active.id);
  const ec = embeddings.get(candidate.id);
  if (!ea || !ec) return null;
  return cosineDistance(ea, ec); // [0,1]
}

export function softScore(active, candidate, embeddings) {
  if (embeddings && embeddings.size > 0) {
    const s = embeddingScore(active, candidate, embeddings);
    if (s != null) return s;
  }
  return bpmDiffScore(active, candidate);
}

export function getCompatibleTracks(active, allTracks, opts = {}) {
  const { bpmFilter = true, keyFilter = true, topN = 20, embeddings = null } = opts;
  if (!active) return [];

  const activeCamelot = keyToCamelot(active.key);

  const filtered = [];
  for (const t of allTracks) {
    if (t.id === active.id) continue;

    if (bpmFilter) {
      if (t.bpm == null || active.bpm == null) continue;
      if (!bpmCompatible(active.bpm, t.bpm)) continue;
    }

    if (keyFilter) {
      const candCamelot = keyToCamelot(t.key);
      if (!activeCamelot || !candCamelot) continue;
      if (!isCamelotCompatible(activeCamelot, candCamelot)) continue;
    }

    filtered.push({ track: t, distance: softScore(active, t, embeddings) });
  }

  filtered.sort((a, b) => a.distance - b.distance);
  const top = filtered.slice(0, topN);

  // Per-result `distance` is the raw score (cosine distance for embeddings,
  // BPM diff in BPM units otherwise). `score` is normalised to [0,1] across
  // the kept set for radial layout in the scatter.
  const finite = top.map(x => x.distance).filter(Number.isFinite);
  const max = finite.length ? Math.max(...finite) : 0;
  return top.map(({ track, distance }) => ({
    track,
    distance,
    score: max > 0 && Number.isFinite(distance) ? distance / max : (Number.isFinite(distance) ? 0 : 1),
  }));
}
