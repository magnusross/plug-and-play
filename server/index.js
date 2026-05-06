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

if (usbInfo) {
  console.log(`Found Rekordbox DB at: ${usbInfo.dbPath}`);
  try {
    const buffer = fs.readFileSync(usbInfo.dbPath);
    const pdb = parsePdb(buffer);
    if (pdb.tables) {
      const tracksTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.TRACKS || t.type === 0);
      const artistsTable = pdb.tables.find(t => t.type === RekordboxPdb.PageType.ARTISTS || t.type === 3);

      const artistsMap = {};
      if (artistsTable) {
        for (const artist of tableRows(artistsTable)) {
           artistsMap[artist.id] = extractStr(artist.name);
        }
      }

      if (tracksTable) {
        tracks = Array.from(tableRows(tracksTable)).map(r => ({
          id: r.id,
          title: extractStr(r.title) || 'Unknown Title',
          artist: artistsMap[r.artistId] || 'Unknown Artist',
          dateAdded: extractStr(r.dateAdded),
          filePath: extractStr(r.filePath)
        }));
        console.log(`Loaded ${tracks.length} tracks from real USB.`);
      } else {
        console.warn('Tracks table not found in PDB.');
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
