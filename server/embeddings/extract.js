const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const SAMPLE_RATE = 16000;

function decodeSliceAt(filePath, startSeconds, durationSeconds) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(startSeconds),
      '-t', String(durationSeconds),
      '-i', filePath,
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      'pipe:1'
    ];
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', c => chunks.push(c));
    proc.stderr.on('data', c => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg exit ${code}: ${stderr.trim()}`));
      const buf = Buffer.concat(chunks);
      const samples = new Float32Array(buf.length / 2);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readInt16LE(i * 2) / 32768;
      }
      resolve(samples);
    });
  });
}

// Decode a representative slice of the track to mono float32 PCM at 16 kHz.
// Tries 60s in first to skip intros; falls back to start if track is too short.
async function extractSlice(filePath, durationSeconds = 30) {
  let samples = await decodeSliceAt(filePath, 60, durationSeconds);
  if (samples.length < SAMPLE_RATE * 5) {
    samples = await decodeSliceAt(filePath, 0, durationSeconds);
  }
  return { samples, sampleRate: SAMPLE_RATE };
}

module.exports = { extractSlice, SAMPLE_RATE };
