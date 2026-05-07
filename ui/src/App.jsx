import { useState, useEffect, useRef } from 'react';
import './index.css';
import Library from './views/Library.jsx';
import Explore from './views/Explore.jsx';

function App() {
  const [view, setView] = useState('library');
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);

  const audioRef = useRef(null);
  const navRef = useRef({ getNext: () => null, getPrev: () => null });

  useEffect(() => {
    fetch('http://localhost:4000/api/tracks')
      .then(res => res.json())
      .then(data => {
        if (data.tracks) setTracks(data.tracks);
      })
      .catch(err => console.error(err));

    fetch('http://localhost:4000/api/playlists')
      .then(res => res.json())
      .then(data => {
        if (data.playlists) setPlaylists(data.playlists);
      })
      .catch(err => console.error(err));
  }, []);

  const handlePlay = (track) => {
    if (!track) return;
    setCurrentTrack(track);
    if (audioRef.current) {
      audioRef.current.src = `http://localhost:4000/api/audio?path=${encodeURIComponent(track.filePath || '')}`;
      audioRef.current.play().catch(() => {});
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: 'Rekordbox USB'
      });
    }
  };

  const handleNext = () => {
    const next = navRef.current?.getNext?.();
    if (next) handlePlay(next);
  };

  const handlePrev = () => {
    const prev = navRef.current?.getPrev?.();
    if (prev) handlePlay(prev);
  };

  const handleEnded = () => {
    handleNext();
  };

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, []);

  return (
    <>
      <h1>plug-and-play</h1>

      <div className="view-toggle">
        <button
          className={view === 'library' ? 'active' : ''}
          onClick={() => setView('library')}
        >
          Library
        </button>
        <button
          className={view === 'explore' ? 'active' : ''}
          onClick={() => setView('explore')}
        >
          Explore
        </button>
      </div>

      {view === 'library' ? (
        <Library
          tracks={tracks}
          playlists={playlists}
          currentTrack={currentTrack}
          onPlay={handlePlay}
          navRef={navRef}
        />
      ) : (
        <Explore
          tracks={tracks}
          currentTrack={currentTrack}
          onPlay={handlePlay}
          navRef={navRef}
        />
      )}

      <div className="player" style={{ visibility: currentTrack ? 'visible' : 'hidden' }}>
        {currentTrack && (
          <>
            <div style={{ flex: 1 }}>
              <strong>NOW PLAYING:</strong> {currentTrack.title} - {currentTrack.artist}
            </div>
            <div className="player-controls">
              <button className="player-btn" onClick={handlePrev}>⏮</button>
              <button className="player-btn" onClick={handleNext}>⏭</button>
            </div>
          </>
        )}
        <audio ref={audioRef} controls autoPlay onEnded={handleEnded} />
      </div>
    </>
  );
}

export default App;
