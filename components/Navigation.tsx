
import React from 'react';
import { Song, ProjectData } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface NavigationProps {
  songs: Song[];
  currentSongId: string;
  onSelectSong: (id: string) => void;
  onUpdateProject: (updater: (prev: ProjectData) => ProjectData) => void;
}

const Navigation: React.FC<NavigationProps> = ({ songs, currentSongId, onSelectSong, onUpdateProject }) => {
  const addSong = () => {
    // FIX: Added missing presetFolders property to comply with Song interface
    const newSong: Song = {
      id: uuidv4(),
      name: "Untitled Song",
      bpm: 120,
      presets: [],
      presetFolders: [],
      sequences: [],
      mappings: []
    };
    onUpdateProject(prev => ({ ...prev, songs: [...prev.songs, newSong] }));
    onSelectSong(newSong.id);
  };

  const removeSong = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (songs.length <= 1) return;
    onUpdateProject(prev => ({ ...prev, songs: prev.songs.filter(s => s.id !== id) }));
    if (currentSongId === id) onSelectSong(songs[0].id === id ? songs[1].id : songs[0].id);
  };

  return (
    <nav className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col p-4 z-10">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Setlist</h2>
        <button 
          onClick={addSong}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
      
      <div className="flex flex-col gap-1 overflow-y-auto pr-1">
        {songs.map((song, index) => (
          <div 
            key={song.id}
            onClick={() => onSelectSong(song.id)}
            className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
              currentSongId === song.id 
              ? 'bg-indigo-600 text-white shadow-lg' 
              : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <span className={`text-[10px] font-black ${currentSongId === song.id ? 'text-indigo-200' : 'text-slate-600'}`}>{String(index + 1).padStart(2, '0')}</span>
              <span className="text-sm font-semibold truncate">{song.name}</span>
            </div>
            <button 
              onClick={(e) => removeSong(song.id, e)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700 rounded transition-all"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;
