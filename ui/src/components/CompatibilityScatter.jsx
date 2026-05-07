import { useState } from 'react';
import { keyToCamelot } from '../lib/camelot.js';

const SIZE = 500;
const HALF = SIZE / 2;
const MIN_R = 35;
const MAX_R = 220;

function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function position(track, score) {
  const angle = hashId(track.id) * Math.PI * 2;
  const radius = MIN_R + score * (MAX_R - MIN_R);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function CompatibilityScatter({ active, compatible, nextTrack, onPickNext }) {
  const [hover, setHover] = useState(null);

  const points = compatible.map(({ track, score, distance }) => ({
    track,
    score,
    distance,
    ...position(track, score),
  }));

  const nextPoint = nextTrack ? points.find(p => p.track.id === nextTrack.id) : null;

  return (
    <div className="scatter-container">
      <svg
        viewBox={`${-HALF} ${-HALF} ${SIZE} ${SIZE}`}
        className="scatter-svg"
      >
        {/* Concentric guide rings */}
        {[0.33, 0.66, 1].map(f => (
          <circle
            key={f}
            cx={0}
            cy={0}
            r={MIN_R + f * (MAX_R - MIN_R)}
            fill="none"
            stroke="#eee"
            strokeWidth={1}
          />
        ))}

        {/* Line from active to next */}
        {nextPoint && (
          <line
            x1={0}
            y1={0}
            x2={nextPoint.x}
            y2={nextPoint.y}
            stroke="#000"
            strokeWidth={2}
          />
        )}

        {/* Compatible track dots */}
        {points.map(p => {
          const isNext = nextTrack && p.track.id === nextTrack.id;
          return (
            <circle
              key={p.track.id}
              cx={p.x}
              cy={p.y}
              r={isNext ? 9 : 6}
              fill={isNext ? '#000' : '#666'}
              stroke="#000"
              strokeWidth={isNext ? 2 : 0}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPickNext(p.track)}
            />
          );
        })}

        {/* Active track dot at center */}
        <circle
          cx={0}
          cy={0}
          r={12}
          fill="#fff"
          stroke="#000"
          strokeWidth={2}
        />
      </svg>

      {hover && (
        <div className="scatter-tooltip">
          <div><strong>{hover.track.title}</strong></div>
          <div>{hover.track.artist}</div>
          <div className="muted">
            {hover.track.bpm ? `${hover.track.bpm.toFixed(1)} BPM` : 'no BPM'}
            {' · '}
            {keyToCamelot(hover.track.key) || hover.track.key || 'no key'}
          </div>
          <div className="muted">
            distance: {Number.isFinite(hover.distance) ? hover.distance.toFixed(4) : '—'}
          </div>
        </div>
      )}

      {compatible.length === 0 && (
        <div className="scatter-empty">No compatible tracks under the current filters.</div>
      )}
    </div>
  );
}

export default CompatibilityScatter;
