import { keyToCamelot, isCamelotCompatible } from './camelot.js';

export function bpmCompatible(a, b, tolerance = 0.06) {
  if (!a || !b) return false;
  const ratio = Math.abs(a - b) / a;
  return ratio <= tolerance;
}

export function softScore(active, candidate) {
  if (active.bpm == null || candidate.bpm == null) return Infinity;
  return Math.abs(active.bpm - candidate.bpm);
}

export function getCompatibleTracks(active, allTracks, opts = {}) {
  const { bpmFilter = true, keyFilter = true, topN = 100 } = opts;
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

    filtered.push({ track: t, score: softScore(active, t) });
  }

  filtered.sort((a, b) => a.score - b.score);
  const top = filtered.slice(0, topN);

  // Normalize raw scores to [0,1] (0 = best, 1 = worst within set).
  const scores = top.map(x => x.score).filter(s => Number.isFinite(s));
  const max = scores.length ? Math.max(...scores) : 0;
  return top.map(({ track, score }) => ({
    track,
    score: max > 0 && Number.isFinite(score) ? score / max : (Number.isFinite(score) ? 0 : 1),
  }));
}
