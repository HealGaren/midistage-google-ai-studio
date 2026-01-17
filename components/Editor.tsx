
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Song, NotePreset, Sequence, InputMapping, SequenceMode, SequenceItem, NoteItem, DurationUnit, GlissandoConfig, GlissandoMode, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface EditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiToNoteName = (midi: number) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};

const SNAP_OPTIONS = [
  { label: '4 Beats', value: 4.0 },
  { label: '3 Beats', value: 3.0 },
  { label: '2 Beats', value: 2.0 },
  { label: '1 Beat', value: 1.0 },
  { label: '1/2 (Half)', value: 0.5 },
  { label: '1/3 (Triplet)', value: 1 / 3 },
  { label: '1/4 (Quarter)', value: 0.25 },
  { label: '1/6 (Triplet)', value: 1 / 6 },
  { label: '1/8 (8th)', value: 0.125 },
  { label: '1/16 (16th)', value: 0.0625 },
];

const DEFAULT_GLISSANDO: GlissandoConfig = {
  attackEnabled: false,
  releaseEnabled: false,
  lowestNote: 48,
  targetNote: 72,
  speed: 10,
  mode: 'white',
  lowestVelocity: 0.2,
  targetVelocity: 0.8
};

const UnitSelector: React.FC<{ value: DurationUnit, onChange: (u: DurationUnit) => void }> = ({ value, onChange }) => (
  <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
    <button onClick={() => onChange('ms')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'ms' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>ms</button>
    <button onClick={() => onChange('beat')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'beat' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>beat</button>
  </div>
);

const KeyboardVisualizer: React.FC<{
  notes: NoteItem[];
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}> = ({ notes, sendNoteOn, sendNoteOff }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [testChannel, setTestChannel] = useState(1);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  const activePitches = useMemo(() => notes.map(n => n.pitch), [notes]);
  const minPitch = activePitches.length > 0 ? Math.min(...activePitches) : 48;
  const displayStart = Math.max(0, Math.floor(minPitch / 12) * 12 - 12);
  const displayEnd = Math.min(127, displayStart + 48);

  const keys = useMemo(() => {
    const arr = [];
    for (let p = displayStart; p <= displayEnd; p++) {
      const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
      const isPresetActive = activePitches.includes(p);
      const isCurrentlyPlaying = activeKeys.has(p);
      arr.push({ pitch: p, isBlack, isPresetActive, isCurrentlyPlaying });
    }
    return arr;
  }, [displayStart, displayEnd, activePitches, activeKeys]);

  const handleKeyPress = (pitch: number) => {
    sendNoteOn(pitch, 0.8, testChannel, null);
    setActiveKeys(prev => new Set(prev).add(pitch));
  };

  const handleKeyRelease = (pitch: number) => {
    sendNoteOff(pitch, testChannel);
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.delete(pitch);
      return next;
    });
  };

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl overflow-hidden group">
      <div className="flex items-center justify-between mb-4 px-2">
        <h5 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Keyboard Monitor</h5>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
          <span className="text-[8px] font-black text-slate-500 uppercase">Output Ch</span>
          <select value={testChannel} onChange={(e) => setTestChannel(parseInt(e.target.value))} className="bg-transparent text-[10px] font-black text-indigo-400 focus:outline-none cursor-pointer">
            {Array.from({ length: 16 }).map((_, i) => <option key={i + 1} value={i + 1} className="bg-slate-900">{i + 1}</option>)}
          </select>
        </div>
      </div>
      <div ref={scrollRef} className="relative h-24 overflow-x-auto overflow-y-hidden pb-1 custom-scrollbar">
        <div className="flex relative h-20 select-none">
          {keys.map((k) => (
            <div key={k.pitch} onMouseDown={() => handleKeyPress(k.pitch)} onMouseUp={() => handleKeyRelease(k.pitch)} onMouseLeave={() => k.isCurrentlyPlaying && handleKeyRelease(k.pitch)}
              className={`flex-shrink-0 relative transition-all duration-100 cursor-pointer ${k.isBlack ? 'w-4 h-12 -mx-2 z-10 rounded-b border border-slate-800' : 'w-7 h-20 z-0 rounded-b border border-slate-800'} ${k.isBlack ? (k.isCurrentlyPlaying ? 'bg-indigo-400' : k.isPresetActive ? 'bg-indigo-600' : 'bg-slate-900') : (k.isCurrentlyPlaying ? 'bg-indigo-300' : k.isPresetActive ? 'bg-indigo-600 border-indigo-400' : 'bg-white')}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const CompactItemEditor: React.FC<{ 
  item: SequenceItem, 
  presets: NotePreset[], 
  onUpdate: (updates: Partial<SequenceItem>) => void, 
  onDelete: () => void,
  isStepView?: boolean
}> = ({ item, presets, onUpdate, onDelete, isStepView }) => {
  return (
    <div className={`${isStepView ? 'w-full' : 'bg-slate-900 p-5 rounded-2xl border border-indigo-500 shadow-2xl w-64 ring-4 ring-slate-950/80 pointer-events-auto'} space-y-4`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          <button onClick={() => onUpdate({ type: 'preset' })} className={`px-2.5 py-1 text-[8px] font-black uppercase rounded ${item.type === 'preset' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Preset</button>
          <button onClick={() => onUpdate({ type: 'note', noteData: item.noteData || { pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: 500, durationUnit: 'ms' } })} className={`px-2.5 py-1 text-[8px] font-black uppercase rounded ${item.type === 'note' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Note</button>
        </div>
        <button onClick={onDelete} className="text-rose-500 p-1 hover:bg-rose-500/10 rounded transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
      <div className="space-y-4">
        {item.type === 'preset' ? (
          <div className="space-y-1">
            <span className="text-[7px] text-slate-500 uppercase font-black">Target Preset</span>
            <select value={item.targetId || ''} onChange={(e) => onUpdate({ targetId: e.target.value })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full">
              <option value="">None</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[7px] text-slate-500 uppercase font-black">Pitch</span>
              <input type="number" min="0" max="127" value={item.noteData?.pitch} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, pitch: parseInt(e.target.value) || 0 }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[7px] text-slate-500 uppercase font-black">Velocity</span>
              <input type="number" step="0.1" value={item.noteData?.velocity} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, velocity: parseFloat(e.target.value) || 0.8 }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none" />
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[7px] text-slate-500 uppercase font-black">Duration Override</span>
            <UnitSelector value={item.overrideDurationUnit || 'ms'} onChange={(u) => onUpdate({ overrideDurationUnit: u })} />
          </div>
          <input 
            type="number" 
            step={item.overrideDurationUnit === 'beat' ? 0.25 : 1} 
            placeholder="Hold until release" 
            value={item.overrideDuration === null ? '' : item.overrideDuration} 
            onChange={(e) => onUpdate({ overrideDuration: e.target.value === '' ? null : parseFloat(e.target.value)})} 
            className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none placeholder:text-slate-600" 
          />
        </div>

        {!isStepView && (
          <div className="flex flex-col gap-1 pt-1 border-t border-slate-800">
            <span className="text-[7px] text-slate-500 uppercase font-black">Beat Position</span>
            <input type="number" step="0.25" value={item.beatPosition} onChange={(e) => onUpdate({ beatPosition: parseFloat(e.target.value) || 0 })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full" />
          </div>
        )}
      </div>
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ song, onUpdateSong, sendNoteOn, sendNoteOff }) => {
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'sequences' | 'mappings'>('presets');
  const [presetEditorTab, setPresetEditorTab] = useState<'notes' | 'glissando'>('notes');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(song.presets?.[0]?.id || null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(song.sequences?.[0]?.id || null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [hoverBeat, setHoverBeat] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const BEAT_WIDTH = 120; // 1 beat = 120px
  const SIDE_PADDING = 32; // px

  const updatePreset = useCallback((id: string, updates: Partial<NotePreset>) => {
    onUpdateSong({ ...song, presets: song.presets.map(p => p.id === id ? { ...p, ...updates } : p) });
  }, [song, onUpdateSong]);

  const updateSequence = useCallback((id: string, updates: Partial<Sequence>) => {
    onUpdateSong({ ...song, sequences: song.sequences.map(s => s.id === id ? { ...s, ...updates } : s) });
  }, [song, onUpdateSong]);

  const duplicatePreset = useCallback((preset: NotePreset) => {
    const newPreset = JSON.parse(JSON.stringify(preset));
    newPreset.id = uuidv4();
    newPreset.name = preset.name + " (Copy)";
    onUpdateSong({ ...song, presets: [...song.presets, newPreset] });
  }, [song, onUpdateSong]);

  const duplicateSequence = useCallback((seq: Sequence) => {
    const newSeq = JSON.parse(JSON.stringify(seq));
    newSeq.id = uuidv4();
    newSeq.name = seq.name + " (Copy)";
    onUpdateSong({ ...song, sequences: [...song.sequences, newSeq] });
  }, [song, onUpdateSong]);

  const deleteSequence = useCallback((id: string) => {
    onUpdateSong({ ...song, sequences: song.sequences.filter(s => s.id !== id) });
    if (selectedSequenceId === id) setSelectedSequenceId(song.sequences.find(s => s.id !== id)?.id || null);
  }, [song, selectedSequenceId, onUpdateSong]);

  const moveItem = useCallback(<T extends { id: string }>(items: T[], index: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return items;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    return newItems;
  }, []);

  const addFolder = useCallback(() => {
    const newFolder: PresetFolder = { id: uuidv4(), name: "New Folder" };
    onUpdateSong({ ...song, presetFolders: [...(song.presetFolders || []), newFolder] });
    setRenamingFolderId(newFolder.id);
  }, [song, onUpdateSong]);

  const updateFolderName = useCallback((id: string, name: string) => {
    onUpdateSong({
      ...song,
      presetFolders: (song.presetFolders || []).map(f => f.id === id ? { ...f, name } : f)
    });
  }, [song, onUpdateSong]);

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const selectedPreset = song.presets.find(p => p.id === selectedPresetId);
  const selectedSequence = song.sequences.find(s => s.id === selectedSequenceId);

  // --- Stacking (Laning) Logic for AUTO Timeline ---
  const timelineItemsWithLanes = useMemo(() => {
    if (!selectedSequence || selectedSequence.mode !== SequenceMode.AUTO) return [];
    
    // Sort items by start time
    const sorted = [...selectedSequence.items].sort((a, b) => a.beatPosition - b.beatPosition);
    
    // Helper to estimate duration in beats
    const getDurationInBeats = (item: SequenceItem) => {
      if (item.overrideDuration !== null && item.overrideDurationUnit === 'beat') return item.overrideDuration;
      if (item.overrideDuration !== null && item.overrideDurationUnit === 'ms') {
        const msPerBeat = 60000 / (song.bpm || 120);
        return item.overrideDuration / msPerBeat;
      }
      return 1.0; // Default visual width for stacking
    };

    const lanes: number[] = []; 
    return sorted.map(item => {
      const start = item.beatPosition;
      const duration = getDurationInBeats(item);
      const end = start + duration;
      
      let laneIndex = 0;
      while (lanes[laneIndex] > start) {
        laneIndex++;
      }
      lanes[laneIndex] = end + 0.05; // tiny buffer
      
      return { ...item, lane: laneIndex, durationBeats: duration };
    });
  }, [selectedSequence, song.bpm]);

  const handleTimelineMouseMove = (e: React.MouseEvent) => {
    if (!timelineRef.current || !selectedSequence) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const rawBeat = (x - SIDE_PADDING) / BEAT_WIDTH; 
    const snap = selectedSequence.gridSnap || 1.0;
    const snappedBeat = Math.max(0, Math.round(rawBeat / snap) * snap);
    setHoverBeat(snappedBeat);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (hoverBeat === null || !selectedSequence) return;
    
    const isGrid = (e.target as HTMLElement).classList.contains('timeline-grid-surface');
    const isLayer = (e.target as HTMLElement).classList.contains('timeline-items-layer');
    
    if (!isGrid && !isLayer) return;

    const newItem: SequenceItem = {
      id: uuidv4(),
      type: 'preset',
      targetId: song.presets[0]?.id || '',
      beatPosition: hoverBeat,
      overrideDuration: null,
      overrideDurationUnit: 'ms'
    };
    updateSequence(selectedSequence.id, { items: [...selectedSequence.items, newItem] });
    setEditingItemId(newItem.id);
  };

  const renderPresetItem = (p: NotePreset, index: number, list: NotePreset[]) => (
    <div key={p.id} onClick={() => setSelectedPresetId(p.id)} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${selectedPresetId === p.id ? 'bg-indigo-600/15 border-indigo-500/50' : 'border-transparent text-slate-400 hover:bg-slate-800/50'}`}>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold truncate pr-1">{p.name}</span>
        <span className="text-[8px] font-black uppercase opacity-40">{p.notes.length} Notes</span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button onClick={(e) => { e.stopPropagation(); duplicatePreset(p); }} className="p-1 hover:text-indigo-400" title="Duplicate"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" /></svg></button>
        <div className="flex flex-col">
          <button onClick={(e) => { e.stopPropagation(); onUpdateSong({ ...song, presets: moveItem(song.presets, song.presets.indexOf(p), 'up') }); }} className="hover:text-white" disabled={index === 0}><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg></button>
          <button onClick={(e) => { e.stopPropagation(); onUpdateSong({ ...song, presets: moveItem(song.presets, song.presets.indexOf(p), 'down') }); }} className="hover:text-white" disabled={index === list.length - 1}><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg></button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <input type="text" value={song.name} onChange={(e) => onUpdateSong({ ...song, name: e.target.value })} className="bg-transparent text-3xl font-black focus:outline-none border-b-2 border-transparent focus:border-indigo-600 transition-colors py-1 flex-1" />
          <div className="bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 shadow-lg"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPM: {song.bpm}</span></div>
        </div>
        <div className="flex gap-8 border-b border-slate-800">
          {(['presets', 'sequences', 'mappings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSubTab(tab)} className={`pb-3 px-1 text-xs font-black uppercase tracking-widest relative transition-all ${activeSubTab === tab ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab} {activeSubTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {activeSubTab === 'presets' && (
          <div className="flex h-full gap-6">
            <div className="w-72 flex flex-col gap-3 bg-slate-900/40 rounded-2xl p-4 border border-slate-800 overflow-y-auto custom-scrollbar shadow-inner">
              <div className="flex gap-2">
                <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, presets: [...song.presets, {id, name: "New Preset", notes: []}]}); setSelectedPresetId(id); }} className="flex-1 py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg">+ Preset</button>
                <button onClick={addFolder} className="px-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors" title="New Folder"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
              </div>

              <div className="space-y-1">
                {song.presets.filter(p => !p.folderId).map((p, i, arr) => renderPresetItem(p, i, arr))}
              </div>
              {(song.presetFolders || []).map(folder => (
                <div key={folder.id} className="space-y-1 mt-2">
                  <div className="flex items-center justify-between px-2 py-1 group bg-slate-800/20 rounded-lg">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button onClick={() => toggleFolder(folder.id)} className={`transition-transform ${expandedFolders.has(folder.id) ? 'rotate-90 text-indigo-400' : 'text-slate-500'}`}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      {renamingFolderId === folder.id ? (
                        <input autoFocus className="bg-slate-900 text-[10px] font-black text-indigo-400 uppercase outline-none px-1 border-b border-indigo-500 w-full" value={folder.name} onChange={(e) => updateFolderName(folder.id, e.target.value)} onBlur={() => setRenamingFolderId(null)} onKeyDown={(e) => e.key === 'Enter' && setRenamingFolderId(null)} />
                      ) : (
                        <button onClick={() => toggleFolder(folder.id)} onDoubleClick={() => setRenamingFolderId(folder.id)} className="text-[10px] font-black text-slate-500 uppercase hover:text-indigo-400 transition-colors truncate flex-1 text-left">{folder.name}</button>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => setRenamingFolderId(folder.id)} className="text-slate-600 hover:text-indigo-400 p-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                      <button onClick={() => onUpdateSong({ ...song, presetFolders: (song.presetFolders || []).filter(f => f.id !== folder.id), presets: song.presets.map(p => p.folderId === folder.id ? {...p, folderId: null} : p) })} className="text-slate-600 hover:text-rose-500 p-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  </div>
                  {expandedFolders.has(folder.id) && (
                    <div className="pl-3 space-y-1 border-l border-slate-800 ml-1.5 mt-1">
                      {song.presets.filter(p => p.folderId === folder.id).map((p, i, arr) => renderPresetItem(p, i, arr))}
                      {song.presets.filter(p => p.folderId === folder.id).length === 0 && <div className="py-2 text-[8px] text-slate-700 font-bold uppercase tracking-widest text-center italic">Empty</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 overflow-y-auto shadow-2xl flex flex-col gap-6 custom-scrollbar">
              {selectedPreset ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col flex-1 gap-1">
                       <input className="bg-transparent font-black text-2xl text-white focus:outline-none border-b border-transparent focus:border-slate-800 transition-all" value={selectedPreset.name} onChange={(e) => updatePreset(selectedPreset.id, { name: e.target.value })} />
                    </div>
                  </div>

                  <KeyboardVisualizer notes={selectedPreset.notes} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} />

                  <div className="flex flex-col gap-6">
                    <div className="flex gap-6 border-b border-slate-800/50 flex-shrink-0">
                       <button onClick={() => setPresetEditorTab('notes')} className={`pb-2 text-[10px] font-black uppercase tracking-widest relative ${presetEditorTab === 'notes' ? 'text-white' : 'text-slate-500'}`}>Notes ({selectedPreset.notes.length}){presetEditorTab === 'notes' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}</button>
                       <button onClick={() => setPresetEditorTab('glissando')} className={`pb-2 text-[10px] font-black uppercase tracking-widest relative ${presetEditorTab === 'glissando' ? 'text-white' : 'text-slate-500'}`}>Organ Glissando {(selectedPreset.glissando?.attackEnabled || selectedPreset.glissando?.releaseEnabled) && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block align-middle" />}{presetEditorTab === 'glissando' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}</button>
                    </div>

                    <div className="min-h-0 flex-1">
                      {presetEditorTab === 'notes' ? (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center"><h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Defined Notes</h4><button onClick={() => updatePreset(selectedPreset.id, { notes: [...selectedPreset.notes, { id: uuidv4(), pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }] })} className="text-[9px] bg-indigo-600 px-4 py-2 rounded-xl font-black uppercase text-white hover:bg-indigo-500 shadow-lg">+ Add Note</button></div>
                          <div className="grid grid-cols-1 gap-2">
                            {selectedPreset.notes.map(note => (
                              <div key={note.id} className="grid grid-cols-[110px_1fr_1fr_1fr_120px_40px] gap-4 bg-slate-800/15 p-3.5 rounded-2xl items-center border border-slate-800/50 group/note hover:bg-slate-800/25 transition-all">
                                <div className="flex flex-col"><span className="text-[8px] text-slate-600 font-black uppercase">Pitch</span><div className="flex items-center gap-2"><input type="number" min="0" max="127" value={note.pitch} onChange={(e) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, pitch: parseInt(e.target.value) || 0} : n) })} className="w-14 bg-slate-900 p-1 rounded text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 transition-all" /><span className="text-[10px] font-black text-indigo-400 w-8">{midiToNoteName(note.pitch)}</span></div></div>
                                <div className="flex flex-col"><span className="text-[8px] text-slate-600 font-black uppercase">Velocity</span><input type="number" value={note.velocity} step="0.1" onChange={(e) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, velocity: parseFloat(e.target.value) || 0} : n) })} className="bg-slate-900 p-1 rounded text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                                <div className="flex flex-col"><span className="text-[8px] text-slate-600 font-black uppercase">Channel</span><input type="number" value={note.channel} onChange={(e) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, channel: parseInt(e.target.value) || 1} : n) })} className="bg-slate-900 p-1 rounded text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                                <div className="flex flex-col"><span className="text-[8px] text-slate-600 font-black uppercase">Delay (ms)</span><input type="number" value={note.preDelay} onChange={(e) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, preDelay: parseInt(e.target.value) || 0} : n) })} className="bg-slate-900 p-1 rounded text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 transition-all" /></div>
                                <div className="flex flex-col gap-1"><div className="flex items-center justify-between"><span className="text-[8px] text-slate-600 font-black uppercase">Duration</span><UnitSelector value={note.durationUnit} onChange={(u) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, durationUnit: u} : n) })} /></div><input type="number" step={note.durationUnit === 'beat' ? 0.25 : 1} placeholder="Hold until release" value={note.duration === null ? '' : note.duration} onChange={(e) => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.map(n => n.id === note.id ? {...n, duration: e.target.value === '' ? null : parseFloat(e.target.value)} : n) })} className="bg-slate-900 p-1 rounded text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-700" /></div>
                                <button onClick={() => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.filter(n => n.id !== note.id) })} className="text-slate-600 hover:text-rose-500 transition-colors flex justify-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-800/10 p-8 rounded-3xl border border-slate-800 space-y-8">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                             <div><h4 className="text-lg font-black text-white">Organ Glissando Configuration</h4><p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Automatic slide before attack or after release</p></div>
                             <div className="flex gap-6"><label className="flex items-center gap-3 cursor-pointer group"><span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-400 transition-colors uppercase">Attack Gliss</span><input type="checkbox" checked={selectedPreset.glissando?.attackEnabled || false} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), attackEnabled: e.target.checked }})} className="w-5 h-5 accent-indigo-500 rounded cursor-pointer" /></label><label className="flex items-center gap-3 cursor-pointer group"><span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-400 transition-colors uppercase">Release Gliss</span><input type="checkbox" checked={selectedPreset.glissando?.releaseEnabled || false} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), releaseEnabled: e.target.checked }})} className="w-5 h-5 accent-indigo-500 rounded cursor-pointer" /></label></div>
                          </div>
                          {(selectedPreset.glissando?.attackEnabled || selectedPreset.glissando?.releaseEnabled) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                               <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pitch Range</label><div className="flex items-center gap-2"><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">LOWEST</span><input type="number" value={selectedPreset.glissando?.lowestNote ?? 48} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), lowestNote: parseInt(e.target.value) || 0 }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold outline-none focus:border-indigo-500" /></div><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">TARGET</span><input type="number" value={selectedPreset.glissando?.targetNote ?? 72} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), targetNote: parseInt(e.target.value) || 0 }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold outline-none focus:border-indigo-500" /></div></div></div>
                               <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Speed & Timing</label><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">MS PER STEP</span><input type="number" value={selectedPreset.glissando?.speed ?? 10} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), speed: parseInt(e.target.value) || 1 }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold outline-none focus:border-indigo-500" /></div></div>
                               <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Note Filter</label><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">MODE</span><select value={selectedPreset.glissando?.mode ?? 'white'} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), mode: e.target.value as GlissandoMode }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold focus:border-indigo-500 outline-none cursor-pointer"><option value="white">White Keys</option><option value="black">Black Keys</option><option value="both">Chromatic</option></select></div></div>
                               <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Velocity Scaling</label><div className="flex items-center gap-2"><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">START</span><input type="number" step="0.05" value={selectedPreset.glissando?.lowestVelocity ?? 0.2} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), lowestVelocity: parseFloat(e.target.value) || 0 }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold outline-none focus:border-indigo-500" /></div><div className="flex-1"><span className="text-[8px] text-slate-600 font-black block mb-1">END</span><input type="number" step="0.05" value={selectedPreset.glissando?.targetVelocity ?? 0.8} onChange={(e) => updatePreset(selectedPreset.id, { glissando: { ...(selectedPreset.glissando || DEFAULT_GLISSANDO), targetVelocity: parseFloat(e.target.value) || 0 }})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-sm font-bold outline-none focus:border-indigo-500" /></div></div></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50"><p className="text-2xl font-black uppercase tracking-[0.3em]">MidiStage</p><p className="text-[10px] font-bold uppercase tracking-widest mt-2">Select a preset to begin editing</p></div>}
            </div>
          </div>
        )}

        {activeSubTab === 'sequences' && (
          <div className="flex h-full gap-6">
            <div className="w-72 flex flex-col gap-3 bg-slate-900/40 rounded-2xl p-4 border border-slate-800 overflow-y-auto shadow-inner custom-scrollbar">
              <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, sequences: [...song.sequences, {id, name: "New Sequence", mode: SequenceMode.STEP, items: [], gridSnap: 1.0}]}); setSelectedSequenceId(id); }} className="w-full py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg">+ Sequence</button>
              {song.sequences.map((s) => (
                <div key={s.id} onClick={() => setSelectedSequenceId(s.id)} className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${selectedSequenceId === s.id ? 'bg-indigo-600/15 border-indigo-500/50' : 'border-transparent text-slate-400 hover:bg-slate-800/50'}`}>
                  <div className="flex flex-col min-w-0"><span className="text-xs font-bold truncate pr-1">{s.name}</span><span className="text-[8px] font-black uppercase opacity-40">{s.mode}</span></div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={(e) => { e.stopPropagation(); duplicateSequence(s); }} className="p-1 hover:text-indigo-400" title="Duplicate"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" /></svg></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSequence(s.id); }} className="p-1 hover:text-rose-500" title="Delete"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 flex flex-col min-w-0 shadow-2xl overflow-hidden relative">
              {selectedSequence ? (
                <>
                  <div className="flex items-center justify-between mb-8 flex-shrink-0">
                    <input className="bg-transparent font-black text-3xl text-white focus:outline-none w-full max-w-md border-b border-transparent focus:border-slate-800 transition-all" value={selectedSequence.name} onChange={(e) => updateSequence(selectedSequence.id, { name: e.target.value })} />
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-slate-500 uppercase mb-1">Grid Snap</span>
                        <select value={selectedSequence.gridSnap || 1.0} onChange={(e) => updateSequence(selectedSequence.id, { gridSnap: parseFloat(e.target.value) })} className="bg-slate-800 text-[10px] font-black uppercase p-2 rounded-lg border border-slate-700 outline-none cursor-pointer hover:border-indigo-500">
                          {SNAP_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[8px] font-black text-slate-500 uppercase mb-1">Sequence Mode</span>
                        <select value={selectedSequence.mode} onChange={(e) => updateSequence(selectedSequence.id, { mode: e.target.value as SequenceMode })} className="bg-slate-800 text-[10px] font-black uppercase p-2 rounded-lg border border-slate-700 outline-none cursor-pointer hover:border-indigo-500 transition-colors">
                          <option value={SequenceMode.STEP}>Sequential (STEP)</option>
                          <option value={SequenceMode.AUTO}>Timeline (AUTO)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto custom-scrollbar relative">
                    {selectedSequence.mode === SequenceMode.STEP ? (
                      <div className="flex gap-4 p-4 min-h-[300px]">
                         {selectedSequence.items.map((item, idx) => (
                           <div key={item.id} className="flex-shrink-0 w-64 bg-slate-800/20 p-4 rounded-2xl relative border border-slate-800 hover:border-slate-700 transition-colors shadow-lg self-start">
                              <div className="absolute -top-3 -left-3 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-[12px] font-black shadow-xl z-10 ring-4 ring-slate-900">{idx + 1}</div>
                              <CompactItemEditor item={item} presets={song.presets} isStepView onUpdate={(u) => updateSequence(selectedSequence.id, { items: selectedSequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})} onDelete={() => updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id)})} />
                           </div>
                         ))}
                         <button onClick={() => updateSequence(selectedSequence.id, { items: [...selectedSequence.items, { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: selectedSequence.items.length, overrideDuration: null, overrideDurationUnit: 'ms' }] })} className="flex-shrink-0 w-20 h-40 border-2 border-dashed border-slate-800 rounded-2xl flex items-center justify-center text-slate-700 hover:text-indigo-500 hover:border-indigo-500 transition-all">+</button>
                      </div>
                    ) : (
                      <div 
                        ref={timelineRef}
                        onMouseMove={handleTimelineMouseMove}
                        onMouseLeave={() => setHoverBeat(null)}
                        onClick={handleTimelineClick}
                        className="relative min-w-[4800px] h-full min-h-[600px] bg-slate-950 rounded-3xl border border-slate-800 timeline-grid-surface cursor-crosshair overflow-hidden"
                        style={{
                          backgroundImage: `
                            linear-gradient(90deg, #1e293b 1px, transparent 1px),
                            linear-gradient(90deg, #334155 1px, transparent 1px)
                          `,
                          backgroundSize: `${BEAT_WIDTH / 4}px 100%, ${BEAT_WIDTH}px 100%`,
                          backgroundPosition: `${SIDE_PADDING}px 0`
                        }}
                      >
                        {/* Beat Labels */}
                        <div className="sticky top-0 h-8 flex z-10 pointer-events-none" style={{ marginLeft: SIDE_PADDING }}>
                          {Array.from({ length: 40 }).map((_, i) => (
                            <div key={i} className="flex-shrink-0 flex items-end justify-start" style={{ width: BEAT_WIDTH }}>
                              <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-tr">BEAT {i}</span>
                            </div>
                          ))}
                        </div>
                        
                        {/* Hover Preview Overlay */}
                        {hoverBeat !== null && (
                          <div 
                            className="absolute h-full bg-indigo-500/10 pointer-events-none z-0 border-l border-indigo-500/30" 
                            style={{ 
                              left: SIDE_PADDING + hoverBeat * BEAT_WIDTH, 
                              width: Math.max(BEAT_WIDTH * (selectedSequence.gridSnap || 1.0), 1) 
                            }}
                          >
                             <div className="absolute top-10 left-2 text-[9px] font-black text-indigo-400 uppercase whitespace-nowrap drop-shadow-md">
                               Click to Add @ {hoverBeat.toFixed(2)}
                             </div>
                          </div>
                        )}

                        {/* Timeline Items Layer (Stacking applied) */}
                        <div className="relative pt-12 min-h-full timeline-items-layer" style={{ paddingLeft: SIDE_PADDING }}>
                          {timelineItemsWithLanes.map((item) => {
                            const isEditing = editingItemId === item.id;
                            const targetPreset = song.presets.find(p => p.id === item.targetId);
                            const label = item.type === 'preset' ? (targetPreset?.name || "Select Preset") : `Note: ${midiToNoteName(item.noteData?.pitch || 0)}`;
                            const itemWidth = Math.max(BEAT_WIDTH * item.durationBeats, 80);
                            
                            return (
                              <div 
                                key={item.id} 
                                className="absolute pointer-events-auto transition-all" 
                                style={{ 
                                  left: SIDE_PADDING + item.beatPosition * BEAT_WIDTH, 
                                  top: 64 + (item.lane * 48), // 48px per lane height
                                  width: itemWidth
                                }}
                              >
                                <div 
                                  onClick={(e) => { e.stopPropagation(); setEditingItemId(isEditing ? null : item.id); }}
                                  className={`h-10 px-4 rounded-xl flex items-center gap-3 cursor-pointer border shadow-2xl transition-all overflow-hidden ${isEditing ? 'bg-indigo-600 border-indigo-300 z-50 ring-4 ring-indigo-500/40' : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-750 z-10'}`}
                                >
                                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.type === 'preset' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                                  <span className="text-[10px] font-black text-white truncate flex-1 uppercase tracking-tight">{label}</span>
                                  {item.overrideDuration !== null && <span className="text-[8px] bg-slate-950/80 px-2 py-0.5 rounded-full text-indigo-200 font-black flex-shrink-0 border border-indigo-500/30">{item.overrideDuration}{item.overrideDurationUnit}</span>}
                                  <button onClick={(e) => { e.stopPropagation(); updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id) }); }} className="p-1 hover:text-rose-400 transition-all flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                                </div>
                                
                                {isEditing && (
                                  <div className="absolute top-12 left-0 z-[100] animate-in zoom-in-95 fade-in slide-in-from-top-2 duration-200">
                                    <CompactItemEditor 
                                      item={item} 
                                      presets={song.presets} 
                                      onUpdate={(u) => updateSequence(selectedSequence.id, { items: selectedSequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})} 
                                      onDelete={() => { updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id) }); setEditingItemId(null); }} 
                                    />
                                    <div className="fixed inset-0 z-[-1] bg-black/5 backdrop-blur-none" onClick={() => setEditingItemId(null)} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : <div className="h-full flex items-center justify-center text-slate-700 font-black uppercase tracking-widest opacity-50">Select a sequence to begin editing</div>}
            </div>
          </div>
        )}

        {activeSubTab === 'mappings' && (
          <div className="h-full bg-slate-900 rounded-3xl border border-slate-800 p-10 flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-10"><div><h3 className="text-3xl font-black text-white">Input Mapping</h3><p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">Bind MIDI Controllers or Keyboard Keys to Actions</p></div><button onClick={() => onUpdateSong({ ...song, mappings: [...song.mappings, { id: uuidv4(), triggerType: 'keyboard', isRange: false, triggerValue: '', triggerChannel: 0, triggerStart: '', triggerEnd: '', actionType: 'preset', actionTargetId: '', isEnabled: true }] })} className="bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase text-[10px] hover:bg-indigo-500 shadow-lg">+ New Mapping</button></div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
              {song.mappings.map(map => (
                <div key={map.id} className={`grid grid-cols-[120px_200px_1fr_40px] gap-8 bg-slate-800/10 p-6 rounded-3xl items-center border border-slate-800/50 hover:bg-slate-800/20 transition-all ${!map.isEnabled && 'opacity-40 grayscale'}`}>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Trigger Type</span><select value={map.triggerType} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerType: e.target.value as any} : m)})} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500"><option value="keyboard">Keyboard</option><option value="midi">MIDI</option></select></div>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Source Value</span><input type="text" value={map.triggerValue} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: e.target.value} : m)})} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500" placeholder="Key or Pitch #" /></div>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Target Performance Unit</span><select value={map.actionTargetId} onChange={(e) => { const tid = e.target.value; const isS = song.sequences.some(s => s.id === tid); onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, actionTargetId: tid, actionType: isS ? 'sequence' : 'preset'} : m)}); }} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500"><option value="">Select Target...</option><optgroup label="Presets">{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup><optgroup label="Sequences">{song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select></div>
                   <button onClick={() => onUpdateSong({ ...song, mappings: song.mappings.filter(m => m.id !== map.id) })} className="text-slate-600 hover:text-rose-500 transition-colors flex justify-center"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
