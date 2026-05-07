# plug-and-play

Stream music directly from a Rekordbox-formatted DJ USB on macOS, with audio-similarity mixing suggestions.

## Features

- **Zero config**: detects your Rekordbox USB (`export.pdb`) on launch.
- **Library view**: browse, search, and play tracks; pick a Rekordbox playlist; sort by recent or shuffle.
- **Explore view**: pick an active track and see compatible candidates on a scatter plot — closer to the centre = more compatible. Toggle BPM (±6%) and Camelot key filters; click any dot to set what plays next. When the active track ends, the next track auto-promotes (and the just-played track is skipped from auto-suggestions to avoid ping-pong).
- **Two scoring modes**:
  - *BPM-diff* by default — no setup, ranks by tempo proximity.
  - *Audio embeddings* (optional) — Discogs-EffNet ONNX gives true audio-similarity via cosine distance. Index once; results cache on the USB.
- **System media keys** (⏮/⏯/⏭) via the Media Session API.

## Quick start

```bash
git clone <repo-url> && cd plug-and-play
npm install   # installs server + UI deps and builds the UI
npm start     # starts the server and opens the browser
```

That's it — open <http://localhost:4000> if it doesn't open automatically.

To install globally so you can run `plug-and-play` from anywhere:

```bash
npm install -g .
```

For dev mode with hot reload: `npm run dev`, then open <http://localhost:5173>.

## Audio-similarity scoring (optional)

Out of the box, the Explore view ranks compatible tracks by BPM difference. To get true audio similarity, fetch the Discogs-EffNet ONNX model:

```bash
node scripts/fetch-model.js   # ~17 MB into server/models/
```

Then in the Explore view click **Index library**. Embeddings are written to `<usb>/.plug-and-play-embeddings.bin` (~5 KB/track) and reused on subsequent runs. Indexing is roughly 100 ms/track on Apple Silicon, so a 1k-track library takes ~2 minutes.

## macOS permissions

The first time you run the app, macOS will prompt your terminal/IDE for access to **Removable Volumes** — accept it. If you accidentally denied, reset the prompt:

```bash
tccutil reset SystemPolicyRemovableVolumes com.microsoft.VSCode
# or com.apple.Terminal, com.googlecode.iterm2, etc.
```
