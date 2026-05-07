#!/usr/bin/env node
// Downloads the Discogs-EffNet ONNX model into server/models/.
// The dynamic-batch variant from Essentia.

const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_URL = process.env.DISCOGS_EFFNET_URL ||
  'https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bsdynamic-1.onnx';

const MODEL_DIR = path.join(__dirname, '..', 'server', 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'discogs-effnet.onnx');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return resolve(download(res.headers.location, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      let lastReport = 0;

      res.on('data', (chunk) => {
        received += chunk.length;
        const now = Date.now();
        if (now - lastReport > 500) {
          const mb = (received / 1024 / 1024).toFixed(1);
          const totalMb = total ? (total / 1024 / 1024).toFixed(1) : '?';
          const pct = total ? ` (${((received / total) * 100).toFixed(1)}%)` : '';
          process.stdout.write(`\r  ${mb}/${totalMb} MB${pct}`);
          lastReport = now;
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        process.stdout.write('\n');
        file.close(() => resolve());
      });
    });
    req.on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function main() {
  if (!fs.existsSync(MODEL_DIR)) fs.mkdirSync(MODEL_DIR, { recursive: true });

  if (fs.existsSync(MODEL_PATH)) {
    const stat = fs.statSync(MODEL_PATH);
    if (stat.size > 1_000_000) {
      console.log(`Model already present at ${MODEL_PATH} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      return;
    }
    console.log('Stale model found, re-downloading.');
    fs.unlinkSync(MODEL_PATH);
  }

  console.log(`Downloading Discogs-EffNet ONNX from ${MODEL_URL}`);
  console.log(`-> ${MODEL_PATH}`);
  await download(MODEL_URL, MODEL_PATH);
  const size = fs.statSync(MODEL_PATH).size;
  console.log(`Downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Failed to fetch model:', err.message);
    console.error('Set DISCOGS_EFFNET_URL env var to override the source URL.');
    process.exit(1);
  });
}

module.exports = { MODEL_PATH };
