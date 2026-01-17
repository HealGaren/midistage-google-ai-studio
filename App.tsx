
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { midiService } from './webMidiService';
import { Song, ProjectData, SequenceMode, InputMapping, NotePreset, Sequence, ActiveNoteState } from './types';
import Navigation from './components/Navigation';
import Editor from './components/Editor';
import Performance from './components/Performance';
import Settings from './components/Settings';
import { v4 as uuidv4 } from 'uuid';
import { WebMidi, Input, Output, Note } from 'webmidi';

const DEFAULT_PROJECT: ProjectData = {
  name: "New Performance Set",
  songs: [
    {
      id: uuidv4(),
      name: "Opening Track",
      bpm: 120,
      presets: [],
      sequences: [],
      mappings: []
    }
  ],
  selectedInputId: '',
  selectedOutputId: ''
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [currentSongId, setCurrentSongId] = useState<string>(DEFAULT_PROJECT.songs[0].id);
  const [activeTab, setActiveTab] = useState<'editor' | 'performance' | 'settings'>('performance');
  const [isMidiReady, setIsMidiReady] = useState(false);
  
  // Performance State
  const [activeMidiNotes, setActiveMidiNotes] = useState<ActiveNoteState[]>([]);
  const stepIndicesRef = useRef<Record<string, number>>({});
  
  // triggerId (mapping ID 등) -> targetPresetId
  const lastActivePresetForTriggerRef = useRef<Map<string, string>>(new Map());

  // Track timers for specific notes to allow cancellation on release
  const noteTimersRef = useRef<Map<string, { onTimeout?: any, offTimeout?: any, isPlaying: boolean }>>(new Map());

  const currentSong = project.songs.find(s => s.id === currentSongId) || project.songs[0];

  useEffect(() => {
    midiService.init().then(() => setIsMidiReady(true));
    return () => {
      noteTimersRef.current.forEach(timer => {
        if (timer.onTimeout) clearTimeout(timer.onTimeout);
        if (timer.offTimeout) clearTimeout(timer.offTimeout);
      });
      noteTimersRef.current.clear();
    };
  }, []);

  const handleUpdateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => {
    setProject(prev => updater(prev));
  }, []);

  const saveProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${project.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setProject(json);
        if (json.songs.length > 0) setCurrentSongId(json.songs[0].id);
      } catch (err) {
        alert("Failed to load project file.");
      }
    };
    reader.readAsText(file);
  };

  const stopAllNotes = useCallback(() => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (output) {
      for (let i = 1; i <= 16; i++) {
        output.sendControlChange(123, 0, { channels: [i] as any });
      }
    }
    setActiveMidiNotes([]);
    noteTimersRef.current.forEach(timer => {
      if (timer.onTimeout) clearTimeout(timer.onTimeout);
      if (timer.offTimeout) clearTimeout(timer.offTimeout);
    });
    noteTimersRef.current.clear();
  }, [project.selectedOutputId]);

  const sendNoteOn = useCallback((pitch: number, velocity: number, channel: number, duration: number | null) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.playNote(pitch, { attack: velocity, channels: [channel] as any });
    setActiveMidiNotes(prev => [...prev, { pitch, channel, startTime: Date.now(), duration }]);
  }, [project.selectedOutputId]);

  const sendNoteOff = useCallback((pitch: number, channel: number) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.stopNote(pitch, { channels: [channel] as any });
    setActiveMidiNotes(prev => prev.filter(n => !(n.pitch === pitch && n.channel === channel)));
  }, [project.selectedOutputId]);

  const triggerPreset = useCallback((presetId: string, isRelease: boolean = false) => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;

    preset.notes.forEach(note => {
      const timerKey = `${presetId}_${note.id}`;
      const existing = noteTimersRef.current.get(timerKey);

      if (isRelease) {
        if (existing) {
          if (note.duration === null) {
            if (existing.onTimeout) clearTimeout(existing.onTimeout);
            if (existing.isPlaying) {
              sendNoteOff(note.pitch, note.channel);
            }
            noteTimersRef.current.delete(timerKey);
          }
        }
      } else {
        if (existing) {
          if (existing.onTimeout) clearTimeout(existing.onTimeout);
          if (existing.offTimeout) clearTimeout(existing.offTimeout);
          if (existing.isPlaying) sendNoteOff(note.pitch, note.channel);
        }

        const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
        state.onTimeout = setTimeout(() => {
          state.isPlaying = true;
          state.onTimeout = undefined;
          sendNoteOn(note.pitch, note.velocity, note.channel, note.duration);
          if (note.duration !== null) {
            state.offTimeout = setTimeout(() => {
              sendNoteOff(note.pitch, note.channel);
              noteTimersRef.current.delete(timerKey);
            }, note.duration);
          }
        }, note.preDelay);
        noteTimersRef.current.set(timerKey, state);
      }
    });
  }, [currentSong, sendNoteOn, sendNoteOff]);

  const triggerSequence = useCallback((seqId: string, mappingId: string, isRelease: boolean = false) => {
    const seq = currentSong.sequences.find(s => s.id === seqId);
    if (!seq) return;

    if (seq.mode === SequenceMode.STEP) {
      if (isRelease) {
        const lastPresetId = lastActivePresetForTriggerRef.current.get(mappingId);
        if (lastPresetId) {
          triggerPreset(lastPresetId, true);
        }
      } else {
        const currentIndex = stepIndicesRef.current[seqId] || 0;
        const item = seq.items[currentIndex];
        if (item && item.type === 'preset') {
          lastActivePresetForTriggerRef.current.set(mappingId, item.targetId);
          triggerPreset(item.targetId, false);
        }
        stepIndicesRef.current[seqId] = (currentIndex + 1) % seq.items.length;
      }
    } else if (seq.mode === SequenceMode.AUTO) {
      if (!isRelease) {
        seq.items.forEach(item => {
          if (item.type === 'preset') {
            setTimeout(() => triggerPreset(item.targetId, false), item.delay);
          }
        });
      }
    }
  }, [currentSong, triggerPreset]);

  const handleActionTrigger = useCallback((mappingId: string, actionType: 'preset' | 'sequence', targetId: string, isRelease: boolean) => {
    if (actionType === 'preset') triggerPreset(targetId, isRelease);
    else if (actionType === 'sequence') triggerSequence(targetId, mappingId, isRelease);
  }, [triggerPreset, triggerSequence]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-xl z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-900/20">M</div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">MidiStage</h1>
            <p className="text-xs text-slate-400 font-medium">{project.name}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('performance')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'performance' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}>Live View</button>
          <button onClick={() => setActiveTab('editor')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'editor' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}>Setlist Editor</button>
          <button onClick={() => setActiveTab('settings')} className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-400'}`}>Settings</button>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={saveProject} className="p-2 hover:bg-slate-800 rounded-md transition-colors" title="Save Project">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
          </button>
          <label className="p-2 hover:bg-slate-800 rounded-md transition-colors cursor-pointer" title="Load Project">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <input type="file" className="hidden" accept=".json" onChange={loadProject} />
          </label>
          <button onClick={stopAllNotes} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-bold uppercase tracking-wider shadow-lg shadow-rose-900/20">Panic</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Navigation 
          songs={project.songs} 
          currentSongId={currentSongId} 
          onSelectSong={setCurrentSongId} 
          onUpdateProject={handleUpdateProject}
        />
        <main className="flex-1 relative overflow-auto p-8 bg-slate-950">
          {activeTab === 'editor' && (
            <Editor 
              song={currentSong} 
              onUpdateSong={(updated) => {
                handleUpdateProject(prev => ({
                  ...prev,
                  songs: prev.songs.map(s => s.id === updated.id ? updated : s)
                }));
              }}
            />
          )}
          {activeTab === 'performance' && (
            <Performance 
              song={currentSong} 
              activeNotes={activeMidiNotes} 
              onTrigger={handleActionTrigger}
              selectedInputId={project.selectedInputId}
            />
          )}
          {activeTab === 'settings' && (
            <Settings 
              project={project} 
              onUpdateProject={handleUpdateProject} 
            />
          )}
        </main>
      </div>

      <footer className="h-8 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-6 text-[10px] font-medium text-slate-500 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <span>MIDI Status: <span className={isMidiReady ? 'text-emerald-400' : 'text-rose-400'}>{isMidiReady ? 'Ready' : 'Disabled'}</span></span>
          {isMidiReady && <span>In: {midiService.getInputById(project.selectedInputId)?.name || 'None'}</span>}
          {isMidiReady && <span>Out: {midiService.getOutputById(project.selectedOutputId)?.name || 'None'}</span>}
        </div>
        <div>MidiStage Performance v1.0.0</div>
      </footer>
    </div>
  );
};

export default App;
