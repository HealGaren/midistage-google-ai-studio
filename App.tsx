
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { midiService } from './webMidiService';
import { Song, ProjectData, SequenceMode, InputMapping, NotePreset, Sequence, ActiveNoteState, NoteItem, SequenceItem, GlobalMapping, DurationUnit, GlissandoConfig, GlissandoMode } from './types';
import Navigation from './components/Navigation';
import Editor from './components/Editor';
import Performance from './components/Performance';
import Settings from './components/Settings';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_PROJECT: ProjectData = {
  name: "New Performance Set",
  songs: [
    {
      id: uuidv4(),
      name: "Opening Track",
      bpm: 120,
      presets: [],
      presetFolders: [],
      sequences: [],
      mappings: []
    }
  ],
  selectedInputId: '',
  selectedOutputId: '',
  globalMappings: []
};

const getGlissandoSteps = (start: number, end: number, mode: GlissandoMode) => {
  const steps: number[] = [];
  const dir = start < end ? 1 : -1;
  let curr = start;
  while (dir === 1 ? curr <= end : curr >= end) {
    const pc = curr % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(pc);
    if (mode === 'both' || (mode === 'white' && !isBlack) || (mode === 'black' && isBlack)) {
      steps.push(curr);
    }
    curr += dir;
  }
  return steps;
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [currentSongId, setCurrentSongId] = useState<string>(DEFAULT_PROJECT.songs[0].id);
  const [activeTab, setActiveTab] = useState<'editor' | 'performance' | 'settings'>('performance');
  const [isMidiReady, setIsMidiReady] = useState(false);
  
  const [activeMidiNotes, setActiveMidiNotes] = useState<ActiveNoteState[]>([]);
  const stepIndicesRef = useRef<Record<string, number>>({});
  const lastActivePresetForTriggerRef = useRef<Map<string, string>>(new Map());
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

  const sendNoteOn = useCallback((pitch: number, velocity: number, channel: number, durationMs: number | null) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.playNote(pitch, { attack: velocity, channels: [channel] as any });
    setActiveMidiNotes(prev => [...prev, { pitch, channel, startTime: Date.now(), durationMs }]);
  }, [project.selectedOutputId]);

  const sendNoteOff = useCallback((pitch: number, channel: number) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.stopNote(pitch, { channels: [channel] as any });
    setActiveMidiNotes(prev => prev.filter(n => !(n.pitch === pitch && n.channel === channel)));
  }, [project.selectedOutputId]);

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

  const calculateMs = useCallback((value: number, unit: DurationUnit, bpm: number) => {
    if (unit === 'ms') return value;
    return (value * 60000) / bpm;
  }, []);

  const runGlissandoInternal = useCallback(async (start: number, end: number, config: GlissandoConfig, channel: number) => {
    const steps = getGlissandoSteps(start, end, config.mode);
    if (steps.length === 0) return;

    for (let i = 0; i < steps.length; i++) {
      const pitch = steps[i];
      const t = i / (steps.length - 1 || 1);
      const vel = start < end 
        ? config.lowestVelocity + t * (config.targetVelocity - config.lowestVelocity)
        : config.targetVelocity + t * (config.lowestVelocity - config.targetVelocity);
      
      sendNoteOn(pitch, vel, channel, config.speed);
      
      setTimeout(() => {
        sendNoteOff(pitch, channel);
      }, config.speed);

      await new Promise(r => setTimeout(r, config.speed));
    }
  }, [sendNoteOn, sendNoteOff]);

  const triggerDirectNote = useCallback((note: Omit<NoteItem, 'id'>, idSuffix: string = '', bpm: number = currentSong.bpm) => {
    const timerKey = `direct_${idSuffix}_${note.pitch}_${Date.now()}`;
    const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
    const durationMs = note.duration !== null ? calculateMs(note.duration, note.durationUnit, bpm) : null;

    state.onTimeout = setTimeout(() => {
      state.isPlaying = true;
      state.onTimeout = undefined;
      sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
      if (durationMs !== null) {
        state.offTimeout = setTimeout(() => {
          sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }, durationMs);
      }
    }, note.preDelay);
    noteTimersRef.current.set(timerKey, state);
  }, [sendNoteOn, sendNoteOff, calculateMs, currentSong.bpm]);

  const triggerPreset = useCallback(async (presetId: string, isRelease: boolean = false, overrideDuration: number | null = null, overrideUnit: DurationUnit = 'ms', bpm: number = currentSong.bpm) => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;

    const gliss = preset.glissando;

    if (isRelease) {
      preset.notes.forEach(note => {
        const timerKey = `${presetId}_${note.id}`;
        const existing = noteTimersRef.current.get(timerKey);
        let durationMs: number | null = null;
        if (overrideDuration !== null) durationMs = calculateMs(overrideDuration, overrideUnit, bpm);
        else if (note.duration !== null) durationMs = calculateMs(note.duration, note.durationUnit, bpm);

        if (existing && durationMs === null) {
          if (existing.onTimeout) clearTimeout(existing.onTimeout);
          if (existing.isPlaying) sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }
      });

      if (gliss?.releaseEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        await runGlissandoInternal(gliss.targetNote, gliss.lowestNote, gliss, mainChannel);
      }
    } else {
      if (gliss?.attackEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        await runGlissandoInternal(gliss.lowestNote, gliss.targetNote, gliss, mainChannel);
      }

      preset.notes.forEach(note => {
        const timerKey = `${presetId}_${note.id}`;
        const existing = noteTimersRef.current.get(timerKey);
        let durationMs: number | null = null;
        if (overrideDuration !== null) durationMs = calculateMs(overrideDuration, overrideUnit, bpm);
        else if (note.duration !== null) durationMs = calculateMs(note.duration, note.durationUnit, bpm);

        if (existing) {
          if (existing.onTimeout) clearTimeout(existing.onTimeout);
          if (existing.offTimeout) clearTimeout(existing.offTimeout);
          if (existing.isPlaying) sendNoteOff(note.pitch, note.channel);
        }

        const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
        state.onTimeout = setTimeout(() => {
          state.isPlaying = true;
          state.onTimeout = undefined;
          sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
          if (durationMs !== null) {
            state.offTimeout = setTimeout(() => {
              sendNoteOff(note.pitch, note.channel);
              noteTimersRef.current.delete(timerKey);
            }, durationMs);
          }
        }, note.preDelay);
        noteTimersRef.current.set(timerKey, state);
      });
    }
  }, [currentSong, sendNoteOn, sendNoteOff, calculateMs, runGlissandoInternal]);

  const triggerSequenceItem = useCallback((item: SequenceItem, bpm: number) => {
    if (item.type === 'preset' && item.targetId) {
      triggerPreset(item.targetId, false, item.overrideDuration ?? null, item.overrideDurationUnit ?? 'ms', bpm);
    } else if (item.type === 'note' && item.noteData) {
      triggerDirectNote(item.noteData, item.id, bpm);
    }
  }, [triggerPreset, triggerDirectNote]);

  const triggerSequence = useCallback((seqId: string, mappingId: string, isRelease: boolean = false) => {
    const seq = currentSong.sequences.find(s => s.id === seqId);
    if (!seq) return;
    const effectiveBpm = seq.bpm || currentSong.bpm;

    if (seq.mode === SequenceMode.STEP) {
      if (isRelease) {
        const lastPresetId = lastActivePresetForTriggerRef.current.get(mappingId);
        if (lastPresetId) triggerPreset(lastPresetId, true, null, 'ms', effectiveBpm);
      } else {
        const currentIndex = stepIndicesRef.current[seqId] || 0;
        const item = seq.items[currentIndex];
        if (item) {
          if (item.type === 'preset') lastActivePresetForTriggerRef.current.set(mappingId, item.targetId!);
          triggerSequenceItem(item, effectiveBpm);
        }
        stepIndicesRef.current[seqId] = (currentIndex + 1) % seq.items.length;
      }
    } else if (seq.mode === SequenceMode.AUTO) {
      if (!isRelease) {
        const msPerBeat = 60000 / effectiveBpm;
        seq.items.forEach(item => {
          const delayMs = item.beatPosition * msPerBeat;
          setTimeout(() => triggerSequenceItem(item, effectiveBpm), delayMs);
        });
      }
    }
  }, [currentSong, triggerPreset, triggerSequenceItem]);

  const handleActionTrigger = useCallback((mappingId: string, actionType: 'preset' | 'sequence', targetId: string, isRelease: boolean) => {
    if (actionType === 'preset') triggerPreset(targetId, isRelease);
    else if (actionType === 'sequence') triggerSequence(targetId, mappingId, isRelease);
  }, [triggerPreset, triggerSequence]);

  const resetAllSequences = useCallback(() => {
    stepIndicesRef.current = {};
    lastActivePresetForTriggerRef.current.clear();
  }, []);

  const handleGlobalActionTrigger = useCallback((action: GlobalMapping) => {
    if (!action.isEnabled) return;
    const currentIndex = project.songs.findIndex(s => s.id === currentSongId);
    
    switch (action.actionType) {
      case 'PREV_SONG':
        if (currentIndex > 0) setCurrentSongId(project.songs[currentIndex - 1].id);
        break;
      case 'NEXT_SONG':
        if (currentIndex < project.songs.length - 1) setCurrentSongId(project.songs[currentIndex + 1].id);
        break;
      case 'GOTO_SONG':
        const targetIdx = (action.actionValue || 1) - 1;
        if (project.songs[targetIdx]) setCurrentSongId(project.songs[targetIdx].id);
        break;
      case 'RESET_SEQUENCES':
        resetAllSequences();
        break;
    }
  }, [project.songs, currentSongId, resetAllSequences]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      project.globalMappings.forEach(gm => {
        if (gm.isEnabled && gm.triggerType === 'keyboard' && gm.triggerValue === e.key) {
          handleGlobalActionTrigger(gm);
        }
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.globalMappings, handleGlobalActionTrigger]);

  useEffect(() => {
    const input = midiService.getInputById(project.selectedInputId);
    if (!input) return;
    
    const onNoteOn = (e: any) => {
      const pitch = e.note.number;
      const channel = e.message.channel;
      project.globalMappings.forEach(gm => {
        if (gm.isEnabled && gm.triggerType === 'midi' && Number(gm.triggerValue) === pitch) {
          const channelMatch = gm.triggerChannel === 0 || gm.triggerChannel === channel;
          if (channelMatch) {
            handleGlobalActionTrigger(gm);
          }
        }
      });
    };
    
    input.addListener('noteon', onNoteOn);
    return () => { input.removeListener('noteon', onNoteOn); };
  }, [project.selectedInputId, project.globalMappings, handleGlobalActionTrigger]);

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
              sendNoteOn={sendNoteOn}
              sendNoteOff={sendNoteOff}
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
