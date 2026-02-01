
import React, { useState, useEffect, useCallback } from 'react';
import { midiService } from './webMidiService';
import { Song, ProjectData, GlobalMapping, GlobalActionType, CCState, CCMapping } from './types';
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
    ccMappings: [],
    scenes: [{ id: sceneId, name: "Default Scene", mappingIds: [] }],
    activeSceneId: sceneId
  };
};

const DEFAULT_PROJECT: ProjectData = {
  name: "New Performance Set",
  songs: [createDefaultSong("Opening Track")],
  selectedInputId: '',
  selectedOutputId: '',
  globalMappings: [],
  globalCCMappings: []
};

interface MidiLogEntry {
  id: string;
  timestamp: Date;
  type: 'noteon' | 'noteoff' | 'cc';
  channel: number;
  note?: number;
  velocity?: number;
  cc?: number;
  value?: number;
}

// CC value processing with curve
const applyCurve = (value: number, curveValue: number): number => {
  // curveValue: 0 = exponential down, 0.5 = linear, 1 = exponential up
  const normalized = value / 127;
  let curved: number;
  if (curveValue === 0.5) {
    curved = normalized;
  } else if (curveValue < 0.5) {
    // Exponential curve (starts slow, ends fast)
    const exp = 1 + (0.5 - curveValue) * 4; // 1 to 3
    curved = Math.pow(normalized, exp);
  } else {
    // Logarithmic curve (starts fast, ends slow)
    const exp = 1 / (1 + (curveValue - 0.5) * 4); // 1 to 0.33
    curved = Math.pow(normalized, exp);
  }
  return Math.round(curved * 127);
};

const processCCValue = (inputValue: number, mapping: CCMapping): number => {
  let value = inputValue;
  
  // Apply curve first
  if (mapping.curveEnabled) {
    value = applyCurve(value, mapping.curveValue);
  }
  
  // Apply range mapping
  if (mapping.rangeEnabled) {
    const normalized = value / 127;
    value = Math.round(mapping.rangeMin + normalized * (mapping.rangeMax - mapping.rangeMin));
  }
  
  return Math.max(0, Math.min(127, value));
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [currentSongId, setCurrentSongId] = useState<string>(DEFAULT_PROJECT.songs[0].id);
  const [activeTab, setActiveTab] = useState<'editor' | 'performance' | 'settings'>('performance');
  const [isMidiReady, setIsMidiReady] = useState(false);
  const [showMidiMonitor, setShowMidiMonitor] = useState(false);
  const [midiLogs, setMidiLogs] = useState<MidiLogEntry[]>([]);
  const [ccStates, setCCStates] = useState<Record<string, number>>({}); // key: "channel-cc", value: 0-127

  const currentSong = project.songs.find(s => s.id === currentSongId) || project.songs[0];
  const { activeMidiNotes, stepPositions, sendNoteOn, sendNoteOff, stopAllNotes, triggerPreset, triggerSequence, resetAllSequences } = useMidiEngine(project, currentSong);

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
      if (actionType === 'preset') triggerPreset(targetId, true, undefined, 'ms', currentSong.bpm, mappingId, triggerValue, false);
      else if (actionType === 'sequence') triggerSequence(targetId, mappingId, true, triggerValue);
      return;
    }

    if (!isRelease) {
      if (actionType === 'preset') {
        triggerPreset(targetId, false, undefined, 'ms', currentSong.bpm, mappingId, triggerValue, false);
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

  // Global Keyboard Triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      project.globalMappings.forEach(gm => {
        const allowedKeys = gm.keyboardValue.toLowerCase().split(',').map(v => v.trim());
        if (allowedKeys.includes(key)) {
          handleGlobalActionTrigger(gm);
        }
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.globalMappings, handleGlobalActionTrigger]);

  // Global MIDI Triggers + MIDI Monitor Logging
  useEffect(() => {
    const input = midiService.getInputById(project.selectedInputId);
    if (!input) return;

    const addMidiLog = (entry: Omit<MidiLogEntry, 'id' | 'timestamp'>) => {
      setMidiLogs(prev => {
        const newEntry: MidiLogEntry = { ...entry, id: uuidv4(), timestamp: new Date() };
        const updated = [newEntry, ...prev];
        return updated.slice(0, 20); // Keep only last 20 entries
      });
    };

    const onNoteOn = (e: any) => {
      const pitch = String(e.note.number);
      const channel = e.message.channel;

      // Log to MIDI monitor
      addMidiLog({ type: 'noteon', channel, note: e.note.number, velocity: e.note.rawAttack });

      project.globalMappings.forEach(gm => {
        const channelMatch = gm.midiChannel === 0 || gm.midiChannel === channel;
        if (!channelMatch) return;

        const allowedNotes = gm.midiValue.toLowerCase().split(',').map(v => v.trim());
        if (allowedNotes.includes(pitch)) {
          handleGlobalActionTrigger(gm);
        }
      });
    };

    const onNoteOff = (e: any) => {
      addMidiLog({ type: 'noteoff', channel: e.message.channel, note: e.note.number, velocity: 0 });
    };

    const onCC = (e: any) => {
      const channel = e.message.channel;
      const cc = e.controller.number;
      const value = e.rawValue;
      
      addMidiLog({ type: 'cc', channel, cc, value });
      
      // Update CC state for visual display
      setCCStates(prev => ({ ...prev, [`${channel}-${cc}`]: value }));
      
      // Process CC mappings and send to output
      const output = midiService.getOutputById(project.selectedOutputId);
      if (!output) return;
      
      // Combine global and song CC mappings
      const allCCMappings = [...(project.globalCCMappings || []), ...(currentSong.ccMappings || [])];
      
      allCCMappings.forEach(mapping => {
        if (!mapping.isEnabled) return;
        const channelMatch = mapping.inputChannel === 0 || mapping.inputChannel === channel;
        if (!channelMatch || mapping.inputCC !== cc) return;
        
        const processedValue = processCCValue(value, mapping);
        const outChannel = mapping.outputRemapEnabled ? mapping.outputChannel : channel;
        const outCC = mapping.outputRemapEnabled ? mapping.outputCC : cc;
        
        output.sendControlChange(outCC, processedValue, { channels: [outChannel] as any });
      });
    };

    input.addListener('noteon', onNoteOn);
    input.addListener('noteoff', onNoteOff);
    input.addListener('controlchange', onCC);
    return () => {
      input.removeListener('noteon', onNoteOn);
      input.removeListener('noteoff', onNoteOff);
      input.removeListener('controlchange', onCC);
    };
  }, [project.selectedInputId, project.selectedOutputId, project.globalMappings, project.globalCCMappings, currentSong.ccMappings, handleGlobalActionTrigger]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shadow-xl z-20">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(79,70,229,0.5)]">M</div>
          <div><h1 className="text-lg font-bold tracking-tight">MidiStage</h1><p className="text-xs text-slate-400 font-medium">{project.name}</p></div>
        </div>
        <div className="flex gap-2">
          {(['performance', 'editor', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-500'}`}>{tab === 'performance' ? 'Live' : tab === 'editor' ? 'Editor' : 'Settings'}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMidiMonitor(true)} className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">MIDI Test</button>
          <button onClick={stopAllNotes} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">Panic</button>
        </div>
      </header>

      {/* MIDI Monitor Modal */}
      {showMidiMonitor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowMidiMonitor(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-[500px] max-h-[600px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">MIDI Monitor</h2>
              <div className="flex gap-2">
                <button onClick={() => setMidiLogs([])} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-bold rounded-lg">Clear</button>
                <button onClick={() => setShowMidiMonitor(false)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-bold rounded-lg">Close</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Press any MIDI key to see input data. Last 20 entries shown.</p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
              {midiLogs.length === 0 ? (
                <div className="text-center text-slate-600 py-8 text-sm">No MIDI input yet...</div>
              ) : (
                midiLogs.map(log => (
                  <div key={log.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono ${
                    log.type === 'noteon' ? 'bg-green-900/30 text-green-300' : 
                    log.type === 'noteoff' ? 'bg-slate-800/50 text-slate-400' : 
                    'bg-blue-900/30 text-blue-300'
                  }`}>
                    <span className="text-slate-500 w-16">{log.timestamp.toLocaleTimeString()}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      log.type === 'noteon' ? 'bg-green-600' : 
                      log.type === 'noteoff' ? 'bg-slate-600' : 
                      'bg-blue-600'
                    }`}>{log.type}</span>
                    <span className="text-slate-300">CH <span className="text-white font-bold">{log.channel}</span></span>
                    {log.note !== undefined && <span className="text-slate-300">Note <span className="text-white font-bold">{log.note}</span></span>}
                    {log.velocity !== undefined && log.type === 'noteon' && <span className="text-slate-300">Vel <span className="text-white font-bold">{log.velocity}</span></span>}
                    {log.cc !== undefined && <span className="text-slate-300">CC <span className="text-white font-bold">{log.cc}</span></span>}
                    {log.value !== undefined && log.type === 'cc' && <span className="text-slate-300">Val <span className="text-white font-bold">{log.value}</span></span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Navigation songs={project.songs} currentSongId={currentSongId} onSelectSong={setCurrentSongId} onUpdateProject={handleUpdateProject} />
        <main className="flex-1 relative overflow-auto p-8 bg-slate-950 custom-scrollbar">
          {activeTab === 'editor' && <Editor song={currentSong} onUpdateSong={handleUpdateSong} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} selectedInputId={project.selectedInputId} />}
          {activeTab === 'performance' && <Performance song={currentSong} activeNotes={activeMidiNotes} stepPositions={stepPositions} onTrigger={handleActionTrigger} selectedInputId={project.selectedInputId} onUpdateSong={handleUpdateSong} ccStates={ccStates} />}
          {activeTab === 'settings' && <Settings project={project} onUpdateProject={handleUpdateProject} />}
        </main>
      </div>
    </div>
  );
};

export default App;
