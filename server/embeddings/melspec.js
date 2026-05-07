const FFT = require('fft.js');

// Parameters chosen to match Essentia's TensorflowPredictEffnetDiscogs preprocessing:
//   sample_rate=16000, frame_size=512, hop_size=256, mel_bands=96,
//   warping=htk, fmin=0, fmax=8000, log magnitude (natural log).
// Patch level: 128 frames per patch with patch hop 64 (50% overlap).
// If embeddings look wrong, double-check these against Essentia source.

const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const N_MELS = 96;
const FMIN = 0;
const FMAX = 8000;
const PATCH_FRAMES = 128;
const PATCH_HOP = 64;
const SAMPLE_RATE = 16000;

function hzToMelHtk(f) {
  return 2595 * Math.log10(1 + f / 700);
}
function melToHzHtk(m) {
  return 700 * (Math.pow(10, m / 2595) - 1);
}

function hannWindow(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function buildMelFilterbank(numBins, sampleRate, nMels, fmin, fmax) {
  const melMin = hzToMelHtk(fmin);
  const melMax = hzToMelHtk(fmax);
  const points = new Float64Array(nMels + 2);
  for (let i = 0; i < points.length; i++) {
    points[i] = melMin + ((melMax - melMin) * i) / (nMels + 1);
  }
  const hzPoints = Array.from(points).map(melToHzHtk);
  const frameSize = (numBins - 1) * 2;
  const binPoints = hzPoints.map(hz => (hz * frameSize) / sampleRate);

  const filterbank = [];
  for (let m = 1; m <= nMels; m++) {
    const left = binPoints[m - 1];
    const center = binPoints[m];
    const right = binPoints[m + 1];
    const filt = new Float32Array(numBins);
    for (let k = 0; k < numBins; k++) {
      if (k < left || k > right) continue;
      if (k <= center) {
        filt[k] = (k - left) / (center - left || 1);
      } else {
        filt[k] = (right - k) / (right - center || 1);
      }
    }
    filterbank.push(filt);
  }
  return filterbank;
}

const fft = new FFT(FRAME_SIZE);
const window = hannWindow(FRAME_SIZE);
const numBins = FRAME_SIZE / 2 + 1;
const melFB = buildMelFilterbank(numBins, SAMPLE_RATE, N_MELS, FMIN, FMAX);

// Compute log-mel spectrogram. Returns { data: Float32Array, numFrames, nMels }.
// Layout: data[frame * nMels + mel].
function logMelSpectrogram(samples) {
  if (samples.length < FRAME_SIZE) {
    return { data: new Float32Array(0), numFrames: 0, nMels: N_MELS };
  }
  const numFrames = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE) + 1;
  const out = new Float32Array(numFrames * N_MELS);

  const frameBuf = new Array(FRAME_SIZE);
  const fftOut = fft.createComplexArray();

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_SIZE;
    for (let i = 0; i < FRAME_SIZE; i++) {
      frameBuf[i] = samples[start + i] * window[i];
    }
    fft.realTransform(fftOut, frameBuf);

    // Magnitude spectrum (only first half + Nyquist).
    for (let m = 0; m < N_MELS; m++) {
      const filt = melFB[m];
      let sum = 0;
      for (let k = 0; k < numBins; k++) {
        const re = fftOut[2 * k];
        const im = fftOut[2 * k + 1];
        const mag = Math.sqrt(re * re + im * im);
        sum += mag * filt[k];
      }
      out[f * N_MELS + m] = Math.log(Math.max(sum, 1e-30));
    }
  }

  return { data: out, numFrames, nMels: N_MELS };
}

// Cut the spectrogram into overlapping patches of PATCH_FRAMES x N_MELS.
// Returns an array of Float32Array, each of length PATCH_FRAMES * N_MELS.
function toPatches(spec) {
  const { data, numFrames, nMels } = spec;
  if (numFrames < PATCH_FRAMES) return [];
  const patches = [];
  for (let start = 0; start + PATCH_FRAMES <= numFrames; start += PATCH_HOP) {
    const patch = new Float32Array(PATCH_FRAMES * nMels);
    for (let i = 0; i < PATCH_FRAMES; i++) {
      const srcOff = (start + i) * nMels;
      const dstOff = i * nMels;
      for (let m = 0; m < nMels; m++) patch[dstOff + m] = data[srcOff + m];
    }
    patches.push(patch);
  }
  return patches;
}

module.exports = {
  logMelSpectrogram,
  toPatches,
  PATCH_FRAMES,
  N_MELS,
  SAMPLE_RATE,
};
