const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parsePdb, tableRows, RekordboxPdb } = require('rekordbox-parser');

const app = express();
app.use(cors());

function extractStr(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  if (obj.body && obj.body.text) return obj.body.text;
  if (obj.text) return obj.text;
  return '';
}

function findRekordboxDb() {
  // 1. Check local fallback (for testing/development)
  const localDb = path.join(__dirname, '../export.pdb');
  if (fs.existsSync(localDb)) {
    return { volumePath: path.join(__dirname, '..'), dbPath: localDb };
  }
  
  // 2. Scan /Volumes for the actual USB stick
  const volumesDir = '/Volumes';
  try {
    const volumes = fs.readdirSync(volumesDir);
    for (const vol of volumes) {
      const dbPath = path.join(volumesDir, vol, 'PIONEER', 'rekordbox', 'export.pdb');
      if (fs.existsSync(dbPath)) {
        return { volumePath: path.join(volumesDir, vol), dbPath };
      }
    }
  } catch (err) {
    console.error('Error scanning volumes:', err.message);
  }

  return null;
}

const usbInfo = findRekordboxDb();
let tracks = [];
let playlists = [];

if (usbInfo) {
  console.log(`Found Rekordbox DB at: ${usbInfo.dbPath}`);
  try {
    const buffer = fs.readFileSync(usbInfo.dbPath);
    const pdb = parsePdb(buffer);
    if (pdb.tables) {
      const tracksTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.TRACKS || t.type === 0);
      const artistsTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.ARTISTS || t.type === 3);
      const keysTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.KEYS || t.type === 5);
      const playlistTreeTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.PLAYLIST_TREE || t.type === 7);
      const playlistEntriesTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.PLAYLIST_ENTRIES || t.type === 8);

      const artistsMap = {};
      if (artistsTable) {
        for (const artist of tableRows(artistsTable)) {
           artistsMap[artist.id] = extractStr(artist.name);
        }
      }

      const keysMap = {};
      if (keysTable) {
        for (const key of tableRows(keysTable)) {
          keysMap[key.id] = extractStr(key.name);
        }
      }

      if (tracksTable) {
        tracks = Array.from(tableRows(tracksTable)).map(r => {
          const bpm = r.tempo ? r.tempo / 100 : null;
          return {
            id: r.id,
            title: extractStr(r.title) || 'Unknown Title',
            artist: artistsMap[r.artistId] || 'Unknown Artist',
            dateAdded: extractStr(r.dateAdded),
            filePath: extractStr(r.filePath),
            bpm: bpm && bpm > 0 ? bpm : null,
            keyId: r.keyId || null,
            key: keysMap[r.keyId] || null
          };
        });
        console.log(`Loaded ${tracks.length} tracks from real USB.`);
      } else {
        console.warn('Tracks table not found in PDB.');
      }

      if (playlistTreeTable) {
        const nodes = {};
        for (const row of tableRows(playlistTreeTable)) {
          nodes[row.id] = {
            id: row.id,
            parentId: row.parentId,
            sortOrder: row.sortOrder,
            isFolder: !!row.isFolder,
            name: extractStr(row.name) || 'Unnamed',
            trackIds: []
          };
        }

        if (playlistEntriesTable) {
          const entries = Array.from(tableRows(playlistEntriesTable));
          entries.sort((a, b) => a.entryIndex - b.entryIndex);
          for (const entry of entries) {
            const node = nodes[entry.playlistId];
            if (node) node.trackIds.push(entry.trackId);
          }
        }

        const folderPath = (node) => {
          const parts = [];
          let cur = node;
          const seen = new Set();
          while (cur && cur.parentId && nodes[cur.parentId] && !seen.has(cur.id)) {
            seen.add(cur.id);
            const parent = nodes[cur.parentId];
            parts.unshift(parent.name);
            cur = parent;
          }
          return parts.join(' / ');
        };

        playlists = Object.values(nodes)
          .filter(n => !n.isFolder)
          .map(n => {
            const parentPath = folderPath(n);
            return {
              id: n.id,
              name: n.name,
              path: parentPath ? `${parentPath} / ${n.name}` : n.name,
              trackIds: n.trackIds
            };
          })
          .sort((a, b) => a.path.localeCompare(b.path));

        console.log(`Loaded ${playlists.length} playlists.`);
      }
    }
  } catch (e) {
    console.error('Error parsing DB:', e);
  }
}

// Fallback mock data if no DB found
if (tracks.length === 0) {
  console.warn('No Rekordbox USB or local export.pdb found. Providing mock tracks.');
  tracks = [
    { id: 1, title: 'Demo Track 1', artist: 'Cool Artist', dateAdded: Date.now(), filePath: 'demo1.mp3' },
    { id: 2, title: 'Test Audio 2', artist: 'Another Artist', dateAdded: Date.now() - 10000, filePath: 'demo2.mp3' },
    { id: 3, title: 'Minimal House Mix', artist: 'DJ Unknown', dateAdded: Date.now() - 50000, filePath: 'demo3.mp3' }
  ];
}

app.get('/api/tracks', (req, res) => {
  res.json({ tracks });
});

app.get('/api/playlists', (req, res) => {
  res.json({ playlists });
});

app.get('/api/audio', (req, res) => {
  if (!usbInfo) return res.status(404).send('No USB found');
  
  const relPath = req.query.path;
  if (!relPath) return res.status(400).send('Path required');

  const fullPath = path.join(usbInfo.volumePath, relPath);
  
  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send('File not found');
  }
});

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../ui/dist')));

// Catch-all to serve index.html for React Router
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../ui/dist/index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
