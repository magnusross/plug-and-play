import { useState, useEffect, useRef, useMemo } from 'react';
import './index.css';

function App() {
  const [tracks, setTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [mode, setMode] = useState('order'); // 'order', 'recent', 'shuffle'
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTrack, setCurrentTrack] = useState(null);

  const audioRef = useRef(null);

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

  const selectedPlaylist = useMemo(
    () => playlists.find(p => String(p.id) === String(selectedPlaylistId)) || null,
    [playlists, selectedPlaylistId]
  );

  useEffect(() => {
    let result;

    if (selectedPlaylist) {
      const trackById = new Map(tracks.map(t => [t.id, t]));
      result = selectedPlaylist.trackIds
        .map(id => trackById.get(id))
        .filter(Boolean);
    } else {
      result = [...tracks];
    }

    if (mode === 'recent') {
      result.sort((a, b) => {
        const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
        const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
        return (dateB || 0) - (dateA || 0);
      });
    } else if (mode === 'shuffle') {
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
    }
    // mode === 'order': leave in playlist order (already in trackIds order)

    if (searchQuery) {
      result = result.filter(t =>
        (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.artist && t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    setFilteredTracks(result);
  }, [tracks, selectedPlaylist, mode, searchQuery]);

  const handlePlay = (track) => {
    setCurrentTrack(track);
    if (audioRef.current) {
      audioRef.current.src = `http://localhost:4000/api/audio?path=${encodeURIComponent(track.filePath || '')}`;
      audioRef.current.play();
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
    if (!currentTrack) return;
    const idx = filteredTracks.findIndex(t => t.id === currentTrack.id);
    if (idx !== -1 && idx < filteredTracks.length - 1) {
      handlePlay(filteredTracks[idx + 1]);
    }
  };

  const handlePrev = () => {
    if (!currentTrack) return;
    const idx = filteredTracks.findIndex(t => t.id === currentTrack.id);
    if (idx > 0) {
      handlePlay(filteredTracks[idx - 1]);
    }
  };

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [currentTrack, filteredTracks]);

  const handleEnded = () => {
    handleNext();
  };

  return (
    <>
      <h1>plug-and-play</h1>

      <div className="controls">
        <button
          className={mode === 'order' ? 'active' : ''}
          onClick={() => setMode('order')}
        >
          Order
        </button>
        <button
          className={mode === 'recent' ? 'active' : ''}
          onClick={() => setMode('recent')}
        >
          Recent
        </button>
        <button
          className={mode === 'shuffle' ? 'active' : ''}
          onClick={() => setMode('shuffle')}
        >
          Shuffle
        </button>

        <select
          className="playlist-select"
          value={selectedPlaylistId}
          onChange={(e) => setSelectedPlaylistId(e.target.value)}
        >
          <option value="">[All Tracks]</option>
          {playlists.map(p => (
            <option key={p.id} value={p.id}>{p.path}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search tracks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <ul className="track-list">
        {filteredTracks.length === 0 ? <li>No tracks loaded.</li> : null}
        {filteredTracks.map(track => (
          <li
            key={track.id}
            className={`track-item ${currentTrack?.id === track.id ? 'playing' : ''}`}
            onClick={() => handlePlay(track)}
          >
            <span>{track.title || 'Unknown Title'}</span>
            <span>{track.artist || 'Unknown Artist'}</span>
          </li>
        ))}
      </ul>

      {currentTrack && (
        <div className="player">
          <div style={{ flex: 1 }}>
            <strong>NOW PLAYING:</strong> {currentTrack.title} - {currentTrack.artist}
          </div>
          <div className="player-controls">
            <button className="player-btn" onClick={handlePrev}>⏮</button>
            <button className="player-btn" onClick={handleNext}>⏭</button>
          </div>
          <audio
            ref={audioRef}
            controls
            autoPlay
            onEnded={handleEnded}
          />
        </div>
      )}
    </>
  );
}

export default App;
