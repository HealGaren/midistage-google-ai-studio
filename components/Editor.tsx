
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Song, NotePreset, Sequence, InputMapping, SequenceMode, SequenceItem, NoteItem, DurationUnit } from '../types';
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
  { label: '1/4 (Beat)', value: 1.0 },
  { label: '1/8 (8th)', value: 0.5 },
  { label: '1/12 (8th Triplet)', value: 1/3 },
  { label: '1/16 (16th)', value: 0.25 },
  { label: '1/24 (16th Triplet)', value: 1/6 },
  { label: '1/32 (32nd)', value: 0.125 },
];

interface KeyboardVisualizerProps {
  notes: NoteItem[];
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}

const KeyboardVisualizer: React.FC<KeyboardVisualizerProps> = ({ notes, sendNoteOn, sendNoteOff }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [testChannel, setTestChannel] = useState(1);
  const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());

  const activePitches = useMemo(() => notes.map(n => n.pitch), [notes]);
  const minPitch = activePitches.length > 0 ? Math.min(...activePitches) : 48;
  const maxPitch = activePitches.length > 0 ? Math.max(...activePitches) : 72;
  const displayStart = Math.max(0, Math.floor(minPitch / 12) * 12 - 12);
  const displayEnd = Math.min(127, Math.ceil(maxPitch / 12) * 12 + 12);

  useEffect(() => {
    if (scrollRef.current && activePitches.length > 0) {
      const firstActiveIdx = minPitch - displayStart;
      const keyWidth = 40;
      scrollRef.current.scrollLeft = (firstActiveIdx * keyWidth) - (scrollRef.current.clientWidth / 2) + keyWidth;
    }
  }, [displayStart, minPitch, activePitches]);

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
    <div className="relative bg-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl overflow-hidden group">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex items-center gap-4">
          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Chord Preview & Test</h5>
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            <span className="text-[8px] font-black text-slate-500 uppercase">Test Channel</span>
            <select 
              value={testChannel} 
              onChange={(e) => setTestChannel(parseInt(e.target.value))}
              className="bg-transparent text-[10px] font-black text-indigo-400 focus:outline-none cursor-pointer"
            >
              {Array.from({ length: 16 }).map((_, i) => (
                <option key={i + 1} value={i + 1} className="bg-slate-900">{i + 1}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          {activePitches.sort((a, b) => a - b).map(p => (
            <span key={p} className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              {midiToNoteName(p)}
            </span>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="relative h-48 overflow-x-auto overflow-y-hidden pb-2 custom-scrollbar">
        <div className="flex relative h-40 select-none">
          {keys.map((k) => (
            <div 
              key={k.pitch}
              onMouseDown={() => handleKeyPress(k.pitch)}
              onMouseUp={() => handleKeyRelease(k.pitch)}
              onMouseLeave={() => k.isCurrentlyPlaying && handleKeyRelease(k.pitch)}
              className={`flex-shrink-0 relative transition-all duration-150 cursor-pointer ${
                k.isBlack 
                  ? 'w-6 h-24 -mx-3 z-10 rounded-b-md border border-slate-800 shadow-lg' 
                  : 'w-10 h-40 z-0 rounded-b-lg border border-slate-800'
              } ${
                k.isBlack 
                  ? (k.isCurrentlyPlaying ? 'bg-indigo-400 border-white' : k.isPresetActive ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-900') 
                  : (k.isCurrentlyPlaying ? 'bg-indigo-300 border-white' : k.isPresetActive ? 'bg-indigo-600 border-indigo-400 shadow-[inset_0_-8px_0_rgba(255,255,255,0.1)]' : 'bg-white')
              }`}
            >
              {!k.isBlack && k.pitch % 12 === 0 && (
                <div className="absolute bottom-2 left-0 right-0 text-center text-[9px] font-black text-slate-400 pointer-events-none uppercase">{midiToNoteName(k.pitch)}</div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-center">
        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Click keys to play test sound on channel {testChannel}</p>
      </div>
    </div>
  );
};

const UnitSelector: React.FC<{ value: DurationUnit, onChange: (u: DurationUnit) => void }> = ({ value, onChange }) => (
  <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
    <button onClick={() => onChange('ms')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'ms' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>ms</button>
    <button onClick={() => onChange('beat')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'beat' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>beat</button>
  </div>
);

const CompactItemEditor: React.FC<{ 
  item: SequenceItem, 
  presets: NotePreset[], 
  onUpdate: (updates: Partial<SequenceItem>) => void, 
  onDelete: () => void,
  isStepView?: boolean
}> = ({ item, presets, onUpdate, onDelete, isStepView }) => {
  const selectedPreset = presets.find(p => p.id === item.targetId);
  const allNotesHaveDuration = selectedPreset?.notes.every(n => n.duration !== null) ?? false;

  return (
    <div className={`${isStepView ? 'w-full' : 'bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-2xl w-64'} space-y-4`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          <button onClick={() => onUpdate({ type: 'preset' })} className={`px-2 py-1 text-[8px] font-black uppercase rounded ${item.type === 'preset' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Preset</button>
          <button onClick={() => onUpdate({ type: 'note', noteData: item.noteData || { pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: 500, durationUnit: 'ms' } })} className={`px-2 py-1 text-[8px] font-black uppercase rounded ${item.type === 'note' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Note</button>
        </div>
        {!isStepView && <button onClick={onDelete} className="text-rose-500 p-1 hover:bg-rose-500/10 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
      </div>

      <div className="space-y-3">
        {!isStepView && (
          <div className="flex flex-col gap-1">
            <label className="text-[8px] text-slate-500 font-black uppercase">Start Beat Position</label>
            <input type="number" step="0.1" min="0" value={item.beatPosition} onChange={(e) => onUpdate({ beatPosition: parseFloat(e.target.value) || 0 })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full" />
          </div>
        )}

        {item.type === 'preset' ? (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-[8px] text-slate-500 font-black uppercase">Preset</label>
              <select value={item.targetId || ''} onChange={(e) => onUpdate({ targetId: e.target.value })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full">
                <option value="">None</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {!allNotesHaveDuration && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[8px] text-emerald-500 font-black uppercase tracking-tighter">Dur ({item.overrideDurationUnit || 'ms'})</label>
                  <UnitSelector value={item.overrideDurationUnit || 'ms'} onChange={(u) => onUpdate({ overrideDurationUnit: u })} />
                </div>
                <input type="number" step={item.overrideDurationUnit === 'beat' ? 0.25 : 1} value={item.overrideDuration ?? ''} placeholder="Hold" onChange={(e) => onUpdate({ overrideDuration: e.target.value === '' ? null : parseFloat(e.target.value) })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full" />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-slate-500 font-black uppercase">Pitch</label>
                <input type="number" value={item.noteData?.pitch} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, pitch: parseInt(e.target.value) || 0 }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[8px] text-slate-500 font-black uppercase">Dur</label>
                  <UnitSelector value={item.noteData?.durationUnit || 'ms'} onChange={(u) => onUpdate({ noteData: { ...item.noteData!, durationUnit: u }})} />
                </div>
                <input type="number" step={item.noteData?.durationUnit === 'beat' ? 0.25 : 1} value={item.noteData?.duration ?? ''} placeholder="Hold" onChange={(e) => onUpdate({ noteData: { ...item.noteData!, duration: e.target.value === '' ? null : parseFloat(e.target.value) }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TimelineItem: React.FC<{ 
  item: SequenceItem, 
  presets: NotePreset[], 
  onUpdate: (updates: Partial<SequenceItem>) => void, 
  onDelete: () => void,
  BEAT_WIDTH: number,
  lane: number
}> = ({ item, presets, onUpdate, onDelete, BEAT_WIDTH, lane }) => {
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsEditing(false);
    };
    if (isEditing) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  const getName = () => {
    if (item.type === 'preset') return presets.find(p => p.id === item.targetId)?.name || 'Empty Preset';
    return midiToNoteName(item.noteData?.pitch || 60);
  };

  const LANE_HEIGHT = 40;

  return (
    <div 
      ref={containerRef}
      className="absolute h-8 transition-all duration-300 ease-out"
      style={{ 
        left: `${item.beatPosition * BEAT_WIDTH}px`, 
        top: `${12 + (lane * LANE_HEIGHT)}px` 
      }}
    >
      <div 
        onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
        className={`h-full min-w-[50px] px-2.5 flex items-center justify-center rounded border-b-2 cursor-pointer select-none transition-all group shadow-lg ${item.type === 'preset' ? 'bg-indigo-600 border-indigo-800 hover:bg-indigo-500' : 'bg-emerald-600 border-emerald-800 hover:bg-emerald-500'} ${isEditing ? 'ring-2 ring-white scale-105 z-30' : 'z-10'}`}
      >
        <span className="text-[9px] font-black uppercase tracking-tighter truncate whitespace-nowrap text-white">
          {getName()}
        </span>
      </div>

      {isEditing && (
        <div className="absolute top-full mt-2 left-0 z-40 animate-in fade-in zoom-in-95 origin-top-left">
          <CompactItemEditor item={item} presets={presets} onUpdate={onUpdate} onDelete={onDelete} />
        </div>
      )}
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ song, onUpdateSong, sendNoteOn, sendNoteOff }) => {
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'sequences' | 'mappings'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(song.presets[0]?.id || null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(song.sequences[0]?.id || null);
  const [hoverBeat, setHoverBeat] = useState<number | null>(null);

  const updatePreset = (id: string, updates: Partial<NotePreset>) => {
    onUpdateSong({ ...song, presets: song.presets.map(p => p.id === id ? { ...p, ...updates } : p) });
  };
  const updateNote = (presetId: string, noteId: string, updates: Partial<NoteItem>) => {
    const preset = song.presets.find(p => p.id === presetId);
    if (!preset) return;
    updatePreset(presetId, { notes: preset.notes.map(n => n.id === noteId ? { ...n, ...updates } : n) });
  };
  const updateSequence = (id: string, updates: Partial<Sequence>) => {
    onUpdateSong({ ...song, sequences: song.sequences.map(s => s.id === id ? { ...s, ...updates } : s) });
  };

  const selectedPreset = song.presets.find(p => p.id === selectedPresetId);
  const selectedSequence = song.sequences.find(s => s.id === selectedSequenceId);

  const BEAT_WIDTH = 120;
  const TIMELINE_BEATS = 64;
  const currentSnap = selectedSequence?.gridSnap || 0.25;

  const itemLanes = useMemo(() => {
    if (!selectedSequence) return {};
    const lanes: Record<string, number> = {};
    const itemsInLanes: SequenceItem[][] = [];
    const sortedItems = [...selectedSequence.items].sort((a, b) => a.beatPosition - b.beatPosition);
    
    sortedItems.forEach(item => {
      let laneIndex = 0;
      while (true) {
        if (!itemsInLanes[laneIndex]) {
          itemsInLanes[laneIndex] = [item];
          lanes[item.id] = laneIndex;
          break;
        }
        const hasOverlap = itemsInLanes[laneIndex].some(other => 
          Math.abs(other.beatPosition - item.beatPosition) < 0.6
        );
        if (!hasOverlap) {
          itemsInLanes[laneIndex].push(item);
          lanes[item.id] = laneIndex;
          break;
        }
        laneIndex++;
      }
    });
    return lanes;
  }, [selectedSequence]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedSequence) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const rawBeat = x / BEAT_WIDTH;
    const beat = Math.round(rawBeat / currentSnap) * currentSnap;
    
    updateSequence(selectedSequence.id, {
      items: [
        ...selectedSequence.items,
        {
          id: uuidv4(),
          type: 'preset',
          targetId: song.presets[0]?.id || '',
          beatPosition: beat,
          overrideDuration: null,
          overrideDurationUnit: 'ms'
        }
      ]
    });
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const beat = Math.round((x / BEAT_WIDTH) / currentSnap) * currentSnap;
    // Round for display cleanup
    setHoverBeat(Math.round(beat * 1000) / 1000);
  };

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <input type="text" value={song.name} onChange={(e) => onUpdateSong({ ...song, name: e.target.value })} className="bg-transparent text-3xl font-black focus:outline-none border-b-2 border-transparent focus:border-indigo-600 transition-colors py-1 flex-1" />
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-800 shadow-2xl">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">GLOBAL BPM</span>
            <input type="number" value={song.bpm} onChange={(e) => onUpdateSong({ ...song, bpm: parseInt(e.target.value) || 120 })} className="w-16 bg-slate-800 rounded-xl px-2 py-1 text-sm font-bold focus:outline-none text-center" />
          </div>
        </div>
        <div className="flex gap-8 border-b border-slate-800">
          {(['presets', 'sequences', 'mappings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSubTab(tab)} className={`pb-3 px-1 text-xs font-black uppercase tracking-widest transition-all relative ${activeSubTab === tab ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab}
              {activeSubTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 rounded-full"></div>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {activeSubTab === 'presets' && (
          <div className="flex h-full gap-6">
            <div className="w-72 flex flex-col gap-2 bg-slate-900/40 rounded-2xl p-4 border border-slate-800 overflow-y-auto shadow-inner">
              <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, presets: [...song.presets, {id, name: "New Preset", notes: []}]}); setSelectedPresetId(id); }} className="w-full py-4 mb-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">+ New Preset</button>
              {song.presets.map(p => (
                <div key={p.id} onClick={() => setSelectedPresetId(p.id)} className={`group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all border ${selectedPresetId === p.id ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-100' : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800'}`}>
                  <div className="flex flex-col min-w-0"><span className="text-sm font-bold truncate pr-1">{p.name}</span><span className="text-[9px] font-black uppercase opacity-40">{p.notes.length} Notes</span></div>
                  <button onClick={(e) => { e.stopPropagation(); const next = song.presets.filter(x => x.id !== p.id); onUpdateSong({...song, presets: next}); if(selectedPresetId===p.id) setSelectedPresetId(next[0]?.id || null); }} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-rose-500 transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
            </div>
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 overflow-y-auto shadow-2xl flex flex-col gap-8">
              {selectedPreset ? (
                <>
                  <input className="bg-transparent font-black text-3xl text-white focus:outline-none w-full border-b border-transparent focus:border-slate-800 pb-1" value={selectedPreset.name} onChange={(e) => updatePreset(selectedPreset.id, { name: e.target.value })} />
                  <KeyboardVisualizer notes={selectedPreset.notes} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} />
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Note List</h4>
                      <button onClick={() => updatePreset(selectedPreset.id, { notes: [...selectedPreset.notes, { id: uuidv4(), pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }] })} className="text-[10px] bg-indigo-600 px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-white">+ Add Note</button>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedPreset.notes.map(note => (
                        <div key={note.id} className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_50px] gap-6 bg-slate-800/20 p-5 rounded-2xl border border-slate-800/50 items-center">
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Pitch</label><div className="flex items-center gap-2"><input type="number" value={note.pitch} onChange={(e) => updateNote(selectedPreset.id, note.id, { pitch: parseInt(e.target.value) || 0 })} className="w-12 bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /><span className="text-xs font-black text-indigo-400 w-8">{midiToNoteName(note.pitch)}</span></div></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Velocity</label><input type="number" step="0.05" value={note.velocity} onChange={(e) => updateNote(selectedPreset.id, note.id, { velocity: parseFloat(e.target.value) || 0 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Channel</label><input type="number" value={note.channel} onChange={(e) => updateNote(selectedPreset.id, note.id, { channel: parseInt(e.target.value) || 1 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Pre-Delay</label><input type="number" value={note.preDelay} onChange={(e) => updateNote(selectedPreset.id, note.id, { preDelay: parseInt(e.target.value) || 0 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-2">Duration {note.duration === null && <span className="bg-emerald-500/20 text-emerald-400 px-1 rounded text-[7px] border border-emerald-500/30">HOLD</span>}</label>
                              <UnitSelector value={note.durationUnit} onChange={(u) => updateNote(selectedPreset.id, note.id, { durationUnit: u })} />
                            </div>
                            <input type="number" step={note.durationUnit === 'beat' ? 0.25 : 1} placeholder="HOLD" value={note.duration === null ? '' : note.duration} onChange={(e) => updateNote(selectedPreset.id, note.id, { duration: e.target.value === '' ? null : parseFloat(e.target.value) })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none placeholder:text-slate-700" />
                          </div>
                          <button onClick={() => updatePreset(selectedPreset.id, { notes: selectedPreset.notes.filter(n => n.id !== note.id) })} className="p-2.5 text-slate-600 hover:text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40"><p className="text-lg font-black uppercase tracking-[0.3em]">Select a preset</p></div>}
            </div>
          </div>
        )}
        {activeSubTab === 'sequences' && (
          <div className="flex h-full gap-6">
            <div className="w-72 flex flex-col gap-2 bg-slate-900/40 rounded-2xl p-4 border border-slate-800 overflow-y-auto shadow-inner">
              <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, sequences: [...song.sequences, {id, name: "New Sequence", mode: SequenceMode.STEP, items: []}]}); setSelectedSequenceId(id); }} className="w-full py-4 mb-3 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-indigo-500 shadow-lg">+ New Sequence</button>
              {song.sequences.map(s => (
                <div key={s.id} onClick={() => setSelectedSequenceId(s.id)} className={`group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border transition-all ${selectedSequenceId === s.id ? 'bg-indigo-600/10 border-indigo-500/50' : 'border-transparent text-slate-400 hover:bg-slate-800'}`}>
                  <div className="flex flex-col min-w-0"><span className="text-sm font-bold truncate pr-1">{s.name}</span><span className="text-[9px] font-black uppercase opacity-40">{s.mode} Mode</span></div>
                  <button onClick={(e) => { e.stopPropagation(); const next = song.sequences.filter(x => x.id !== s.id); onUpdateSong({...song, sequences: next}); if(selectedSequenceId===s.id) setSelectedSequenceId(next[0]?.id || null); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
            </div>
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 overflow-y-auto shadow-2xl flex flex-col min-w-0">
              {selectedSequence ? (
                <>
                  <div className="flex items-center justify-between mb-8 flex-shrink-0">
                    <div className="flex items-center gap-4">
                      <input className="bg-transparent font-black text-3xl text-white focus:outline-none w-full max-w-md border-b border-transparent focus:border-slate-700" value={selectedSequence.name} onChange={(e) => updateSequence(selectedSequence.id, { name: e.target.value })} />
                      {selectedSequence.mode === SequenceMode.AUTO && (
                        <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
                          <span className="text-[9px] font-black text-slate-500 uppercase">Override BPM</span>
                          <input type="number" placeholder="Song BPM" value={selectedSequence.bpm || ''} onChange={(e) => updateSequence(selectedSequence.id, { bpm: parseInt(e.target.value) || undefined })} className="w-12 bg-transparent text-[10px] font-bold text-center outline-none" />
                        </div>
                      )}
                    </div>
                    <select value={selectedSequence.mode} onChange={(e) => updateSequence(selectedSequence.id, { mode: e.target.value as SequenceMode })} className="bg-slate-800 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-slate-700 outline-none hover:bg-slate-700 transition-colors cursor-pointer">
                      <option value={SequenceMode.STEP}>Sequential (STEP)</option>
                      <option value={SequenceMode.AUTO}>Timeline (AUTO)</option>
                    </select>
                  </div>

                  {selectedSequence.mode === SequenceMode.STEP ? (
                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                         <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Step Strip (Sequential Order)</h4>
                         <p className="text-[9px] text-slate-500 font-bold uppercase">Click trigger to cycle steps</p>
                      </div>
                      <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
                        <div className="flex gap-4 items-start min-h-full">
                          {selectedSequence.items.map((item, idx) => (
                            <div key={item.id} className="flex-shrink-0 w-72 bg-slate-800/20 p-5 rounded-3xl border border-slate-800/50 hover:border-indigo-500/30 transition-all group/card relative">
                              <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-2">
                                <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full uppercase tracking-widest">Step {String(idx + 1).padStart(2, '0')}</span>
                                <button onClick={() => updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id)})} className="opacity-0 group-hover/card:opacity-100 p-1 text-slate-600 hover:text-rose-500 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg></button>
                              </div>
                              <CompactItemEditor 
                                item={item} 
                                presets={song.presets} 
                                isStepView 
                                onUpdate={(u) => updateSequence(selectedSequence.id, { items: selectedSequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})} 
                                onDelete={() => {}} 
                              />
                            </div>
                          ))}
                          <button 
                            onClick={() => updateSequence(selectedSequence.id, { items: [...(selectedSequence.items || []), { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: 0, overrideDuration: null, overrideDurationUnit: 'ms' }] })}
                            className="flex-shrink-0 w-72 h-[260px] border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center gap-3 text-slate-600 hover:text-indigo-400 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all group"
                          >
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-lg">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <span className="text-xs font-black uppercase tracking-widest">Add Next Step</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
                        <div className="flex items-center gap-6">
                          <div className="flex flex-col">
                            <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Sequence Timeline</h4>
                            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter">Current Snap: {SNAP_OPTIONS.find(o => o.value === currentSnap)?.label || 'Custom'}</p>
                          </div>
                          
                          <div className="flex items-center gap-2 bg-slate-950/50 p-1 rounded-xl border border-slate-800">
                             <span className="text-[8px] font-black text-slate-500 uppercase px-2">Snap</span>
                             <select 
                                value={currentSnap} 
                                onChange={(e) => updateSequence(selectedSequence.id, { gridSnap: parseFloat(e.target.value) })}
                                className="bg-slate-800 text-[10px] font-bold px-2 py-1 rounded-lg outline-none border border-slate-700 cursor-pointer hover:border-indigo-500 transition-colors"
                             >
                               {SNAP_OPTIONS.map(opt => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
                             </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => updateSequence(selectedSequence.id, { items: [...selectedSequence.items, { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: 0, overrideDuration: null, overrideDurationUnit: 'ms' }] })} className="text-[10px] bg-indigo-600 px-5 py-2.5 rounded-xl font-black uppercase text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/20">Add at Beat 0</button>
                        </div>
                      </div>
                      
                      <div 
                        className="relative flex-1 bg-slate-950/50 rounded-2xl border border-slate-800 overflow-auto custom-scrollbar group cursor-crosshair" 
                        onClick={handleTimelineClick}
                        onMouseMove={handleTimelineMouseMove}
                        onMouseLeave={() => setHoverBeat(null)}
                      >
                        <div className="absolute inset-0 flex pointer-events-none" style={{ width: `${TIMELINE_BEATS * BEAT_WIDTH}px`, height: '100%' }}>
                          {Array.from({ length: TIMELINE_BEATS }).map((_, i) => (
                            <div key={i} className={`flex-shrink-0 h-full border-r border-slate-800/50 relative ${i % 4 === 0 ? 'bg-white/5' : ''}`} style={{ width: `${BEAT_WIDTH}px` }}>
                              <span className="absolute top-1 left-1 text-[9px] font-black text-slate-700">{i}</span>
                              {/* Snap Divisions Rendering */}
                              {currentSnap < 1 && Array.from({ length: Math.round(1 / currentSnap) - 1 }).map((_, subI) => (
                                <div 
                                  key={subI} 
                                  className="absolute h-full border-r border-slate-800/10" 
                                  style={{ left: `${(subI + 1) * currentSnap * BEAT_WIDTH}px` }} 
                                />
                              ))}
                            </div>
                          ))}
                        </div>

                        {hoverBeat !== null && (
                          <div 
                            className="absolute inset-y-0 w-0.5 bg-indigo-500/40 flex items-center justify-center pointer-events-none z-20"
                            style={{ left: `${hoverBeat * BEAT_WIDTH}px` }}
                          >
                            <div className="absolute top-2 bg-indigo-600 text-[8px] font-black px-2 py-1 rounded text-white shadow-xl ring-1 ring-white/20 whitespace-nowrap">Beat {hoverBeat}</div>
                            <div className="absolute inset-y-0 w-[4px] bg-indigo-500/10 -ml-[2px]"></div>
                          </div>
                        )}

                        <div className="relative h-full min-h-[400px]" style={{ width: `${TIMELINE_BEATS * BEAT_WIDTH}px` }}>
                          {selectedSequence.items.map((item) => (
                            <TimelineItem 
                              key={item.id} 
                              item={item} 
                              presets={song.presets} 
                              BEAT_WIDTH={BEAT_WIDTH}
                              lane={itemLanes[item.id] || 0}
                              onUpdate={(u) => updateSequence(selectedSequence.id, { items: selectedSequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})}
                              onDelete={() => updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id)})}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40"><p className="text-lg font-black uppercase tracking-[0.3em]">Select a sequence</p></div>}
            </div>
          </div>
        )}
        {activeSubTab === 'mappings' && (
           <div className="bg-slate-900 rounded-3xl border border-slate-800 p-10 h-full flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between mb-10">
              <div>
                <h3 className="text-2xl font-black text-white">Trigger Control Surface</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Bind ranges or single inputs to actions</p>
              </div>
              <button onClick={() => onUpdateSong({ ...song, mappings: [...song.mappings, { id: uuidv4(), triggerType: 'keyboard', isRange: false, triggerValue: '', triggerChannel: 0, triggerStart: '', triggerEnd: '', actionType: 'preset', actionTargetId: '', isEnabled: true }] })} className="text-[10px] bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-white hover:bg-indigo-500 transition-all shadow-lg">+ New Mapping</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
                {song.mappings.map(map => (
                  <div key={map.id} className={`grid grid-cols-[80px_120px_220px_1.5fr_60px] gap-4 bg-slate-800/15 border border-slate-800/50 p-6 rounded-3xl items-center hover:bg-slate-800/25 transition-all mb-4 ${!map.isEnabled && 'opacity-40 grayscale'}`}>
                    <div className="flex flex-col items-center gap-1">
                       <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Active</label>
                       <input type="checkbox" checked={map.isEnabled} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, isEnabled: e.target.checked} : m)})} className="w-5 h-5 accent-indigo-500 cursor-pointer" />
                    </div>
                    <div className="flex flex-col gap-1">
                       <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Source</label>
                       <select value={map.triggerType} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerType: e.target.value as any} : m)})} className="bg-slate-900 text-[10px] font-black p-2 rounded-xl border border-slate-700 outline-none">
                         <option value="keyboard">Keyboard</option>
                         <option value="midi">MIDI</option>
                       </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center mb-0.5">
                        <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Input Range</label>
                        <button onClick={() => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, isRange: !m.isRange} : m)})} className={`text-[7px] px-1 rounded font-black uppercase tracking-tighter transition-colors ${map.isRange ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>{map.isRange ? 'Range' : 'Single'}</button>
                      </div>
                      <div className="flex gap-2">
                        {map.isRange ? (
                          <div className="grid grid-cols-2 gap-1 flex-1">
                            <input type="text" value={map.triggerStart || ''} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerStart: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})} placeholder="St" className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none text-center min-w-0" />
                            <input type="text" value={map.triggerEnd || ''} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerEnd: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})} placeholder="End" className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none text-center min-w-0" />
                          </div>
                        ) : (
                          <input type="text" value={map.triggerValue} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})} placeholder="Key" className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none focus:border-indigo-500 text-center flex-1 min-w-0" />
                        )}
                        {map.triggerType === 'midi' && (
                          <div className="flex flex-col min-w-[50px]">
                            <select value={map.triggerChannel} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerChannel: parseInt(e.target.value)} : m)})} className="bg-slate-900 text-[9px] font-black p-2 rounded-xl border border-slate-700 outline-none h-full">
                              <option value={0}>All</option>
                              {Array.from({length: 16}).map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                       <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Action Target</label>
                       <select value={map.actionTargetId} onChange={(e) => { const targetId = e.target.value; const isSequence = song.sequences.some(s => s.id === targetId); onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, actionTargetId: targetId, actionType: isSequence ? 'sequence' : 'preset'} : m)}); }} className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none"><option value="">Select Target...</option><optgroup label="Presets">{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup><optgroup label="Sequences">{song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select>
                    </div>
                    <button onClick={() => onUpdateSong({...song, mappings: song.mappings.filter(m => m.id !== map.id)})} className="p-3 text-slate-600 hover:text-rose-500 self-center transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
