import { useState, useEffect, useMemo } from 'react';

function Library({ tracks, playlists, currentTrack, onPlay, navRef }) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [filteredTracks, setFilteredTracks] = useState([]);
  const [mode, setMode] = useState('order');
  const [searchQuery, setSearchQuery] = useState('');

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

    if (searchQuery) {
      result = result.filter(t =>
        (t.title && t.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.artist && t.artist.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    setFilteredTracks(result);
  }, [tracks, selectedPlaylist, mode, searchQuery]);

  useEffect(() => {
    navRef.current = {
      getNext: () => {
        if (!currentTrack) return null;
        const idx = filteredTracks.findIndex(t => t.id === currentTrack.id);
        return idx !== -1 && idx < filteredTracks.length - 1 ? filteredTracks[idx + 1] : null;
      },
      getPrev: () => {
        if (!currentTrack) return null;
        const idx = filteredTracks.findIndex(t => t.id === currentTrack.id);
        return idx > 0 ? filteredTracks[idx - 1] : null;
      },
    };
  }, [filteredTracks, currentTrack, navRef]);

  return (
    <>
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
            onClick={() => onPlay(track)}
          >
            <span>{track.title || 'Unknown Title'}</span>
            <span>{track.artist || 'Unknown Artist'}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default Library;
