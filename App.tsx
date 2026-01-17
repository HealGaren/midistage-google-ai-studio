
import React, { useState, useEffect, useCallback } from 'react';
import { midiService } from './webMidiService';
import { Song, ProjectData, GlobalMapping, GlobalActionType } from './types';
import { useMidiEngine } from './hooks/useMidiEngine';
import Navigation from './components/Navigation';
import Editor from './components/Editor';
import Performance from './components/Performance';
import Settings from './components/Settings';
import { v4 as uuidv4 } from 'uuid';

const createDefaultSong = (name: string): Song => {
  const sceneId = uuidv4();
  return {
    id: uuidv4(),
    name,
    bpm: 120,
    presets: [],
    presetFolders: [],
    sequences: [],
    mappings: [],
    scenes: [{ id: sceneId, name: "Default Scene", mappingIds: [] }],
    activeSceneId: sceneId
  };
};

const DEFAULT_PROJECT: ProjectData = {
  name: "New Performance Set",
  songs: [createDefaultSong("Opening Track")],
  selectedInputId: '',
  selectedOutputId: '',
  globalMappings: []
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [currentSongId, setCurrentSongId] = useState<string>(DEFAULT_PROJECT.songs[0].id);
  const [activeTab, setActiveTab] = useState<'editor' | 'performance' | 'settings'>('performance');
  const [isMidiReady, setIsMidiReady] = useState(false);

  const currentSong = project.songs.find(s => s.id === currentSongId) || project.songs[0];
  const { activeMidiNotes, sendNoteOn, sendNoteOff, stopAllNotes, triggerPreset, triggerSequence, resetAllSequences } = useMidiEngine(project, currentSong);

  useEffect(() => {
    midiService.init().then(() => setIsMidiReady(true));
  }, []);

  const handleUpdateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => setProject(updater), []);

  const handleUpdateSong = useCallback((updated: Song) => {
    setProject(prev => ({
      ...prev,
      songs: prev.songs.map(s => s.id === updated.id ? updated : s)
    }));
  }, []);

  const handleActionTrigger = useCallback((mappingId: string, actionType: 'preset' | 'sequence' | 'switch_scene', targetId: string, isRelease: boolean, triggerValue: string | number) => {
    if (isRelease && actionType !== 'switch_scene') {
      if (actionType === 'preset') triggerPreset(targetId, true, null, 'ms', currentSong.bpm, mappingId, false, triggerValue);
      else if (actionType === 'sequence') triggerSequence(targetId, mappingId, true, triggerValue);
      return;
    }

    if (!isRelease) {
      if (actionType === 'preset') {
        triggerPreset(targetId, false, null, 'ms', currentSong.bpm, mappingId, false, triggerValue);
      } else if (actionType === 'sequence') {
        triggerSequence(targetId, mappingId, false, triggerValue);
      } else if (actionType === 'switch_scene') {
        handleUpdateSong({ ...currentSong, activeSceneId: targetId });
      }
    }
  }, [triggerPreset, triggerSequence, currentSong, handleUpdateSong]);

  const handleGlobalActionTrigger = useCallback((action: GlobalMapping) => {
    if (!action.isEnabled) return;
    const currentIndex = project.songs.findIndex(s => s.id === currentSongId);
    switch (action.actionType) {
      case 'PREV_SONG': if (currentIndex > 0) setCurrentSongId(project.songs[currentIndex - 1].id); break;
      case 'NEXT_SONG': if (currentIndex < project.songs.length - 1) setCurrentSongId(project.songs[currentIndex + 1].id); break;
      case 'GOTO_SONG': const targetIdx = (action.actionValue || 1) - 1; if (project.songs[targetIdx]) setCurrentSongId(project.songs[targetIdx].id); break;
      case 'RESET_SEQUENCES': resetAllSequences(); break;
    }
  }, [project.songs, currentSongId, resetAllSequences]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      project.globalMappings.forEach(gm => { if (gm.triggerType === 'keyboard' && gm.triggerValue === e.key) handleGlobalActionTrigger(gm); });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.globalMappings, handleGlobalActionTrigger]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-xl z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">M</div>
          <div><h1 className="text-lg font-bold tracking-tight">MidiStage</h1><p className="text-xs text-slate-400 font-medium">{project.name}</p></div>
        </div>
        <div className="flex gap-2">
          {(['performance', 'editor', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === tab ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}>{tab === 'performance' ? 'Live' : tab === 'editor' ? 'Editor' : 'Settings'}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={stopAllNotes} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-bold uppercase tracking-wider">Panic</button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Navigation songs={project.songs} currentSongId={currentSongId} onSelectSong={setCurrentSongId} onUpdateProject={handleUpdateProject} />
        <main className="flex-1 relative overflow-auto p-8 bg-slate-950">
          {activeTab === 'editor' && <Editor song={currentSong} onUpdateSong={handleUpdateSong} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} selectedInputId={project.selectedInputId} />}
          {activeTab === 'performance' && <Performance song={currentSong} activeNotes={activeMidiNotes} onTrigger={handleActionTrigger} selectedInputId={project.selectedInputId} onUpdateSong={handleUpdateSong} />}
          {activeTab === 'settings' && <Settings project={project} onUpdateProject={handleUpdateProject} />}
        </main>
      </div>
    </div>
  );
};

export default App;
