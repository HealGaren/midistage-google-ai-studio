
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Song, NotePreset, Sequence, InputMapping, SequenceMode, SequenceItem, NoteItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface EditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const midiToNoteName = (midi: number) => {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};

const KeyboardVisualizer: React.FC<{ notes: NoteItem[] }> = ({ notes }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
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
      const isActive = activePitches.includes(p);
      arr.push({ pitch: p, isBlack, isActive });
    }
    return arr;
  }, [displayStart, displayEnd, activePitches]);

  return (
    <div className="relative bg-slate-950 border border-slate-800 rounded-3xl p-4 shadow-2xl overflow-hidden group">
      <div className="flex items-center justify-between mb-4 px-2">
        <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Chord Structure Preview</h5>
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
              className={`flex-shrink-0 relative transition-all duration-300 ${k.isBlack ? 'w-6 h-24 -mx-3 z-10 rounded-b-md border border-slate-800 shadow-lg' : 'w-10 h-40 z-0 rounded-b-lg border border-slate-800'} ${k.isBlack ? (k.isActive ? 'bg-indigo-500 border-indigo-400' : 'bg-slate-900') : (k.isActive ? 'bg-indigo-600 border-indigo-400 shadow-[inset_0_-8px_0_rgba(255,255,255,0.1)]' : 'bg-white')}`}
            >
              {!k.isBlack && k.pitch % 12 === 0 && (
                <div className="absolute bottom-2 left-0 right-0 text-center text-[9px] font-black text-slate-400 pointer-events-none uppercase">{midiToNoteName(k.pitch)}</div>
              )}
              {k.isActive && (
                <div className="absolute inset-x-1 bottom-1 flex flex-col items-center justify-end h-full pb-4 pointer-events-none">
                   <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]"></div>
                   <span className="text-[8px] font-black mt-2 text-white">{midiToNoteName(k.pitch)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ song, onUpdateSong }) => {
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'sequences' | 'mappings'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(song.presets[0]?.id || null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(song.sequences[0]?.id || null);

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

  const updateStep = (seqId: string, stepId: string, updates: Partial<SequenceItem>) => {
    const seq = song.sequences.find(s => s.id === seqId);
    if (!seq) return;
    updateSequence(seqId, { items: seq.items.map(i => i.id === stepId ? { ...i, ...updates } : i) });
  };

  const selectedPreset = song.presets.find(p => p.id === selectedPresetId);
  const selectedSequence = song.sequences.find(s => s.id === selectedSequenceId);

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <input 
            type="text" 
            value={song.name} 
            onChange={(e) => onUpdateSong({ ...song, name: e.target.value })}
            className="bg-transparent text-3xl font-black focus:outline-none border-b-2 border-transparent focus:border-indigo-600 transition-colors py-1 flex-1"
          />
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-2.5 rounded-2xl border border-slate-800 shadow-2xl">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">GLOBAL BPM</span>
            <input 
              type="number" 
              value={song.bpm} 
              onChange={(e) => onUpdateSong({ ...song, bpm: parseInt(e.target.value) || 120 })}
              className="w-16 bg-slate-800 rounded-xl px-2 py-1 text-sm font-bold focus:outline-none text-center"
            />
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
                  <KeyboardVisualizer notes={selectedPreset.notes} />
                  <div className="space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Note List</h4>
                      <button onClick={() => updatePreset(selectedPreset.id, { notes: [...selectedPreset.notes, { id: uuidv4(), pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: null }] })} className="text-[10px] bg-indigo-600 px-5 py-2.5 rounded-xl font-black uppercase tracking-widest text-white">+ Add Note</button>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedPreset.notes.map(note => (
                        <div key={note.id} className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_50px] gap-6 bg-slate-800/20 p-5 rounded-2xl border border-slate-800/50 items-center">
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Pitch</label><div className="flex items-center gap-2"><input type="number" value={note.pitch} onChange={(e) => updateNote(selectedPreset.id, note.id, { pitch: parseInt(e.target.value) || 0 })} className="w-12 bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /><span className="text-xs font-black text-indigo-400 w-8">{midiToNoteName(note.pitch)}</span></div></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Velocity</label><input type="number" step="0.05" value={note.velocity} onChange={(e) => updateNote(selectedPreset.id, note.id, { velocity: parseFloat(e.target.value) || 0 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Channel</label><input type="number" value={note.channel} onChange={(e) => updateNote(selectedPreset.id, note.id, { channel: parseInt(e.target.value) || 1 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5"><label className="text-[9px] text-slate-500 font-black uppercase">Pre-Delay</label><input type="number" value={note.preDelay} onChange={(e) => updateNote(selectedPreset.id, note.id, { preDelay: parseInt(e.target.value) || 0 })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none" /></div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-2">Duration {note.duration === null && <span className="bg-emerald-500/20 text-emerald-400 px-1 rounded text-[7px] border border-emerald-500/30">HOLD</span>}</label>
                            <input type="number" placeholder="HOLD (Empty)" value={note.duration === null ? '' : note.duration} onChange={(e) => updateNote(selectedPreset.id, note.id, { duration: e.target.value === '' ? null : parseInt(e.target.value) })} className="bg-slate-900 text-xs font-bold p-1.5 rounded-lg border border-slate-700 focus:border-indigo-500 outline-none placeholder:text-slate-700" />
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
              <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, sequences: [...song.sequences, {id, name: "New Sequence", mode: SequenceMode.STEP, items: []}]}); setSelectedSequenceId(id); }} className="w-full py-4 mb-3 bg-indigo-600 rounded-2xl text-[10px] font-black uppercase tracking-widest">+ New Sequence</button>
              {song.sequences.map(s => (
                <div key={s.id} onClick={() => setSelectedSequenceId(s.id)} className={`group flex items-center justify-between p-3.5 rounded-2xl cursor-pointer border ${selectedSequenceId === s.id ? 'bg-indigo-600/10 border-indigo-500/50' : 'border-transparent text-slate-400'}`}>
                  <div className="flex flex-col min-w-0"><span className="text-sm font-bold truncate">{s.name}</span><span className="text-[9px] font-black uppercase opacity-40">{s.mode} Mode</span></div>
                  <button onClick={(e) => { e.stopPropagation(); const next = song.sequences.filter(x => x.id !== s.id); onUpdateSong({...song, sequences: next}); if(selectedSequenceId===s.id) setSelectedSequenceId(next[0]?.id || null); }}><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
              ))}
            </div>
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 overflow-y-auto">
              {selectedSequence ? (
                <>
                  <div className="flex items-center justify-between mb-8"><input className="bg-transparent font-black text-3xl text-white focus:outline-none" value={selectedSequence.name} onChange={(e) => updateSequence(selectedSequence.id, { name: e.target.value })} /><select value={selectedSequence.mode} onChange={(e) => updateSequence(selectedSequence.id, { mode: e.target.value as SequenceMode })} className="bg-slate-800 text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl border border-slate-700"><option value={SequenceMode.STEP}>Sequential</option><option value={SequenceMode.AUTO}>Auto</option></select></div>
                  <div className="space-y-6"><div className="flex items-center justify-between border-b border-slate-800 pb-3"><h4 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Steps</h4><button onClick={() => updateSequence(selectedSequence.id, { items: [...selectedSequence.items, { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', delay: 100 }] })} className="text-[10px] bg-indigo-600 px-5 py-2.5 rounded-xl font-black uppercase text-white">+ Add Step</button></div>
                    {selectedSequence.items.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-[50px_1fr_180px_60px] gap-6 bg-slate-800/20 p-5 rounded-2xl border border-slate-800/50 items-center">
                        <span className="text-lg font-black text-slate-700 text-center">{idx + 1}</span>
                        <select value={item.targetId} onChange={(e) => updateStep(selectedSequence.id, item.id, { targetId: e.target.value })} className="bg-slate-900 text-sm font-bold p-2.5 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none"><option value="">None</option>{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                        <div className="flex items-center gap-3"><input type="number" value={item.delay} onChange={(e) => updateStep(selectedSequence.id, item.id, { delay: parseInt(e.target.value) || 0 })} className="w-20 bg-slate-900 text-sm font-bold p-2.5 rounded-xl border border-slate-700 outline-none text-center" /><span className="text-[9px] font-black text-slate-600 uppercase">ms</span></div>
                        <button onClick={() => updateSequence(selectedSequence.id, { items: selectedSequence.items.filter(i => i.id !== item.id) })} className="p-2.5 text-slate-600 hover:text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                      </div>
                    ))}
                  </div>
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
              <button onClick={() => onUpdateSong({ ...song, mappings: [...song.mappings, { id: uuidv4(), triggerType: 'keyboard', isRange: false, triggerValue: '', triggerStart: '', triggerEnd: '', actionType: 'preset', actionTargetId: '', isEnabled: true }] })} className="text-[10px] bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-white">+ New Mapping</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
                {song.mappings.map(map => (
                  <div key={map.id} className={`grid grid-cols-[80px_120px_200px_1.5fr_60px] gap-4 bg-slate-800/15 border border-slate-800/50 p-6 rounded-3xl items-center hover:bg-slate-800/25 transition-all mb-4 ${!map.isEnabled && 'opacity-40 grayscale'}`}>
                    {/* Enable Toggle */}
                    <div className="flex flex-col items-center gap-1">
                       <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Active</label>
                       <input 
                         type="checkbox" 
                         checked={map.isEnabled} 
                         onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, isEnabled: e.target.checked} : m)})}
                         className="w-5 h-5 accent-indigo-500 cursor-pointer"
                       />
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
                        <button 
                          onClick={() => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, isRange: !m.isRange} : m)})}
                          className={`text-[7px] px-1 rounded font-black uppercase tracking-tighter transition-colors ${map.isRange ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}
                        >
                          {map.isRange ? 'Range' : 'Single'}
                        </button>
                      </div>
                      
                      {map.isRange ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text" 
                            value={map.triggerStart || ''} 
                            onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerStart: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})}
                            placeholder="Start"
                            className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none text-center"
                          />
                          <input 
                            type="text" 
                            value={map.triggerEnd || ''} 
                            onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerEnd: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})}
                            placeholder="End"
                            className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none text-center"
                          />
                        </div>
                      ) : (
                        <input 
                          type="text" 
                          value={map.triggerValue} 
                          onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: map.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value} : m)})} 
                          placeholder="Key or MIDI #" 
                          className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none focus:border-indigo-500 text-center w-full" 
                        />
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                       <label className="text-[8px] text-slate-600 font-black uppercase tracking-tighter">Action Target</label>
                       <select value={map.actionTargetId} onChange={(e) => { const targetId = e.target.value; const isSequence = song.sequences.some(s => s.id === targetId); onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, actionTargetId: targetId, actionType: isSequence ? 'sequence' : 'preset'} : m)}); }} className="bg-slate-900 text-[10px] font-bold p-2 rounded-xl border border-slate-700 outline-none"><option value="">Select Target...</option><optgroup label="Presets">{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup><optgroup label="Sequences">{song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select>
                    </div>

                    <button onClick={() => onUpdateSong({...song, mappings: song.mappings.filter(m => m.id !== map.id)})} className="p-3 text-slate-600 hover:text-rose-500 self-center"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
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
