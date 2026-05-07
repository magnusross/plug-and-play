# Compatibility Explorer — Implementation Plan

A new view in the app for exploring track compatibility from a selected "active" song, with hard filters (BPM, Camelot key) and a soft visual score (scatter around the active track). Split into two phases: UI first with a BPM-difference proxy score, then real audio embeddings.

## Phase 1 — UI with BPM-diff proxy

### 1.1 Backend: extend PDB read with the fields we need

In [server/index.js:65-71](server/index.js#L65-L71), the track mapper currently pulls `id`, `title`, `artist`, `dateAdded`, `filePath`. Extend it to include:

- `bpm`: from `r.tempo / 100` (Rekordbox stores BPM × 100 as integer)
- `keyId`: from `r.keyId`
- `key`: human-readable key name, looked up via a new `keysMap` (build the same way as `artistsMap`, but from the `KEYS` page table — `RekordboxPdb.PageType.KEYS` or type 4)

No new endpoints needed — `/api/tracks` keeps returning everything client-side, since DJ libraries are small enough.

**Risk to flag:** some tracks won't have keys/BPM analyzed in Rekordbox. Treat null/0 as "unknown" — those tracks get excluded when the corresponding hard filter is on, included when it's off.

### 1.2 New module: `ui/src/lib/camelot.js`

A small, dep-free module:

- `keyToCamelot(keyName)` — lookup table mapping Rekordbox key strings ("Cm", "F#", "Ab", etc.) to Camelot codes ("8A", "2B", ...). 24 entries.
- `isCamelotCompatible(a, b)` — true if same code, ±1 on the number with same letter, or same number with opposite letter.

The 24-entry table is the only thing that needs care; everything else is trivial arithmetic on the Camelot number/letter.

### 1.3 New module: `ui/src/lib/compatibility.js`

Pure functions:

- `bpmCompatible(a, b, tolerance = 0.06)` — within ±6% (skip halftime/doubletime for now, add later if useful).
- `softScore(active, candidate)` — Phase 1: `Math.abs(active.bpm - candidate.bpm)`. Designed to be swapped in Phase 2 without touching callers.
- `getCompatibleTracks(active, allTracks, { bpmFilter, keyFilter, topN = 100 })` — returns `[{ track, score }]` sorted by score, normalized to [0, 1].

### 1.4 Restructure App.jsx into a shell + two views

[ui/src/App.jsx](ui/src/App.jsx) is currently a single component doing both library and player. To keep things clean:

- `ui/src/App.jsx` — shell with view toggle (top-level state: `view: 'library' | 'explore'`), holds shared playback state (`currentTrack`, audio ref, `handlePlay`, etc.) and renders the audio element + player bar at the bottom regardless of view.
- `ui/src/views/Library.jsx` — current track-list/playlist UI, lifted out as-is, receives `onPlay` and `currentTrack` as props.
- `ui/src/views/Explore.jsx` — new view, described below.

No router needed; just a button group at the top.

### 1.5 Explore view

State (local to `Explore.jsx`):

- `activeTrack` — selected via search, becomes the playing track when chosen
- `nextTrack` — defaults to highest-scoring compatible track; updated on user click
- `bpmFilterEnabled`, `keyFilterEnabled` — both default true

Layout:

- Top: a search input that picks `activeTrack` (autocomplete dropdown showing title + artist + BPM + key)
- Filter toggles for BPM and key
- Center: scatter visualization
- The shared player bar at the bottom keeps showing whatever is playing

When `activeTrack` is set: call `handlePlay(activeTrack)` so it actually starts. When `onEnded` fires, promote `nextTrack` → `activeTrack`, recompute scatter, auto-pick new `nextTrack`.

### 1.6 Scatter visualization: `ui/src/components/CompatibilityScatter.jsx`

SVG-based (easier click handling, fine for ≤200 dots):

- Active track: dot at center (e.g., 0,0 in a viewBox centered on origin)
- Each compatible track: positioned by (radius, angle) where:
  - **radius** = `score * maxRadius` (closer = more compatible)
  - **angle** = deterministic hash of track ID → [0, 2π), so layout is stable across renders
- Solid line from center to `nextTrack`'s dot (SVG `<line>`, redrawn when `nextTrack` changes)
- Hover: tooltip with title/artist/BPM/key
- Click: `setNextTrack(track)`

**Overlap handling:** for Phase 1, accept it. If it gets bad in practice, add a tiny d3-force simulation (one-time when filters change) to push overlapping dots apart while preserving radial distance — but only if it's actually a problem. Don't pre-optimize.

### 1.7 Playback integration

Lift `currentTrack`, `audioRef`, `handlePlay`, `handleNext`, `handlePrev` from [ui/src/App.jsx:11-113](ui/src/App.jsx#L11-L113) into the App shell. The Explore view's "next track" replaces `handleNext`'s playlist-walking logic when the view is Explore — pass a `getNext` function down, so `onEnded` consults the explore view's `nextTrack` rather than the playlist sequence.

Concretely: `onEnded` calls a parent `handleEnded` which either uses `getNext()` (Explore mode) or walks the filtered playlist (Library mode).

---

## Phase 2 — Replace BPM proxy with Discogs-EffNet embeddings

This phase is purely backend + a small frontend progress UI. The compatibility scoring function gets swapped, nothing else in the UI changes.

### 2.1 New deps

- `onnxruntime-node` — ONNX inference
- `ffmpeg-static` + `fluent-ffmpeg` — decode tracks to PCM
- A mel-spectrogram lib, or hand-rolled from FFT (Meyda has it but is browser-oriented; might be simpler to write a small Node-side mel using a basic FFT lib like `fft.js`)

### 2.2 Model fetch

A small `scripts/fetch-model.js` that downloads the Discogs-EffNet ONNX (dynamic batch variant) from Essentia on first run, into `server/models/`. Don't bundle it in git.

### 2.3 New module: `server/embeddings/`

- `extract.js` — given an audio file path, decode a representative slice (e.g., 30s starting at 30% into the track) to mono 16kHz PCM.
- `melspec.js` — compute log-mel spectrogram with the exact parameters Essentia used during training (need to read from the model's algorithm description page; if these don't match, embeddings are garbage).
- `model.js` — load ONNX session once, expose `embed(melSpec) → Float32Array`.
- `cache.js` — store embeddings keyed by track ID in a sidecar file (`<volume>/.plug-and-play-embeddings.json` or a binary format). Resumable: skip tracks already in the cache.
- `indexer.js` — orchestrator: iterates uncached tracks, processes one at a time (or small batches), emits progress events.

### 2.4 New endpoints

- `GET /api/embeddings/status` — `{ total, completed, inProgress }`
- `POST /api/embeddings/start` — kick off indexing in a background worker
- Once complete, `/api/tracks` includes an `embedding` field per track (or a separate `/api/embeddings` endpoint to keep `/api/tracks` lean — since embeddings are ~200-512 floats × N tracks, this could be sizeable; binary endpoint is friendlier).

### 2.5 Frontend changes

- A small "Index library" banner in the Explore view showing progress when embeddings aren't ready yet.
- When embeddings are loaded, replace `softScore` in `compatibility.js` with cosine distance on embedding vectors. Optionally blend: `0.7 * cosine + 0.3 * normalized_bpm_diff`.
- Everything else (scatter, click-to-set-next, etc.) is untouched.

### 2.6 Risks / things to verify before committing to Phase 2

- **Mel parameter match**: confirm exact sample rate, n_fft, hop length, n_mels, fmin/fmax from Essentia's Discogs-EffNet algorithm page. If the model expects framewise inference with specific overlapping windows, that needs to match too.
- **Indexing time**: 1k tracks × ~100ms ≈ 2 min on first scan; 10k tracks ≈ 17 min. UI must be clear about the one-time cost.
- **Cache invalidation**: key by `trackId + filePath` (or a hash of file mtime); if the user modifies the USB, stale embeddings should be detected.
- **Bundle size**: ffmpeg-static + onnxruntime-node + the model itself adds ~80–100MB to the install. Worth knowing for a "plug and play" tool.

---

## Suggested order

1. Phase 1.1 — backend tempo/key parsing (small, unblocks everything)
2. Phase 1.2 + 1.3 — pure-logic modules with unit-testability
3. Phase 1.4 — restructure App.jsx (mechanical refactor, no behavior change)
4. Phase 1.5 + 1.6 + 1.7 — new view, scatter, playback wiring
5. Ship Phase 1, use it for a while, see if the proxy score is good enough to validate the UX before investing in Phase 2
6. Phase 2 — embeddings, in the order: model fetch → extract → melspec → model inference → cache → indexer → endpoints → frontend wiring

The Phase 1 → "use it" → Phase 2 gap is important: the scatter UI's value is mostly orthogonal to the score quality, and you'll have learned a lot about what "compatible" means to you before sinking the effort into Phase 2.
