// Rekordbox key string -> Camelot code.
// Includes both sharp and flat spellings since Rekordbox is inconsistent.
const KEY_TO_CAMELOT = {
  // Major keys (B side)
  'B': '1B', 'Cb': '1B',
  'F#': '2B', 'Gb': '2B',
  'Db': '3B', 'C#': '3B',
  'Ab': '4B', 'G#': '4B',
  'Eb': '5B', 'D#': '5B',
  'Bb': '6B', 'A#': '6B',
  'F': '7B',
  'C': '8B',
  'G': '9B',
  'D': '10B',
  'A': '11B',
  'E': '12B',

  // Minor keys (A side)
  'Abm': '1A', 'G#m': '1A',
  'Ebm': '2A', 'D#m': '2A',
  'Bbm': '3A', 'A#m': '3A',
  'Fm': '4A',
  'Cm': '5A',
  'Gm': '6A',
  'Dm': '7A',
  'Am': '8A',
  'Em': '9A',
  'Bm': '10A',
  'F#m': '11A', 'Gbm': '11A',
  'Dbm': '12A', 'C#m': '12A',
};

export function keyToCamelot(keyName) {
  if (!keyName) return null;
  return KEY_TO_CAMELOT[keyName.trim()] || null;
}

function parseCamelot(code) {
  if (!code) return null;
  const m = /^(\d{1,2})([AB])$/.exec(code);
  if (!m) return null;
  const num = parseInt(m[1], 10);
  if (num < 1 || num > 12) return null;
  return { num, letter: m[2] };
}

export function isCamelotCompatible(a, b) {
  const pa = parseCamelot(a);
  const pb = parseCamelot(b);
  if (!pa || !pb) return false;
  if (pa.num === pb.num && pa.letter === pb.letter) return true;
  // ±1 on number, same letter (wraps 1↔12)
  if (pa.letter === pb.letter) {
    const diff = Math.abs(pa.num - pb.num);
    if (diff === 1 || diff === 11) return true;
  }
  // Same number, opposite letter (relative major/minor)
  if (pa.num === pb.num && pa.letter !== pb.letter) return true;
  return false;
}
