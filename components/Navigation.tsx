
import React, { useRef } from 'react';
import { Song, ProjectData } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { downloadSongAsJson, importSongFromJson } from '../utils/songImportExport';
import { createZeitgeistSong, createVolcanoSong, createDesertEagleSong, createFMBusinessSong, createAgogSong } from '../data';

interface NavigationProps {
  songs: Song[];
  currentSongId: string;
  onSelectSong: (id: string) => void;
  onUpdateProject: (updater: (prev: ProjectData) => ProjectData) => void;
}

const Navigation: React.FC<NavigationProps> = ({ songs, currentSongId, onSelectSong, onUpdateProject }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addSong = () => {
    // Generate a default scene ID for the new song
    const sceneId = uuidv4();
    // Fix: Added missing 'mappingIds: []' to comply with Scene interface
    const newSong: Song = {
      id: uuidv4(),
      name: "Untitled Song",
      bpm: 120,
      presets: [],
      presetFolders: [],
      sequences: [],
      mappings: [],
      ccMappings: [],
      scenes: [{ id: sceneId, name: "Default Scene", mappingIds: [] }],
      activeSceneId: sceneId
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

  const moveSong = (id: string, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    const index = songs.findIndex(s => s.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === songs.length - 1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    onUpdateProject(prev => {
      const newSongs = [...prev.songs];
      [newSongs[index], newSongs[newIndex]] = [newSongs[newIndex], newSongs[index]];
      return { ...prev, songs: newSongs };
    });
  };

  const exportCurrentSong = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentSong = songs.find(s => s.id === currentSongId);
    if (currentSong) {
      downloadSongAsJson(currentSong);
    }
  };

  const importSong = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const fileReader = new FileReader();
    fileReader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content === 'string') {
          const importedSong = importSongFromJson(content);
          onUpdateProject(prev => ({ ...prev, songs: [...prev.songs, importedSong] }));
          onSelectSong(importedSong.id);
        }
      } catch (err) {
        console.error("Failed to import song:", err);
        alert("Error importing song file.");
      }
    };
    fileReader.readAsText(files[0]);
    // Reset input so same file can be imported again
    event.target.value = '';
  };

  const addSongWithGlobalMapping = (song: Song) => {
    onUpdateProject(prev => {
      // Check if reset sequence global mapping already exists
      const hasResetMapping = prev.globalMappings.some(
        gm => gm.midiValue === '46,47' && gm.midiChannel === 10 && gm.actionType === 'RESET_SEQUENCES'
      );
      
      const newGlobalMappings = hasResetMapping ? prev.globalMappings : [
        ...prev.globalMappings,
        {
          id: uuidv4(),
          keyboardValue: 'Backspace',
          midiValue: '46,47',
          midiChannel: 10, // Drum pad channel
          actionType: 'RESET_SEQUENCES' as const,
          actionValue: 0,
          isEnabled: true
        }
      ];
      
      return {
        ...prev,
        songs: [...prev.songs, song],
        globalMappings: newGlobalMappings
      };
    });
    onSelectSong(song.id);
  };

  const importZeitgeist = () => {
    const zeitgeistSong = createZeitgeistSong();
    addSongWithGlobalMapping(zeitgeistSong);
  };

  const importVolcano = () => {
    const volcanoSong = createVolcanoSong();
    addSongWithGlobalMapping(volcanoSong);
  };

  const importDesertEagle = () => {
    const desertEagleSong = createDesertEagleSong();
    addSongWithGlobalMapping(desertEagleSong);
  };

  const importFMBusiness = () => {
    const fmBusinessSong = createFMBusinessSong();
    addSongWithGlobalMapping(fmBusinessSong);
  };

  const importAgog = () => {
    const agogSong = createAgogSong();
    addSongWithGlobalMapping(agogSong);
  };

  const importAllSongs = () => {
    const allSongs = [
      createZeitgeistSong(),
      createVolcanoSong(),
      createDesertEagleSong(),
      createFMBusinessSong(),
      createAgogSong()
    ];
    
    onUpdateProject(prev => {
      // Check if reset sequence global mapping already exists
      const hasResetMapping = prev.globalMappings.some(
        gm => gm.midiValue === '46,47' && gm.midiChannel === 10 && gm.actionType === 'RESET_SEQUENCES'
      );
      
      const newGlobalMappings = hasResetMapping ? prev.globalMappings : [
        ...prev.globalMappings,
        {
          id: uuidv4(),
          keyboardValue: 'Backspace',
          midiValue: '46,47',
          midiChannel: 10, // Drum pad channel
          actionType: 'RESET_SEQUENCES' as const,
          actionValue: 0,
          isEnabled: true
        }
      ];
      
      return {
        ...prev,
        songs: [...prev.songs, ...allSongs],
        globalMappings: newGlobalMappings
      };
    });
    onSelectSong(allSongs[0].id);
  };

  return (
    <nav className="w-64 bg-slate-900/50 border-r border-slate-800 flex flex-col p-4 z-10">
      <input type="file" ref={fileInputRef} onChange={importSong} accept=".json" className="hidden" />
      
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Setlist</h2>
        <button 
          onClick={addSong}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Add new song"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>

      <div className="flex gap-1 mb-4 px-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
          title="Import song from JSON"
        >
          Import
        </button>
        <button
          onClick={exportCurrentSong}
          className="flex-1 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
          title="Export current song to JSON"
        >
          Export
        </button>
      </div>

      <div className="mx-2 mb-4 space-y-1">
        <button
          onClick={importAllSongs}
          className="w-full px-2 py-2 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 hover:from-indigo-800/50 hover:to-purple-800/50 text-indigo-300 hover:text-indigo-200 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all border border-indigo-800/50"
          title="Import all songs from 260222-songs collection"
        >
          + Import All Songs
        </button>
        
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={importZeitgeist}
            className="px-2 py-1.5 bg-indigo-900/30 hover:bg-indigo-800/30 text-indigo-400 hover:text-indigo-300 rounded text-[8px] font-bold uppercase tracking-wider transition-all border border-indigo-800/30"
            title="Import Zeitgeist song"
          >
            Zeitgeist
          </button>
          <button
            onClick={importVolcano}
            className="px-2 py-1.5 bg-orange-900/30 hover:bg-orange-800/30 text-orange-400 hover:text-orange-300 rounded text-[8px] font-bold uppercase tracking-wider transition-all border border-orange-800/30"
            title="Import Volcano song"
          >
            Volcano
          </button>
          <button
            onClick={importDesertEagle}
            className="px-2 py-1.5 bg-amber-900/30 hover:bg-amber-800/30 text-amber-400 hover:text-amber-300 rounded text-[8px] font-bold uppercase tracking-wider transition-all border border-amber-800/30"
            title="Import Desert Eagle song"
          >
            Desert Eagle
          </button>
          <button
            onClick={importFMBusiness}
            className="px-2 py-1.5 bg-cyan-900/30 hover:bg-cyan-800/30 text-cyan-400 hover:text-cyan-300 rounded text-[8px] font-bold uppercase tracking-wider transition-all border border-cyan-800/30"
            title="Import FM Business song"
          >
            FM Business
          </button>
          <button
            onClick={importAgog}
            className="px-2 py-1.5 bg-green-900/30 hover:bg-green-800/30 text-green-400 hover:text-green-300 rounded text-[8px] font-bold uppercase tracking-wider transition-all border border-green-800/30 col-span-2"
            title="Import Agog song"
          >
            Agog
          </button>
        </div>
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
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
              <button 
                onClick={(e) => moveSong(song.id, 'up', e)}
                className={`p-1 rounded transition-all ${index === 0 ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                disabled={index === 0}
                title="Move up"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button 
                onClick={(e) => moveSong(song.id, 'down', e)}
                className={`p-1 rounded transition-all ${index === songs.length - 1 ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-slate-700 text-slate-400 hover:text-white'}`}
                disabled={index === songs.length - 1}
                title="Move down"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              <button 
                onClick={(e) => removeSong(song.id, e)}
                className="p-1 hover:bg-slate-700 hover:text-rose-400 rounded transition-all"
                title="Remove song"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
};

export default Navigation;
