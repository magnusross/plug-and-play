import { useState, useEffect, useMemo, useRef } from 'react';
import { getCompatibleTracks } from '../lib/compatibility.js';
import { keyToCamelot } from '../lib/camelot.js';
import CompatibilityScatter from '../components/CompatibilityScatter.jsx';

function Explore({ tracks, currentTrack, onPlay, navRef }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [nextTrack, setNextTrack] = useState(null);
  const [bpmFilterEnabled, setBpmFilterEnabled] = useState(true);
  const [keyFilterEnabled, setKeyFilterEnabled] = useState(true);
  const searchRef = useRef(null);

  const activeTrack = currentTrack;

  const compatible = useMemo(() => {
    if (!activeTrack) return [];
    return getCompatibleTracks(activeTrack, tracks, {
      bpmFilter: bpmFilterEnabled,
      keyFilter: keyFilterEnabled,
      topN: 100,
    });
  }, [activeTrack, tracks, bpmFilterEnabled, keyFilterEnabled]);

  // Auto-select best next track when compatibility list changes (or active track changes).
  useEffect(() => {
    if (compatible.length === 0) {
      setNextTrack(null);
      return;
    }
    // If current nextTrack is no longer compatible, replace with top.
    const stillValid = nextTrack && compatible.some(c => c.track.id === nextTrack.id);
    if (!stillValid) setNextTrack(compatible[0].track);
  }, [compatible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register navigation: explore mode advances to chosen nextTrack.
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

  // Close dropdown when clicking outside.
  useEffect(() => {
    const onClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="explore">
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

          {nextTrack && (
            <div className="next-info">
              <strong>NEXT:</strong> {nextTrack.title} — {nextTrack.artist}
              {' · '}
              {nextTrack.bpm ? `${nextTrack.bpm.toFixed(1)} BPM` : 'no BPM'}
              {' · '}
              {keyToCamelot(nextTrack.key) || nextTrack.key || 'no key'}
            </div>
          )}
        </>
      ) : (
        <p className="muted">Pick a track above to start exploring compatibility.</p>
      )}
    </div>
  );
}

export default Explore;
