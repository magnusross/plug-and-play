import { useState, useEffect, useMemo, useRef } from 'react';
import { getCompatibleTracks } from '../lib/compatibility.js';
import { keyToCamelot } from '../lib/camelot.js';
import {
  fetchEmbeddings,
  fetchStatus,
  startIndexing,
  cancelIndexing,
} from '../lib/embeddings.js';
import CompatibilityScatter from '../components/CompatibilityScatter.jsx';

function Explore({ tracks, currentTrack, onPlay, navRef }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [nextTrack, setNextTrack] = useState(null);
  const [bpmFilterEnabled, setBpmFilterEnabled] = useState(true);
  const [keyFilterEnabled, setKeyFilterEnabled] = useState(true);
  const [embeddings, setEmbeddings] = useState(new Map());
  const [embeddingDim, setEmbeddingDim] = useState(0);
  const [indexStatus, setIndexStatus] = useState(null);
  const searchRef = useRef(null);
  const prevTrackIdRef = useRef(null);
  const lastActiveRef = useRef(null);

  const activeTrack = currentTrack;

  // Remember the track that was active before the current one so we can
  // avoid auto-selecting it as next (prevents A↔B ping-pong).
  useEffect(() => {
    if (lastActiveRef.current && lastActiveRef.current.id !== activeTrack?.id) {
      prevTrackIdRef.current = lastActiveRef.current.id;
    }
    lastActiveRef.current = activeTrack;
  }, [activeTrack]);

  // Initial load + status poll.
  useEffect(() => {
    let alive = true;
    fetchEmbeddings()
      .then(({ map, dim }) => {
        if (!alive) return;
        setEmbeddings(map);
        setEmbeddingDim(dim);
      })
      .catch(err => console.warn('embeddings load failed:', err));
    fetchStatus()
      .then(s => alive && setIndexStatus(s))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // While indexing is running, poll status every 2s and refresh embeddings when done.
  useEffect(() => {
    if (!indexStatus?.running) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const s = await fetchStatus();
        if (!alive) return;
        setIndexStatus(s);
        if (!s.running) {
          const { map, dim } = await fetchEmbeddings();
          if (!alive) return;
          setEmbeddings(map);
          setEmbeddingDim(dim);
        }
      } catch {}
    }, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [indexStatus?.running]);

  const compatible = useMemo(() => {
    if (!activeTrack) return [];
    return getCompatibleTracks(activeTrack, tracks, {
      bpmFilter: bpmFilterEnabled,
      keyFilter: keyFilterEnabled,
      topN: 20,
      embeddings,
    });
  }, [activeTrack, tracks, bpmFilterEnabled, keyFilterEnabled, embeddings]);

  useEffect(() => {
    if (compatible.length === 0) { setNextTrack(null); return; }
    const stillValid = nextTrack && compatible.some(c => c.track.id === nextTrack.id);
    if (!stillValid) {
      const prevId = prevTrackIdRef.current;
      const pick = compatible.find(c => c.track.id !== prevId) || compatible[0];
      setNextTrack(pick.track);
    }
  }, [compatible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    navRef.current = {
      getNext: () => nextTrack,
      getPrev: () => null,
    };
  }, [nextTrack, navRef]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return tracks
      .filter(t =>
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [searchQuery, tracks]);

  const pickActive = (track) => {
    setSearchQuery('');
    setSearchOpen(false);
    onPlay(track);
  };

  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const onStart = async () => {
    try {
      await startIndexing();
      const s = await fetchStatus();
      setIndexStatus(s);
    } catch (e) {
      console.error(e);
    }
  };

  const onCancel = async () => {
    try {
      await cancelIndexing();
    } catch (e) { console.error(e); }
  };

  const cachedCount = embeddings.size;
  const usingEmbeddings = cachedCount > 0;

  return (
    <div className="explore">
      <IndexBanner
        status={indexStatus}
        cached={cachedCount}
        totalTracks={tracks.length}
        onStart={onStart}
        onCancel={onCancel}
      />

      <div className="explore-search" ref={searchRef}>
        <input
          type="text"
          className="search-input"
          placeholder="Pick an active track..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
        />
        {searchOpen && searchResults.length > 0 && (
          <ul className="search-dropdown">
            {searchResults.map(t => (
              <li key={t.id} onClick={() => pickActive(t)}>
                <span className="sr-title">{t.title}</span>
                <span className="sr-artist">{t.artist}</span>
                <span className="sr-meta">
                  {t.bpm ? `${t.bpm.toFixed(1)} BPM` : 'no BPM'} · {keyToCamelot(t.key) || t.key || 'no key'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="explore-filters">
        <label>
          <input
            type="checkbox"
            checked={bpmFilterEnabled}
            onChange={(e) => setBpmFilterEnabled(e.target.checked)}
          />
          BPM filter (±6%)
        </label>
        <label>
          <input
            type="checkbox"
            checked={keyFilterEnabled}
            onChange={(e) => setKeyFilterEnabled(e.target.checked)}
          />
          Key filter (Camelot)
        </label>
        <span className="muted score-mode">
          Score: {usingEmbeddings ? `embeddings (dim ${embeddingDim})` : 'BPM diff (Phase 1)'}
        </span>
      </div>

      {activeTrack ? (
        <>
          <div className="active-info">
            <strong>ACTIVE:</strong> {activeTrack.title} — {activeTrack.artist}
            {' · '}
            {activeTrack.bpm ? `${activeTrack.bpm.toFixed(1)} BPM` : 'no BPM'}
            {' · '}
            {keyToCamelot(activeTrack.key) || activeTrack.key || 'no key'}
            {' · '}
            <span className="muted">{compatible.length} compatible</span>
          </div>

          <CompatibilityScatter
            active={activeTrack}
            compatible={compatible}
            nextTrack={nextTrack}
            onPickNext={setNextTrack}
          />

          {nextTrack && (() => {
            const entry = compatible.find(c => c.track.id === nextTrack.id);
            const dist = entry?.distance;
            return (
              <div className="next-info">
                <strong>NEXT:</strong> {nextTrack.title} — {nextTrack.artist}
                {' · '}
                {nextTrack.bpm ? `${nextTrack.bpm.toFixed(1)} BPM` : 'no BPM'}
                {' · '}
                {keyToCamelot(nextTrack.key) || nextTrack.key || 'no key'}
                {' · '}
                <span className="muted">distance {Number.isFinite(dist) ? dist.toFixed(4) : '—'}</span>
              </div>
            );
          })()}
        </>
      ) : (
        <p className="muted">Pick a track above to start exploring compatibility.</p>
      )}
    </div>
  );
}

function IndexBanner({ status, cached, totalTracks, onStart, onCancel }) {
  if (!status) return null;
  const remaining = totalTracks - cached;
  if (status.running) {
    const pct = status.total > 0
      ? Math.floor((status.completed / status.total) * 100)
      : 0;
    return (
      <div className="index-banner running">
        <div>
          <strong>Indexing library…</strong>{' '}
          {status.completed}/{status.total} ({pct}%)
          {status.failed ? ` · ${status.failed} failed` : ''}
        </div>
        {status.inProgress && (
          <div className="muted">→ {status.inProgress.title} — {status.inProgress.artist}</div>
        )}
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  if (cached === 0) {
    return (
      <div className="index-banner">
        <div>
          <strong>Embeddings not built yet.</strong>{' '}
          <span className="muted">Falling back to BPM-diff scoring. Index your library to get
          audio-based similarity.</span>
        </div>
        <button onClick={onStart}>Index library</button>
      </div>
    );
  }
  if (remaining > 0) {
    return (
      <div className="index-banner">
        <div>
          <strong>{cached}</strong> of {totalTracks} tracks indexed.{' '}
          <span className="muted">{remaining} new track{remaining === 1 ? '' : 's'} not yet embedded.</span>
        </div>
        <button onClick={onStart}>Index missing</button>
      </div>
    );
  }
  return null;
}

export default Explore;
